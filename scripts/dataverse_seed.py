# /// script
# requires-python = ">=3.11"
# dependencies = ["msal>=1.31", "requests>=2.32"]
# ///
"""Create Dataverse records from a declarative JSON file.

`pac` can only import packaged data zips, so this covers ad-hoc seeding and mock data.

Data file format:
  [ { "entitySet": "faf001_bpinstances", "attributes": { "name": "value" } } ]

Usage:
  uv run scripts/dataverse_seed.py --url https://org.crm.dynamics.com --data <records.json>
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys

import msal
import requests

DEFAULT_CLIENT_ID = "51f81489-12ee-4a9e-aaae-a2591f45987d"
CACHE_PATH = pathlib.Path(__file__).resolve().parent.parent / ".secrets" / "msal_cache.json"


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


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--url", required=True, help="Dataverse environment URL")
    parser.add_argument("--data", required=True, type=pathlib.Path, help="JSON file describing the records")
    parser.add_argument("--client-id", default=DEFAULT_CLIENT_ID, help="Entra public client ID used for sign-in")
    args = parser.parse_args()

    records = json.loads(args.data.read_text(encoding="utf-8"))
    base = f"{args.url.rstrip('/')}/api/data/v9.2"

    session = requests.Session()
    session.headers.update({
        "Authorization": f"Bearer {acquire_token(args.url.rstrip('/'), args.client_id)}",
        "Accept": "application/json",
        "Content-Type": "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        "Prefer": "return=representation",
    })

    for record in records:
        entity_set = record["entitySet"]
        response = session.post(f"{base}/{entity_set}", json=record["attributes"])
        if not response.ok:
            print(f"! {entity_set}: {response.status_code}\n{response.text}", file=sys.stderr)
            response.raise_for_status()

        body = response.json()
        primary_id = next((v for k, v in body.items() if k.endswith("id") and isinstance(v, str)), "?")
        print(f"+ {entity_set}: {primary_id}")


if __name__ == "__main__":
    main()
