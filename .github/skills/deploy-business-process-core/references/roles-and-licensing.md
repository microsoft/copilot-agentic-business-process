## Microsoft Platform Roles Involved

| Role | Required access | When required |
| --- | --- | --- |
| Power Platform environment administrator | **System Administrator in the target Dataverse environment**, or a validated deployment role. Environment Admin alone is insufficient for this Dataverse deployment. | Import solutions, configure security roles/application users, repair agent associations, and set environment variables. |
| Entra identity administrator | Approved app-registration/service-principal creation rights. **Application Developer** supports creation as owner; **Cloud Application Administrator** is a broader alternative. | Create the runtime identity and credential. Dataverse System Administrator does not grant these Entra permissions. |
| Power Platform tenant-wide administrator | **Power Platform Administrator**, or another eligible provisioning identity under [Appendix B](./DEPLOYMENT.md#appendix-b--creating-an-environment). | Environment provisioning or tenant-level changes only. Use an existing platform administrator when handled externally. |

## Application Users and Licensing

- **Deployment Administrator:** The person running this guide, directly or through a coding agent using an authorized deployment identity.
- **Core service principal:** The runtime Entra application represented by a Dataverse application user. Its Dataverse connection uses the `Business-Process-User` security role, not System Administrator.
- **Business users:** People running Workflow Console or using the monitoring agent. Each uses their own account and approved Dataverse permissions.
- **Makers:** Users maintaining the agents, plug-ins, APIs, and Workflow Console.

| License | Users requiring it |
| --- | --- |
| Power Apps Premium | Business users running Workflow Console; Makers and Deployment Administrator building or testing the app in the target environment. |
| Copilot Studio user license (`VIRTUAL_AGENT_USL`) | Makers and Deployment Administrator authoring or publishing agents. |
| Microsoft Teams Enterprise or a Microsoft 365 subscription that includes Teams | Users accessing the monitoring agent in Teams. |

1. Confirm available seats and approved assignments with the licensing administrator.
2. Verify app/flow licensing for the Core service-principal connection; do not assign it human-user licenses.
3. Confirm prepaid or PAYG Copilot Credits for the monitoring agent's GitHub Copilot harness; do not substitute Microsoft 365 Copilot user licenses.
4. Configure business-process-specific users through the consuming solution's deployment.

