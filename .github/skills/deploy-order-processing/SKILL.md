---
name: deploy-order-processing
description: 'Deploy OrderProcessing or check an existing installation'
---

# Deploy Order Processing

Before executing any PowerShell, resolve the folder containing this `SKILL.md` to `$skillFolder`; do not hardcode its location.


## Deploy

1. Ask for an existing Dataverse environment ID, not its name or organization ID. If none exists, stop and run deploy-business-process-core skill first. If an existing environment is available, use deploy-order-processing skill to check for existing business process core installation.
2. Complete [technical prerequisites](./references/technical-prerequisites.md) from the repository root.
3. Read [roles/licensing](./references/roles-and-licensing.md); run [OrderProcessing readiness](./references/readiness-report.md). Resolve failures and document unverified requirements.
4. Summarize applicable requirements; require explicit user confirmation of understanding and availability of access, licenses, Copilot Credits, and delegated support.
5. Follow [the deployment guide](./references/DEPLOYMENT.md)
6. Provide the deployment summary. Hand over the environment/organization IDs, solution and package versions, application-user/connection IDs, role verification, Workflow Console URL, sharedmailbox to use to send orders, a recap of allowed users and their teams and roles.

