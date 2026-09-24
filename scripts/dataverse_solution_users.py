# /// script
# requires-python = ">=3.11"
# dependencies = ["requests>=2.32"]
# ///
"""List and select environment users with active Power Apps per-user plan evidence.

Read-only by default. Explicit --apply creates owner teams and adds selected members.
Never provisions users, licenses, roles, or app sharing.
Uses the current Azure CLI login and requires explicit tenant/organization IDs.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
from urllib.parse import urlparse
from uuid import UUID

import requests

PREMIUM_PLAN_ID = "ea2cf03b-ac60-46ae-9c1d-eeaeb63cec86"
GRAPH_URL = "https://graph.microsoft.com/v1.0"


def az_json(*arguments: str):
    executable = shutil.which("az")
    if not executable:
        raise RuntimeError("Azure CLI is required; sign in with az login first.")
    result = subprocess.run(
        [executable, *arguments, "--output", "json"],
        capture_output=True, text=True, check=False,
    )
    if result.returncode:
        raise RuntimeError("Azure CLI command failed; check login and target tenant.")
    return json.loads(result.stdout)


class Reader:
    def __init__(self, base: str, token: str):
        self.base = base.rstrip("/")
        self.session = requests.Session()
        self.session.headers.update({"Authorization": f"Bearer {token}", "Accept": "application/json"})

    def get(self, path: str, params=None):
        url = path if path.startswith("https://") else f"{self.base}/{path}"
        if not url.startswith(self.base + "/"):
            raise RuntimeError("Refusing an unexpected pagination URL.")
        response = self.session.get(url, params=params, timeout=60, allow_redirects=False)
        if response.status_code == 404:
            return None
        if response.status_code != 200:
            raise RuntimeError(f"Read failed (HTTP {response.status_code}); check API permissions.")
        return response.json()

    def collection(self, path: str, params=None) -> list[dict]:
        records = []
        while path:
            page = self.get(path, params)
            if page is None:
                raise RuntimeError("Required collection was not found.")
            records.extend(page["value"])
            path = page.get("@odata.nextLink", "")
            params = None
        return records


def license_evidence(user: dict, details: list[dict], subscriptions: dict) -> list[str]:
    if user.get("accountEnabled") is not True or user.get("userType") != "Member":
        return []
    enabled = any(
        plan.get("servicePlanId", "").lower() == PREMIUM_PLAN_ID
        and plan.get("capabilityStatus") == "Enabled"
        for plan in user.get("assignedPlans", [])
    )
    if not enabled:
        return []
    evidence = []
    for license_detail in details:
        subscription = subscriptions.get(license_detail["skuId"].lower(), {})
        if subscription.get("capabilityStatus") != "Enabled":
            continue
        if any(
            plan.get("servicePlanId", "").lower() == PREMIUM_PLAN_ID
            and plan.get("provisioningStatus") == "Success"
            for plan in license_detail.get("servicePlans", [])
        ):
            evidence.append(license_detail["skuPartNumber"])
    return sorted(set(evidence))


def find_candidates(dataverse: Reader, graph: Reader) -> tuple[list[dict], int]:
    subscriptions = {
        row["skuId"].lower(): row
        for row in graph.collection("subscribedSkus", {"$select": "skuId,capabilityStatus"})
    }
    users = dataverse.collection("systemusers", {
        "$select": "systemuserid,fullname,azureactivedirectoryobjectid,internalemailaddress",
        "$filter": "isdisabled eq false and accessmode eq 0 and applicationid eq null "
                   "and azureactivedirectoryobjectid ne null and internalemailaddress ne null",
    })
    candidates = []
    for environment_user in users:
        object_id = str(UUID(environment_user["azureactivedirectoryobjectid"]))
        user = graph.get(f"users/{object_id}", {
            "$select": "id,displayName,userPrincipalName,accountEnabled,userType,assignedPlans",
        })
        if not user or user.get("accountEnabled") is not True or user.get("userType") != "Member":
            continue
        details = graph.collection(f"users/{object_id}/licenseDetails")
        evidence = license_evidence(user, details, subscriptions)
        if evidence:
            candidates.append({
                "userPrincipalName": user["userPrincipalName"],
                "displayName": user.get("displayName"),
                "entraId": object_id,
                "systemUserId": environment_user["systemuserid"],
                "licenseSkus": evidence,
            })
    return sorted(candidates, key=lambda user: user["userPrincipalName"].lower()), len(users)


def parse_selection(value: str, count: int) -> list[int]:
    if not value.strip():
        return []
    try:
        numbers = [int(part.strip()) for part in value.split(",")]
    except ValueError as error:
        raise ValueError("Enter comma-separated row numbers or Enter for none.") from error
    if any(number < 1 or number > count for number in numbers):
        raise ValueError(f"Choose row numbers between 1 and {count}.")
    return sorted(set(number - 1 for number in numbers))


def ensure_teams(dataverse: Reader, names: list[str], business_unit: str,
                 administrator: str, members: list[dict]) -> None:
    def post(path: str, payload: dict):
        response = dataverse.session.post(
            f"{dataverse.base}/{path}", json=payload,
            headers={"Prefer": "return=representation"}, timeout=60, allow_redirects=False,
        )
        if response.status_code not in (200, 201, 204):
            raise RuntimeError(f"Dataverse write failed (HTTP {response.status_code}); inspect current state before retrying.")
        return response.json() if response.content else None

    planned = []
    for name in dict.fromkeys(names):
        teams = dataverse.collection("teams", {
            "$select": "teamid,name,teamtype,_businessunitid_value,_administratorid_value",
            "$filter": "name eq '" + name.replace("'", "''") + "'",
        })
        if len(teams) > 1:
            raise RuntimeError(f"Ambiguous team name: {name}")
        team = teams[0] if teams else None
        if team and (team["teamtype"] != 0
                     or team["_businessunitid_value"].lower() != business_unit.lower()
                     or team["_administratorid_value"].lower() != administrator.lower()):
            raise RuntimeError(f"Existing team settings differ from the approved settings: {name}")
        planned.append((name, team))
    for name, team in planned:
        if not team:
            team = post("teams", {
                "name": name, "teamtype": 0,
                "businessunitid@odata.bind": f"/businessunits({business_unit})",
                "administratorid@odata.bind": f"/systemusers({administrator})",
            })
            if not team:
                raise RuntimeError("Team creation returned no representation; inspect current state before retrying.")
            print(f"Created owner team: {name} ({team['teamid']})", flush=True)
        team_id = team["teamid"]
        membership_path = f"teams({team_id})/teammembership_association"
        existing = {row["systemuserid"].lower() for row in dataverse.collection(membership_path, {"$select": "systemuserid"})}
        wanted = {member["systemUserId"].lower() for member in members}
        missing = sorted(wanted - existing)
        if missing:
            post(f"teams({team_id})/Microsoft.Dynamics.CRM.AddMembersTeam", {
                "Members": [{"systemuserid": member_id} for member_id in missing],
            })
        verified = {row["systemuserid"].lower() for row in dataverse.collection(membership_path, {"$select": "systemuserid"})}
        if not wanted.issubset(verified):
            raise RuntimeError(f"Membership readback failed for {name}; inspect before retrying.")
        print(f"Verified {name}: {len(wanted)} selected member(s), {len(missing)} added. Team ID: {team_id}", flush=True)


def resolve_users(upns: list[str], candidates: list[dict]) -> list[dict]:
    by_upn = {user["userPrincipalName"].lower(): user for user in candidates}
    missing = [upn for upn in upns if upn.lower() not in by_upn]
    if missing:
        raise ValueError(f"Users are not eligible candidates: {', '.join(missing)}")
    return [by_upn[upn] for upn in dict.fromkeys(upn.lower() for upn in upns)]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tenant-id", required=True, type=UUID)
    parser.add_argument("--organization-id", required=True, type=UUID)
    parser.add_argument("--url", required=True)
    selection = parser.add_mutually_exclusive_group()
    selection.add_argument("--select", action="store_true", help="Prompt separately for each --team; read-only unless --apply is supplied")
    selection.add_argument("--users", nargs="+", help="User UPNs to add to exactly one --team")
    parser.add_argument("--include-deployer", action="store_true", help="Include the Dataverse WhoAmI user if it passes the same candidate checks")
    parser.add_argument("--team", action="append", default=[], help="Approved owner-team name; repeat for each team")
    parser.add_argument("--business-unit-id", type=UUID, help="Approved business unit for team creation")
    parser.add_argument("--apply", action="store_true", help="Create teams with the current Dataverse user as administrator and add selected members")
    args = parser.parse_args()
    if args.apply and (not args.team or not args.business_unit_id or not (args.select or args.users or args.include_deployer)):
        parser.error("--apply requires --team, --business-unit-id, and --select, --users, or --include-deployer.")
    if args.users and len(args.team) != 1:
        parser.error("--users requires exactly one --team; run a separate command for each team's user list.")
    if args.select and not args.team:
        parser.error("--select requires at least one --team.")
    if any(not name.strip() for name in args.team):
        parser.error("Team names cannot be blank.")
    parsed = urlparse(args.url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ("", "/"):
        parser.error("--url must be an HTTPS Dataverse origin without credentials, query, or path.")
    account = az_json("account", "show")
    if account["tenantId"].lower() != str(args.tenant_id):
        raise RuntimeError("Current Azure CLI tenant differs from --tenant-id. Select the correct tenant first.")
    resource = args.url.rstrip("/")
    readers = []
    try:
        for base, audience in ((f"{resource}/api/data/v9.2", resource), (GRAPH_URL, "https://graph.microsoft.com")):
            token = az_json("account", "get-access-token", "--tenant", str(args.tenant_id), "--resource", audience)
            readers.append(Reader(base, token["accessToken"]))
            del token
        dataverse, graph = readers
        identity = dataverse.get("WhoAmI")
        if not identity or identity["OrganizationId"].lower() != str(args.organization_id):
            raise RuntimeError("Dataverse organization differs from --organization-id.")
        candidates, checked = find_candidates(dataverse, graph)
        print(f"Tenant: {args.tenant_id}\nEnvironment: {resource}\nOrganization: {args.organization_id}")
        print(f"Checked {checked} enabled read/write environment users; {len(candidates)} have active per-user plan evidence.")
        print("Demo/trial subscriptions retain their own usage restrictions. This is not a production licensing determination.")
        print("Environment security-group eligibility, app sharing, and effective Dataverse roles still require verification.")
        for number, user in enumerate(candidates, 1):
            print(f"{number}. {user['displayName']} | {user['userPrincipalName']} | {', '.join(user['licenseSkus'])}")
        selected = []
        if args.include_deployer:
            deployer = next((user for user in candidates if user["systemUserId"].lower() == identity["UserId"].lower()), None)
            if not deployer:
                raise RuntimeError("Current Dataverse caller is not a licensed human candidate; no team writes performed.")
            selected.append(deployer)
            print(f"Included deployment administrator: {deployer['userPrincipalName']}")
        selections = {}
        for team_name in dict.fromkeys(args.team):
            members = list(selected)
            if args.users:
                members.extend(user for user in resolve_users(args.users, candidates) if user not in members)
            if args.select and candidates:
                while True:
                    try:
                        indexes = parse_selection(input(f"Select users for {team_name} (comma-separated numbers; Enter adds none): "), len(candidates))
                        break
                    except ValueError as error:
                        print(error)
                members.extend(candidates[index] for index in indexes if candidates[index] not in members)
            selections[team_name] = members
        if args.select or args.users or args.include_deployer:
            print(json.dumps({"selectedByTeam": selections}, indent=2))
        if args.apply and any(selections.values()):
            unit = dataverse.get(f"businessunits({args.business_unit_id})", {"$select": "businessunitid,name"})
            if not unit:
                raise RuntimeError("Approved business unit was not found.")
            print(f"Applying membership to {args.team} in {unit['name']}; current Dataverse caller is team administrator.", flush=True)
            for team_name, members in selections.items():
                if members:
                    ensure_teams(dataverse, [team_name], str(args.business_unit_id), identity["UserId"], members)
            print("Roles and app sharing unchanged. No solution import or runtime tests performed.")
        else:
            print("No cloud changes performed.")
    finally:
        for reader in readers:
            reader.session.headers.pop("Authorization", None)
            reader.session.close()


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, requests.RequestException, ValueError, EOFError, KeyboardInterrupt) as error:
        raise SystemExit(f"Stopped: {error}") from None