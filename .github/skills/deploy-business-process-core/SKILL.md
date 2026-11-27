---
name: deploy-business-process-core
description: 'Deploy BusinessProcessCore or check and validate an existing installation, including the Core prerequisite for OrderProcessing.'
---

# Deploy Business Process Core

Before executing any PowerShell, resolve the folder containing this `SKILL.md` to `$skillFolder`; do not hardcode its location.

Use **Installation Check** for check/verify/validate requests and OrderProcessing prerequisite checks. Otherwise use **Deploy**. Ask which workflow when unclear.

## Deploy

1. Ask whether a Dataverse environment exists. If yes, request its environment ID, not its name or organization ID. Wait for the answer.
2. Complete [technical prerequisites](./references/technical-prerequisites.md) from the repository root.
3. Read [roles/licensing](./references/roles-and-licensing.md); run [Core readiness](./references/readiness-report.md). Resolve failures and document unverified requirements.
4. Summarize applicable requirements; require explicit user confirmation of understanding and availability of access, licenses, Copilot Credits, and delegated support.
5. Follow [the deployment guide](./references/DEPLOYMENT.md). For new environments, verify active tenant-wide Power Platform Administrator, or active tenant-wide Global Administrator when Power Platform Administrator is absent, and obtain provisioning approval, proposing the default settings from Appendix B (Sandbox, `north-america`, USD, English, no security group) so the user only overrides what they know. Provision with `pac admin create --macro-region` (PAC 2.12.1+; never with `--region`), confirm the new ID and actual region, and rerun readiness. Run each bundled step script and require its `PASS` line before continuing; on `FAIL`, diagnose that step and rerun it.
6. Run **Installation Check** after the final import. Require every check to pass
7. Provide the deployment summary. Hand over the environment/organization IDs, solution and package versions, application-user/connection IDs, role verification, Workflow Console URL, and credential expiry/secure storage reference. Do not include secrets.


## Installation Check

1. Require an existing environment ID, tenant ID, organization ID/URL, and approved package/version and managed/unmanaged state. Do not provision an environment.
2. Complete [technical prerequisites](./references/technical-prerequisites.md) from the repository root.
3. Follow [installation verification](./references/installation-check.md); run the bundled script, which evaluates every criterion, including effective runtime privileges and the monitoring agent definitions.
4. Report Pass, Fail, or Not verified per criterion with brief evidence. Overall Pass requires all criteria to pass. Stop on failures/unknowns; obtain separate approval for repairs and rerun after repair. Do not import, publish, activate, or run business actions in this workflow.
