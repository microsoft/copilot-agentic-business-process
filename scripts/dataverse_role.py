# /// script
# requires-python = ">=3.11"
# dependencies = ["msal>=1.31", "requests>=2.32"]
# ///
"""Create a Dataverse security role and grant table privileges from a declarative spec.

`pac` has no command for security roles, so this fills that gap. It is additive and
idempotent: tables absent from the environment are skipped and reported. Use
--create-only before import to create the role without granting privileges, then
omit it after import to apply the complete specification.

Usage:
  uv run scripts/dataverse_role.py \
      --url https://org.crm.dynamics.com \
      --spec core/solution/config/security-role.business-process-user.json \
    [--create-only | --assign-app-id <application-id>]

Assign existing imported roles to teams (repeat --assign-team-role for each pair):
    uv run scripts/dataverse_role.py --url https://org.crm.dynamics.com \
            --assign-team-role "<team-name>" "<role-name>"
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys
from uuid import UUID

import msal
import requests

# Public client pre-authorised for Dataverse; override with --client-id if your tenant blocks it.
DEFAULT_CLIENT_ID = "51f81489-12ee-4a9e-aaae-a2591f45987d"
CACHE_PATH = pathlib.Path(__file__).resolve().parent.parent / ".secrets" / "msal_cache.json"

VALID_PRIVILEGES = {
    "Create", "Read", "Write", "Delete", "Append", "AppendTo", "Assign", "Share",
}
VALID_DEPTHS = {"Basic", "Local", "Deep", "Global"}


def acquire_token(resource: str, client_id: str) -> str:
    cache = msal.SerializableTokenCache()
    if CACHE_PATH.exists():
        cache.deserialize(CACHE_PATH.read_text(encoding="utf-8"))

    app = msal.PublicClientApplication(
        client_id,
        authority="https://login.microsoftonline.com/organizations",
        token_cache=cache,
    )
    scopes = [f"{resource}/.default"]

    result = None
    accounts = app.get_accounts()
    if accounts:
        result = app.acquire_token_silent(scopes, account=accounts[0])

    if not result:
        flow = app.initiate_device_flow(scopes=scopes)
        if "user_code" not in flow:
            sys.exit(f"Failed to start device flow: {flow.get('error_description', flow)}")
        print(flow["message"], flush=True)
        result = app.acquire_token_by_device_flow(flow)

    if "access_token" not in result:
        sys.exit(f"Authentication failed: {result.get('error_description', result)}")

    if cache.has_state_changed:
        CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        CACHE_PATH.write_text(cache.serialize(), encoding="utf-8")

    return result["access_token"]


class Dataverse:
    def __init__(self, base_url: str, token: str) -> None:
        self.base = f"{base_url.rstrip('/')}/api/data/v9.2"
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
            "OData-MaxVersion": "4.0",
            "OData-Version": "4.0",
        })

    def get(self, path: str, **kwargs) -> requests.Response:
        return self.session.get(f"{self.base}/{path}", **kwargs)

    def post(self, path: str, payload: dict, **kwargs) -> requests.Response:
        return self.session.post(f"{self.base}/{path}", json=payload, **kwargs)

    def root_business_unit(self) -> str:
        r = self.get("businessunits?$select=businessunitid&$filter=_parentbusinessunitid_value eq null")
        r.raise_for_status()
        return r.json()["value"][0]["businessunitid"]

    def find_or_create_role(self, name: str, business_unit_id: str) -> tuple[str, bool]:
        safe = name.replace("'", "''")
        r = self.get(f"roles?$select=roleid&$filter=name eq '{safe}' and _businessunitid_value eq {business_unit_id}")
        r.raise_for_status()
        existing = r.json()["value"]
        if existing:
            return existing[0]["roleid"], False

        r = self.post(
            "roles",
            {"name": name, "businessunitid@odata.bind": f"/businessunits({business_unit_id})"},
            headers={"Prefer": "return=representation"},
        )
        r.raise_for_status()
        return r.json()["roleid"], True

    def entity_privileges(self, logical_name: str) -> dict[str, str] | None:
        """Map PrivilegeType -> PrivilegeId, or None when the table does not exist."""
        r = self.get(f"EntityDefinitions(LogicalName='{logical_name}')?$select=LogicalName,Privileges")
        if r.status_code == 404:
            return None
        r.raise_for_status()
        return {p["PrivilegeType"]: p["PrivilegeId"] for p in r.json().get("Privileges", [])}

    def add_privileges(self, role_id: str, privileges: list[dict]) -> None:
        r = self.post(f"roles({role_id})/Microsoft.Dynamics.CRM.AddPrivilegesRole", {"Privileges": privileges})
        r.raise_for_status()

    def assign_role_to_app_user(self, application_id: str, role_id: str) -> str:
        r = self.get(f"systemusers?$select=systemuserid,fullname&$filter=applicationid eq {application_id}")
        r.raise_for_status()
        users = r.json()["value"]
        if not users:
            sys.exit(f"No Dataverse application user found for application id {application_id}.")

        user = users[0]
        r = self.post(
            f"systemusers({user['systemuserid']})/systemuserroles_association/$ref",
            {"@odata.id": f"{self.base}/roles({role_id})"},
        )
        # Dataverse returns 400 with a duplicate-key message when the role is already assigned.
        if r.status_code not in (204, 400):
            r.raise_for_status()
        return user.get("fullname") or user["systemuserid"]

    def resolve_team_role(self, team_name: str, role_name: str, business_unit_id: str | None = None) -> tuple[str, str]:
        identifiers = []
        for collection, name, identifier in (
            ("teams", team_name, "teamid"), ("roles", role_name, "roleid")
        ):
            safe_name = name.replace("'", "''")
            name_filter = f"name eq '{safe_name}'"
            if business_unit_id:
                name_filter += f" and _businessunitid_value eq {business_unit_id}"
            response = self.get(collection, params={
                "$select": f"{identifier},teamtype,_businessunitid_value" if collection == "teams" else identifier,
                "$filter": name_filter,
                "$top": 2,
            })
            response.raise_for_status()
            matches = response.json()["value"]
            if len(matches) != 1:
                scope = f"business unit {business_unit_id}" if business_unit_id else "the environment"
                raise RuntimeError(f"Expected exactly one {collection} record named '{name}' in {scope}; found {len(matches)}. No assignments made.")
            if collection == "teams":
                if matches[0]["teamtype"] != 0:
                    raise RuntimeError(f"Team '{team_name}' is not an owner team. No assignments made.")
                business_unit_id = str(UUID(matches[0]["_businessunitid_value"]))
            identifiers.append(str(UUID(matches[0][identifier])))
        return identifiers[0], identifiers[1]

    def team_has_role(self, team_id: str, role_id: str) -> bool:
        response = self.get(f"teams({team_id})/teamroles_association", params={
            "$select": "roleid", "$filter": f"roleid eq {role_id}", "$top": 1,
        })
        response.raise_for_status()
        return any(role["roleid"].lower() == role_id.lower() for role in response.json()["value"])

    def assign_roles_to_teams(self, assignments: list[list[str]], business_unit_id: str | None = None) -> None:
        if business_unit_id:
            business_unit_id = str(UUID(business_unit_id))
        pending = []
        for team_name, role_name in dict.fromkeys(tuple(pair) for pair in assignments):
            team_id, role_id = self.resolve_team_role(team_name, role_name, business_unit_id)
            assigned = self.team_has_role(team_id, role_id)
            pending.append((team_name, role_name, team_id, role_id, assigned))

        for team_name, role_name, team_id, role_id, assigned in pending:
            if assigned:
                print(f"Unchanged: '{team_name}' already has '{role_name}'.")
                continue
            response = self.post(
                f"teams({team_id})/teamroles_association/$ref",
                {"@odata.id": f"{self.base}/roles({role_id})"},
            )
            response.raise_for_status()
            if not self.team_has_role(team_id, role_id):
                raise RuntimeError(f"Assignment readback failed for '{team_name}' and '{role_name}'.")
            print(f"Assigned '{role_name}' to '{team_name}'.")


def load_spec(path: pathlib.Path) -> tuple[str, str, dict[str, list[str]], dict[str, str]]:
    spec = json.loads(path.read_text(encoding="utf-8"))
    role_name = spec["roleName"]
    depth = spec.get("depth", "Global")
    tables = spec["tables"]
    table_depths = spec.get("tableDepths", {})

    if depth not in VALID_DEPTHS:
        sys.exit(f"Invalid depth '{depth}'. Expected one of: {', '.join(sorted(VALID_DEPTHS))}")
    if not isinstance(table_depths, dict):
        sys.exit("tableDepths must be an object mapping table names to depths.")
    for table, table_depth in table_depths.items():
        if table not in tables:
            sys.exit(f"Depth override refers to unknown table '{table}'.")
        if not isinstance(table_depth, str) or table_depth not in VALID_DEPTHS:
            sys.exit(f"Table '{table}' has invalid depth '{table_depth}'.")
    for table, privs in tables.items():
        unknown = set(privs) - VALID_PRIVILEGES
        if unknown:
            sys.exit(f"Table '{table}' has unknown privileges: {', '.join(sorted(unknown))}")

    return role_name, depth, tables, table_depths


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--url", required=True, help="Dataverse environment URL")
    operation = parser.add_mutually_exclusive_group(required=True)
    operation.add_argument("--spec", type=pathlib.Path, help="Path to the role spec JSON")
    operation.add_argument("--assign-team-role", nargs=2, action="append", metavar=("TEAM", "ROLE"), help="Resolve an owner team and an existing role by exact record names, then assign; repeat for multiple pairs")
    parser.add_argument("--business-unit-id", type=UUID, help="Optional team lookup scope; otherwise derive the business unit from each team")
    parser.add_argument("--assign-app-id", help="Application (client) ID of a service principal to assign the role to")
    parser.add_argument("--create-only", action="store_true", help="With --spec, create or find the role without granting privileges or assigning users; retain existing privileges")
    parser.add_argument("--client-id", default=DEFAULT_CLIENT_ID, help="Entra public client ID used for sign-in")
    args = parser.parse_args()

    if args.create_only and (not args.spec or args.assign_app_id):
        parser.error("--create-only requires --spec and cannot use --assign-app-id.")

    if args.assign_team_role:
        if args.assign_app_id:
            parser.error("--assign-team-role cannot use --assign-app-id.")
        if any(not name.strip() for pair in args.assign_team_role for name in pair):
            parser.error("Team and role names cannot be blank.")
        dv = Dataverse(args.url, acquire_token(args.url.rstrip("/"), args.client_id))
        try:
            dv.assign_roles_to_teams(args.assign_team_role, str(args.business_unit_id) if args.business_unit_id else None)
        finally:
            dv.session.close()
        return
    if args.business_unit_id:
        parser.error("--business-unit-id is only supported with --assign-team-role.")

    role_name, depth, tables, table_depths = load_spec(args.spec)
    dv = Dataverse(args.url, acquire_token(args.url.rstrip("/"), args.client_id))

    role_id, created = dv.find_or_create_role(role_name, dv.root_business_unit())
    print(f"{'Created' if created else 'Found'} role '{role_name}' ({role_id})")

    if args.create_only:
        print("Create-only: no privileges granted or removed; no users assigned.")
        dv.session.close()
        return

    to_grant: list[dict] = []
    skipped: list[str] = []
    granted_tables: list[str] = []

    for table, wanted in tables.items():
        available = dv.entity_privileges(table)
        if available is None:
            skipped.append(table)
            continue

        missing = [p for p in wanted if p not in available]
        if missing:
            print(f"  ! {table}: not supported for {', '.join(missing)}")

        to_grant.extend(
            {"@odata.type": "Microsoft.Dynamics.CRM.RolePrivilege", "PrivilegeId": available[p], "Depth": table_depths.get(table, depth)}
            for p in wanted
            if p in available
        )
        granted_tables.append(table)

    if to_grant:
        dv.add_privileges(role_id, to_grant)
        print(f"Granted {len(to_grant)} privileges across {len(granted_tables)} tables:")
        for table in granted_tables:
            print(f"  + {table} (depth '{table_depths.get(table, depth)}')")

    if skipped:
        print(f"Skipped {len(skipped)} table(s) not present in this environment:")
        for table in skipped:
            print(f"  - {table}")
        print("  Re-run this command after the solution import to grant them.")

    if args.assign_app_id:
        who = dv.assign_role_to_app_user(args.assign_app_id, role_id)
        print(f"Assigned role to application user: {who}")


if __name__ == "__main__":
    main()
