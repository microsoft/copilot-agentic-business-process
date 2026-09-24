## Microsoft Platform Roles Involved

| Role | Required access | When required |
| --- | --- | --- |
| Microsoft 365 Administrator | **User Administrator** for user creation/license assignment; **Exchange Administrator** for mailbox creation/delegation, or approved delegated permissions. | Only for the operator performing these tasks; use existing Microsoft 365 administrators when handled externally. |
| Power Platform environment administrator | **System Administrator in the target Dataverse environment**, or a validated deployment role. Environment Admin alone is insufficient for this Dataverse deployment. | For the operator importing solutions and configuring environment roles, application users, and teams. |
| Power Platform tenant-wide administrator | **Power Platform Administrator**, or another eligible provisioning identity under [Core Appendix B](../../../../core/solution/DEPLOYMENT.md#appendix-b--creating-an-environment). | Only for environment provisioning or tenant-level changes. Use a separate platform administrator by default; the deployment operator does not need this role for an externally supplied environment. |

## Application Users and Licensing

- **Deployment Administrator:** The person running this guide, directly or through a coding agent using an authorized deployment identity.
- **Automation User:** The dedicated account used by OrderProcessing flows for Outlook/Teams connections and, when approved, the agent-node connection. Dataverse operations use the Core service principal; record the flow owner separately.
- **Order Processing Users:** Order Approvers approve orders; Order Reviewers review orders; Backoffice operators monitor execution and access logs. Each uses their own account.
- **Makers:** The users maintaining the solution's agents, flows, plug-ins, APIs, and Workflow Console.


| License | Users requiring it |
| --- | --- |
| Exchange Online Plan 1 or Plan 2, standalone or included in a Microsoft 365 subscription | Automation User using the Outlook connection. |
| Microsoft Teams Enterprise or a Microsoft 365 subscription that includes Teams | Automation User using the Teams connection; Order Processing Users receiving Teams notifications. |
| Copilot Studio user license (`VIRTUAL_AGENT_USL`) | Automation User using the agent-node connection, before activation; Makers and Deployment Administrator authoring or publishing agents. |
| Power Apps Premium | Order Processing Users running Workflow Console; Makers and Deployment Administrator building or testing the app in the target environment. |
| Power Automate Premium | Owner of standalone premium Power Automate flows; Makers and Deployment Administrator authoring those flows. Not required for the solution's Copilot Credit-billed workflows. |
| Power Automate Process (alternative to per-user Power Automate Premium licensing for execution) | Assigned to standalone flows or a flow group, not users. Not required for the solution's Copilot Credit-billed workflows. |

1. Confirm available seats and approved assignments with the licensing administrator.
2. Configure users in Steps 4 and 6; verify the automation user before activation.
3. Confirm standalone flow-owner Premium or flow-level Process coverage where applicable.
4. Confirm prepaid or PAYG Copilot Credits for agents/workflows using the GitHub Copilot harness; do not substitute Microsoft 365 Copilot user licenses.

