# Business Process API

Shared Dataverse plug-in containing eleven Business Process Tracking Custom
Actions: eight reads and three writes. This document defines the consumer-facing
request, response, authorization, paging, and mutation contracts.

The provisioning JSON linked from each Action is the source of truth for Dataverse
parameter metadata. The C# services define validation and runtime behavior.

See [DEVELOPMENT.md](DEVELOPMENT.md) for repository extraction, setup, development,
test, build, package, and Dataverse installation guidance.

## Common Contract

All eleven APIs are synchronous, global/unbound Actions (`isfunction = false`,
`bindingtype = 0`). Invoke them with HTTP `POST` or with an SDK
`OrganizationRequest`. Parameter names are case-sensitive.

```http
POST [Organization URI]/api/data/v9.2/faf001_GetTask
Accept: application/json
Content-Type: application/json

{"faf001_TaskId":"00000000-0000-0000-0000-000000000001"}
```

```csharp
var request = new OrganizationRequest("faf001_GetTask");
request["faf001_TaskId"] = taskId;
var response = service.Execute(request);
var task = (Entity)response.Results["faf001_Task"];
```

Custom API type values used by the definitions:

| Type | Dataverse value |
| --- | ---: |
| Boolean | 0 |
| Entity | 3 |
| EntityCollection | 4 |
| Integer | 7 |
| String | 10 |
| Guid | 12 |

All data access runs as the effective Dataverse caller. Row security, column
security, and table privileges therefore remain authoritative. Required ID inputs
must be nonempty GUIDs. Invalid input, authorization failure, paging failure, or a
Dataverse query/write failure fails the entire Action; no partial response is
returned.

Null Dataverse attributes may be absent from returned entities. SDK lookups and
choices retain `EntityReference` and `OptionSetValue` types. Web API consumers see
normal OData lookup and choice serialization and must not depend on formatted labels.

## Action Index

| Action | Purpose | Inputs | Outputs |
| --- | --- | --- | --- |
| `faf001_GetTasks` | List all visible tasks | None | `faf001_Tasks` |
| `faf001_GetTasksPage` | List a filtered task page | 6 optional | `faf001_Tasks`, `faf001_HasMore`, `faf001_NextToken` |
| `faf001_GetTask` | Read authorized task detail | `faf001_TaskId` | `faf001_Task` |
| `faf001_GetProcesses` | List a filtered process page | 3 optional | `faf001_Processes`, `faf001_HasMore`, `faf001_NextToken` |
| `faf001_GetProcess` | Read process detail and timeline | `faf001_ProcessInstanceId` | `faf001_Process`, `faf001_StepsJson` |
| `faf001_GetAttachments` | List process attachment metadata | `faf001_ProcessInstanceId` | `faf001_Attachments` |
| `faf001_GetArtifacts` | List process artifact metadata | `faf001_ProcessInstanceId` | `faf001_Artifacts` |
| `faf001_GetOutputs` | List process output metadata | `faf001_ProcessInstanceId` | `faf001_Outputs` |
| `faf001_AssignTask` | Claim an eligible task | `faf001_TaskId` | `faf001_TaskId` |
| `faf001_StartTask` | Start an assigned task | `faf001_TaskId` | `faf001_TaskId` |
| `faf001_CompleteTask` | Complete a task and save outputs | `faf001_TaskId`, `faf001_SubmissionJson` | `faf001_StepId` |

## Read Actions

### `faf001_GetTasks`

[Custom API definition](spec/faf001_GetTasks.json)

Returns every task visible under the [task visibility policy](#task-visibility).
This unbounded convenience Action is intended for modest task volumes; use
`faf001_GetTasksPage` for bounded retrieval.

**Inputs:** None. Send `{}` over the Web API.

| Output | Type | Specification |
| --- | --- | --- |
| `faf001_Tasks` | EntityCollection | All visible `faf001_bptask` rows using the [task list projection](#task-projections), ordered by `faf001_bptaskid` ascending. Empty when no tasks are visible. |

The implementation reads in 5,000-row Dataverse pages. Paging is not a point-in-time
snapshot; concurrent writes can affect traversal.

### `faf001_GetTasksPage`

[Custom API definition](spec/faf001_GetTasksPage.json)

Returns one bounded page of tasks. Filters combine as:

`visibility AND process AND status AND (assigned user OR assigned team)`

Absent filters are omitted.

| Input | Type | Required | Specification |
| --- | --- | --- | --- |
| `faf001_ProcessInstanceId` | Guid | No | Exact process-instance filter. Omitted, null, or `Guid.Empty` means no filter. |
| `faf001_Status` | Integer | No | Exact [Business Task Status](#choice-values). Omitted, null, or `0` means no filter. Other unsupported values are rejected. |
| `faf001_AssignedUserId` | Guid | No | Exact `systemuser` assignment filter. Combined with the team filter using OR. Omitted, null, or `Guid.Empty` means no user filter. It does not change caller identity or grant access. |
| `faf001_AssignedTeamId` | Guid | No | Exact `team` assignment filter. Combined with the user filter using OR. Omitted, null, or `Guid.Empty` means no team filter. It does not grant access. |
| `faf001_PageSize` | Integer | No | `1..500`. Omitted, null, or `0` defaults to `100`. Use the same effective size on later pages. |
| `faf001_ContinuationToken` | String | No | Omit or send an empty string for page one. Later requests must use the opaque token from the preceding response and repeat the same filters and effective page size. |

| Output | Type | Specification |
| --- | --- | --- |
| `faf001_Tasks` | EntityCollection | One page of visible `faf001_bptask` rows using the [task list projection](#task-projections), ordered by `faf001_bptaskid` ascending. |
| `faf001_HasMore` | Boolean | `true` when Dataverse reports another page. |
| `faf001_NextToken` | String | Token for the next page, or an empty string on the last page. |

The token is bound to the Action scope, caller, organization, effective filters, and
page size. It is continuation state, not an authorization credential. Invalid,
modified, cross-caller, cross-organization, or cross-Action tokens are rejected.

### `faf001_GetTask`

[Custom API definition](spec/faf001_GetTask.json)

Reads one task, including its input payload and widget ID, after applying the
[task visibility policy](#task-visibility).

| Input | Type | Required | Specification |
| --- | --- | --- | --- |
| `faf001_TaskId` | Guid | Yes | Nonempty `faf001_bptask` ID. |

| Output | Type | Specification |
| --- | --- | --- |
| `faf001_Task` | Entity | Authorized `faf001_bptask` using the [task detail projection](#task-projections). |

The assigned caller may read their open or closed task. An unassigned task is
readable only while active/open and while the caller meets its role/team eligibility
policy. Eligibility is checked before the input payload is retrieved and again on
the detail read. Previewing does not assign or start the task.

### `faf001_GetProcesses`

[Custom API definition](spec/faf001_GetProcesses.json)

Lists process instances (`faf001_bpinstance`), not process definitions. It does not
retrieve child records.

| Input | Type | Required | Specification |
| --- | --- | --- | --- |
| `faf001_Status` | Integer | No | Exact [Business Process Status](#choice-values). Omitted, null, or `0` means all statuses. Other unsupported values are rejected. |
| `faf001_PageSize` | Integer | No | `1..500`. Omitted, null, or `0` defaults to `100`. Use the same effective size on later pages. |
| `faf001_ContinuationToken` | String | No | Omit or send an empty string for page one. Later requests must use the preceding response token and repeat the same status and effective page size. |

| Output | Type | Specification |
| --- | --- | --- |
| `faf001_Processes` | EntityCollection | One page of caller-accessible `faf001_bpinstance` rows using the [process projection](#process-projection), ordered by `faf001_bpinstanceid` ascending. |
| `faf001_HasMore` | Boolean | `true` when Dataverse reports another page. |
| `faf001_NextToken` | String | Token for the next page, or an empty string on the last page. |

Tokens follow the same caller, organization, filter, page-size, and Action-scope
binding rules as task-page tokens. Paging is not a point-in-time snapshot.

### `faf001_GetProcess`

[Custom API definition](spec/faf001_GetProcess.json)

Reads a process instance and a chronological, metadata-only step timeline.

| Input | Type | Required | Specification |
| --- | --- | --- | --- |
| `faf001_ProcessInstanceId` | Guid | Yes | Nonempty `faf001_bpinstance` ID. |

| Output | Type | Specification |
| --- | --- | --- |
| `faf001_Process` | Entity | Caller-accessible process using the [process projection](#process-projection). |
| `faf001_StepsJson` | String | JSON array using the [step timeline schema](#step-timeline-schema). |

Steps sort by `faf001_starttime`, then `createdon` when start time is absent, then
step ID. Unlinked process-global outputs do not appear under a step; retrieve them
with `faf001_GetOutputs`.

### `faf001_GetAttachments`

[Custom API definition](spec/faf001_GetAttachments.json)

| Input | Type | Required | Specification |
| --- | --- | --- | --- |
| `faf001_ProcessInstanceId` | Guid | Yes | Nonempty, caller-readable `faf001_bpinstance` ID. Parent access is verified before child rows are queried. |

| Output | Type | Specification |
| --- | --- | --- |
| `faf001_Attachments` | EntityCollection | All caller-accessible `faf001_bpattachment` rows using the [attachment projection](#related-record-projections). No file content. |

Rows are ordered by `createdon`, then `faf001_bpattachmentid`, and all server pages
are read.

### `faf001_GetArtifacts`

[Custom API definition](spec/faf001_GetArtifacts.json)

| Input | Type | Required | Specification |
| --- | --- | --- | --- |
| `faf001_ProcessInstanceId` | Guid | Yes | Nonempty, caller-readable `faf001_bpinstance` ID. Parent access is verified before child rows are queried. |

| Output | Type | Specification |
| --- | --- | --- |
| `faf001_Artifacts` | EntityCollection | All caller-accessible `faf001_bpartifact` rows using the [artifact projection](#related-record-projections). No file content. |

Rows are ordered by `createdon`, then `faf001_bpartifactid`, and all server pages
are read.

### `faf001_GetOutputs`

[Custom API definition](spec/faf001_GetOutputs.json)

| Input | Type | Required | Specification |
| --- | --- | --- | --- |
| `faf001_ProcessInstanceId` | Guid | Yes | Nonempty, caller-readable `faf001_bpinstance` ID. Parent access is verified before child rows are queried. |

| Output | Type | Specification |
| --- | --- | --- |
| `faf001_Outputs` | EntityCollection | All caller-accessible `faf001_bpdatavalue` rows using the [output metadata projection](#related-record-projections). No typed value columns. |

Rows are ordered by `createdon`, then `faf001_bpdatavalueid`, and all server pages
are read. Retrieve the applicable value column from the returned record ID through
standard Dataverse row retrieval.

## Write Actions

### `faf001_AssignTask`

[Custom API definition](spec/faf001_AssignTask.json)

Claims an eligible, unassigned, active/open task for the effective caller.

| Input | Type | Required | Specification |
| --- | --- | --- | --- |
| `faf001_TaskId` | Guid | Yes | Nonempty `faf001_bptask` ID. No target assignee can be supplied. |

| Output | Type | Specification |
| --- | --- | --- |
| `faf001_TaskId` | Guid | Claimed task ID. A repeated claim by the current assignee is an idempotent no-op. |

Accepted task statuses are Not Started, Assigned, In Progress, and Waiting. The
Action sets `faf001_assignedto` to the caller, `faf001_assignedon` to UTC now, and
`faf001_status` to Assigned. It does not change `ownerid`. The update uses
`IfRowVersionMatches`; the first committed claimant wins and stale claims fail.

### `faf001_StartTask`

[Custom API definition](spec/faf001_StartTask.json)

Starts an active/open task assigned to the effective caller. The task must reference
an active/open Human Task step in the same process through `faf001_bpstepid`.

| Input | Type | Required | Specification |
| --- | --- | --- | --- |
| `faf001_TaskId` | Guid | Yes | Nonempty `faf001_bptask` ID assigned to the caller. |

| Output | Type | Specification |
| --- | --- | --- |
| `faf001_TaskId` | Guid | Started task ID. A task already In Progress with a Running linked step is an idempotent no-op. |

The Action conditionally updates the task status to In Progress (`324010002`) and
the linked step status to Running (`324010001`) using each record's current row
version. Assignment, ownership, outputs, and existing step identity are unchanged.
Closed/inactive, unassigned, foreign-assigned, unlinked, or invalidly linked tasks
are rejected.

### `faf001_CompleteTask`

[Custom API definition](spec/faf001_CompleteTask.json)

Atomically completes an active/open task assigned to the effective caller, writes
its widget outputs, and completes its existing linked Human Task step. The linked
step must be active/open and belong to the same process.

| Input | Type | Required | Specification |
| --- | --- | --- | --- |
| `faf001_TaskId` | Guid | Yes | Nonempty `faf001_bptask` ID assigned to the caller. |
| `faf001_SubmissionJson` | String | Yes | Nonempty JSON object using the [submission schema](#submission-schema). Maximum 500,000 characters. |

| Output | Type | Specification |
| --- | --- | --- |
| `faf001_StepId` | Guid | ID of the existing linked Human Task step that was completed. |

The Action requires an ambient synchronous Dataverse transaction. It first claims
completion with a row-versioned task update, setting status Completed, outcome,
comments, and completion time. It then creates or conditionally updates outputs,
links them to the existing step, and conditionally updates that step to Completed
(`324010003`) with end time and executed-by caller. Any failure propagates so the
transaction can roll back all writes. Repeated completion is rejected.

Do not wrap this Action in `ExecuteMultiple`, `ExecuteTransaction`, or
`TransactionScope`. Optimistic concurrency must be available on task, step, and any
existing output rows.

## Response Schemas

### Task Projections

Both task list Actions return these `faf001_bptask` attributes:

```text
faf001_bptaskid, faf001_taskname, faf001_tasktype, faf001_status,
faf001_bpinstanceid, faf001_bpstepid, faf001_assignedto,
faf001_assignedteam, faf001_assignedon, faf001_completedon,
faf001_duedate, faf001_requiredrole, faf001_comments, faf001_outcome,
faf001_widgetid, ownerid, createdon, modifiedon, statecode, statuscode
```

`faf001_GetTask` returns the same projection plus `faf001_inputdata`. New table
columns are not included automatically.

### Process Projection

`faf001_GetProcesses` and `faf001_GetProcess` return these `faf001_bpinstance`
attributes:

```text
faf001_bpinstanceid, faf001_processname, faf001_processdescription,
faf001_processversion, faf001_businesskey, faf001_status,
faf001_statusmessage, faf001_priority, faf001_starttime, faf001_endtime,
faf001_duedate, faf001_lastupdated, faf001_lastcompletedstepid,
faf001_errorcode, faf001_errormessage, faf001_channel, faf001_initiatedby,
faf001_initiatorexternal, ownerid, createdon, modifiedon, statecode,
statuscode
```

New table columns are not included automatically.

### Step Timeline Schema

`faf001_StepsJson` is a JSON array with this shape:

```json
[
  {
    "id": "00000000-0000-0000-0000-000000000001",
    "name": "Review order",
    "startDate": "2026-09-18T12:00:00.0000000Z",
    "endDate": null,
    "type": 324010001,
    "status": 324010001,
    "executedBy": {
      "id": "00000000-0000-0000-0000-000000000002",
      "name": "Example User"
    },
    "outputs": [
      { "id": "00000000-0000-0000-0000-000000000003", "name": "review.decision", "type": 324010000 }
    ],
    "artifacts": [
      { "id": "00000000-0000-0000-0000-000000000004", "name": "Review report", "type": 324010000 }
    ]
  }
]
```

Dates are UTC ISO 8601 strings or null. Type and status are choice integers or
null. `executedBy` is populated only for Human Task steps with `faf001_executedby`;
its name may be null. Output and artifact references contain only `id`, `name`, and
`type`.

### Related Record Projections

`faf001_GetAttachments` returns:

```text
faf001_bpattachmentid, faf001_filename, faf001_description,
faf001_attachmenttype, faf001_bpinstanceid, faf001_bpstepid,
faf001_bptaskid, faf001_externalurl, faf001_mimetype, faf001_filesize,
faf001_storagetype, faf001_source, faf001_receivedon, ownerid,
createdon, modifiedon, statecode, statuscode
```

`faf001_GetArtifacts` returns:

```text
faf001_bpartifactid, faf001_artifactname, faf001_description,
faf001_artifacttype, faf001_version, faf001_bpinstanceid,
faf001_bpstepid, faf001_supersedesid, faf001_externalurl,
faf001_mimetype, faf001_filesize, faf001_storagetype, faf001_status,
faf001_generatedon, faf001_generatedby, ownerid, createdon, modifiedon,
statecode, statuscode
```

`faf001_GetOutputs` returns:

```text
faf001_bpdatavalueid, faf001_datakey, faf001_datatype,
faf001_description, faf001_bpinstanceid, faf001_bpstepid,
faf001_bptaskid, ownerid, createdon, modifiedon, statecode, statuscode
```

Attachment and artifact file bytes are not returned. For Dataverse files, use the
record ID and `faf001_file` with the standard Dataverse file download operation.
External storage remains subject to its URL and access rules.

## Submission Schema

`faf001_SubmissionJson` has this shape:

```json
{
  "outcome": 324010000,
  "notes": "Reviewed",
  "values": [
    { "key": "edited_order", "type": "json", "value": { "orderId": "example" } },
    { "key": "amount", "type": "number", "value": 42.5 }
  ]
}
```

| Field | Required | Specification |
| --- | --- | --- |
| `outcome` | Yes | Integer: Approved (`324010000`), Rejected (`324010001`), or Needs More Info (`324010002`). |
| `notes` | No | String, maximum 4,000 characters. Omission becomes an empty string. |
| `values` | No | Array of at most 100 `{ key, type, value }` objects. |

Each value object permits exactly `key`, `type`, and `value`; all three are required.
Keys must be nonblank and unique case-insensitively. `decision` and `notes` are
reserved. The final namespaced Dataverse key must not exceed 100 characters.

| `type` | JSON value | Dataverse value column | Limit |
| --- | --- | --- | --- |
| `text` | String | `faf001_valuetext` | 4,000 characters |
| `json` | Any JSON value | `faf001_valuejson` | Serialized value up to 100,000 characters |
| `number` | JSON number | `faf001_valuenumber` | `-100000000000..100000000000`, at most 10 decimal places |
| `boolean` | JSON boolean | `faf001_valueboolean` | Strict boolean |
| `datetime` | String | `faf001_valuedatetime` | ISO 8601 with `Z` or an explicit offset; UTC date must be on or after 1753-01-01 |

The output namespace is the task widget ID with a trailing `-ui` removed. If no
widget ID exists, it is a normalized lowercase task name. The server always adds:

- `<prefix>.decision`: `approved`, `rejected`, or `needs_info`.
- `<prefix>.notes`: the submitted notes or an empty string.

An existing value with the same process/key must belong to the same task; otherwise
completion fails. Existing same-task values are updated by row version and unused
typed value columns are cleared.

## Choice Values

### Business Task Status

| Status | Value |
| --- | ---: |
| Not Started | 324010000 |
| Assigned | 324010001 |
| In Progress | 324010002 |
| Waiting | 324010003 |
| Completed | 324010004 |
| Cancelled | 324010005 |
| Expired | 324010006 |

### Business Process Status

| Status | Value |
| --- | ---: |
| Not Started | 324010000 |
| Running | 324010001 |
| Waiting | 324010002 |
| Suspended | 324010003 |
| Completed | 324010004 |
| Failed | 324010005 |
| Cancelled | 324010006 |
| Compensating | 324010007 |

## Task Visibility

The two task list Actions and `faf001_AssignTask` use this policy:

1. A task assigned to the caller is visible, regardless of team or role routing.
2. A task assigned to someone else is hidden and cannot be claimed.
3. An unassigned task with a required role is eligible only when the caller holds
   that exact role directly or through a team.
4. An unassigned task without a required role is eligible when the caller belongs
   to its assigned team.
5. An unrouted, unassigned task is denied.

`faf001_GetTask` additionally allows the assigned caller to read their closed tasks,
and allows eligible unassigned callers to preview only active/open tasks.

Membership and role queries execute for each invocation and read all pages. The
caller needs appropriate read privileges for roles, teams, and memberships. API
eligibility does not replace Dataverse table security or prevent callers with direct
table write privileges from using standard Dataverse endpoints.

Claiming also requires task Write and Append privileges plus Append To on
`systemuser`, because `faf001_assignedto` is a user lookup.

## References

- [Custom APIs](https://learn.microsoft.com/power-apps/developer/data-platform/custom-api)
- [Create a Custom API with code](https://learn.microsoft.com/power-apps/developer/data-platform/create-custom-api-with-code)
- [Build and package plug-in code](https://learn.microsoft.com/power-apps/developer/data-platform/dependent-assembly-plugins)