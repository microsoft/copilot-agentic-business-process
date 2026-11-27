#Requires -Version 7.0
<#
.SYNOPSIS
Create a Dataverse security role and grant table privileges from a declarative spec, or
assign existing roles to owner teams. Uses the Azure CLI sign-in; no separate login.

.EXAMPLE
./scripts/dataverse_role.ps1 -TenantId <tenant-id> -Url https://org.crm.dynamics.com/ -SpecPath core/solution/config/security-role.business-process-user.json -CreateOnly

.EXAMPLE
./scripts/dataverse_role.ps1 -TenantId <tenant-id> -Url https://org.crm.dynamics.com/ -AssignTeamRole @{ 'Order Reviewers Global' = 'Order Reviewer' }
#>
[CmdletBinding(DefaultParameterSetName = 'Spec')]
param(
    [Parameter(Mandatory)][guid] $TenantId,
    [Parameter(Mandatory)][uri] $Url,
    [Parameter(Mandatory, ParameterSetName = 'Spec')][string] $SpecPath,
    # Create or find the role only; existing privileges and assignments are left unchanged.
    [Parameter(ParameterSetName = 'Spec')][switch] $CreateOnly,
    [Parameter(ParameterSetName = 'Spec')][guid] $AssignAppId,
    # Owner team name -> existing role name.
    [Parameter(Mandatory, ParameterSetName = 'TeamRoles')][hashtable] $AssignTeamRole,
    [Parameter(ParameterSetName = 'TeamRoles')][guid] $BusinessUnitId
)

$ErrorActionPreference = 'Stop'
if ($Url.Scheme -ne 'https' -or $Url.AbsolutePath -ne '/' -or $Url.Query -or $Url.Fragment -or $Url.UserInfo) {
    throw 'Url must be the HTTPS Dataverse organization root.'
}
if ($CreateOnly -and $AssignAppId) { throw '-CreateOnly cannot be combined with -AssignAppId.' }
$validPrivileges = 'Create', 'Read', 'Write', 'Delete', 'Append', 'AppendTo', 'Assign', 'Share'
$validDepths = 'Basic', 'Local', 'Deep', 'Global'

$org = $Url.AbsoluteUri.TrimEnd('/')
$api = "$org/api/data/v9.2"
$token = az account get-access-token --tenant $TenantId --resource $org --query accessToken --output tsv --only-show-errors
if ($LASTEXITCODE -ne 0 -or -not $token) { throw 'Could not acquire a Dataverse token. Run az login --tenant <tenant-id> --allow-no-subscriptions.' }
$headers = @{ Authorization = "Bearer $token"; Accept = 'application/json'; 'OData-MaxVersion' = '4.0'; 'OData-Version' = '4.0' }

function Invoke-Dataverse {
    param([string] $Method = 'Get', [string] $Path, $Body, [hashtable] $ExtraHeaders = @{})
    $request = @{ Method = $Method; Uri = "$api/$Path"; Headers = $headers + $ExtraHeaders; ErrorAction = 'Stop' }
    if ($null -ne $Body) { $request.Body = ($Body | ConvertTo-Json -Depth 10 -Compress); $request.ContentType = 'application/json' }
    Invoke-RestMethod @request
}

function Get-Single {
    param([string] $Path, [string] $Description)
    $rows = @((Invoke-Dataverse -Path $Path).value)
    if ($rows.Count -ne 1) { throw "Expected exactly one $Description; found $($rows.Count). Nothing changed." }
    $rows[0]
}

function ConvertTo-ODataLiteral([string] $Value) { $Value.Replace("'", "''") }

try {
    $null = Invoke-Dataverse -Path 'WhoAmI'

    if ($PSCmdlet.ParameterSetName -eq 'TeamRoles') {
        $pending = foreach ($teamName in ($AssignTeamRole.Keys | Sort-Object)) {
            $roleName = [string] $AssignTeamRole[$teamName]
            if (-not "$teamName".Trim() -or -not $roleName.Trim()) { throw 'Team and role names cannot be blank.' }
            $teamFilter = "name eq '$(ConvertTo-ODataLiteral $teamName)'"
            if ($BusinessUnitId) { $teamFilter += " and _businessunitid_value eq $BusinessUnitId" }
            $team = Get-Single "teams?`$select=teamid,teamtype,_businessunitid_value&`$filter=$teamFilter&`$top=2" "team named '$teamName'"
            if ($team.teamtype -ne 0) { throw "Team '$teamName' is not an owner team. Nothing changed." }
            $role = Get-Single "roles?`$select=roleid&`$filter=name eq '$(ConvertTo-ODataLiteral $roleName)' and _businessunitid_value eq $($team._businessunitid_value)&`$top=2" "role named '$roleName' in the team's business unit"
            $existing = @((Invoke-Dataverse -Path "teams($($team.teamid))/teamroles_association?`$select=roleid&`$filter=roleid eq $($role.roleid)").value)
            [pscustomobject]@{ Team = $teamName; Role = $roleName; TeamId = $team.teamid; RoleId = $role.roleid; Assigned = [bool] $existing.Count }
        }
        $added = 0
        foreach ($item in @($pending | Where-Object { -not $_.Assigned })) {
            $null = Invoke-Dataverse -Method Post -Path "teams($($item.TeamId))/teamroles_association/`$ref" -Body @{ '@odata.id' = "$api/roles($($item.RoleId))" }
            if (-not @((Invoke-Dataverse -Path "teams($($item.TeamId))/teamroles_association?`$select=roleid&`$filter=roleid eq $($item.RoleId)").value).Count) {
                throw "Assignment readback failed for '$($item.Team)' / '$($item.Role)'."
            }
            $added++
        }
        Write-Output "PASS team roles: $(@($pending).Count) verified; added $added; unchanged $(@($pending).Count - $added)."
        return
    }

    $spec = Get-Content -LiteralPath $SpecPath -Raw | ConvertFrom-Json
    $depth = if ($spec.depth) { [string] $spec.depth } else { 'Global' }
    $tableDepths = @{}
    if ($spec.tableDepths) { foreach ($p in $spec.tableDepths.PSObject.Properties) { $tableDepths[$p.Name] = [string] $p.Value } }
    $tables = [ordered]@{}
    foreach ($p in $spec.tables.PSObject.Properties) { $tables[$p.Name] = @($p.Value) }
    if ($depth -notin $validDepths) { throw "Invalid depth '$depth'." }
    foreach ($table in $tableDepths.Keys) {
        if (-not $tables.Contains($table)) { throw "Depth override refers to unknown table '$table'." }
        if ($tableDepths[$table] -notin $validDepths) { throw "Table '$table' has invalid depth '$($tableDepths[$table])'." }
    }
    foreach ($table in $tables.Keys) {
        $unknown = @($tables[$table] | Where-Object { $_ -notin $validPrivileges })
        if ($unknown.Count) { throw "Table '$table' has unknown privileges: $($unknown -join ', ')." }
    }

    $businessUnit = Get-Single "businessunits?`$select=businessunitid&`$filter=_parentbusinessunitid_value eq null" 'root business unit'
    $roleFilter = "name eq '$(ConvertTo-ODataLiteral $spec.roleName)' and _businessunitid_value eq $($businessUnit.businessunitid)"
    $roles = @((Invoke-Dataverse -Path "roles?`$select=roleid&`$filter=$roleFilter").value)
    if ($roles.Count -gt 1) { throw "Multiple roles named '$($spec.roleName)' in the root business unit. Nothing changed." }
    $created = -not $roles.Count
    $roleId = if ($created) {
        (Invoke-Dataverse -Method Post -Path 'roles' -ExtraHeaders @{ Prefer = 'return=representation' } -Body @{
            name = $spec.roleName; 'businessunitid@odata.bind' = "/businessunits($($businessUnit.businessunitid))"
        }).roleid
    } else { $roles[0].roleid }
    $roleState = if ($created) { 'created' } else { 'found' }

    if ($CreateOnly) {
        Write-Output "PASS role '$($spec.roleName)' $roleState ($roleId); create-only: privileges and assignments unchanged."
        return
    }

    $grants = [Collections.Generic.List[object]]::new()
    $skipped = [Collections.Generic.List[string]]::new()
    $unsupported = [Collections.Generic.List[string]]::new()
    foreach ($table in $tables.Keys) {
        try {
            $metadata = Invoke-Dataverse -Path "EntityDefinitions(LogicalName='$table')?`$select=LogicalName,Privileges"
        } catch {
            if ($_.Exception.Response -and [int] $_.Exception.Response.StatusCode -eq 404) { $skipped.Add($table); continue }
            throw
        }
        $tableDepth = if ($tableDepths.ContainsKey($table)) { $tableDepths[$table] } else { $depth }
        foreach ($privilege in $tables[$table]) {
            $definition = @($metadata.Privileges | Where-Object PrivilegeType -EQ $privilege)
            if (-not $definition.Count) { $unsupported.Add("$table.$privilege"); continue }
            $grants.Add(@{ '@odata.type' = 'Microsoft.Dynamics.CRM.RolePrivilege'; PrivilegeId = $definition[0].PrivilegeId; Depth = $tableDepth })
        }
    }
    if ($skipped.Count) {
        throw "FAIL role '$($spec.roleName)': tables missing in this environment: $($skipped -join ', '). Import the solution first, then rerun. No privileges granted."
    }
    if ($grants.Count) { $null = Invoke-Dataverse -Method Post -Path "roles($roleId)/Microsoft.Dynamics.CRM.AddPrivilegesRole" -Body @{ Privileges = $grants.ToArray() } }
    $note = if ($unsupported.Count) { "; not applicable (no such privilege): $($unsupported -join ', ')" } else { '' }

    $assignment = ''
    if ($AssignAppId) {
        $user = Get-Single "systemusers?`$select=systemuserid&`$filter=applicationid eq $AssignAppId" "application user for $AssignAppId"
        $existing = @((Invoke-Dataverse -Path "systemusers($($user.systemuserid))/systemuserroles_association?`$select=roleid&`$filter=roleid eq $roleId").value)
        if (-not $existing.Count) {
            $null = Invoke-Dataverse -Method Post -Path "systemusers($($user.systemuserid))/systemuserroles_association/`$ref" -Body @{ '@odata.id' = "$api/roles($roleId)" }
        }
        $assignment = "; assigned to application user $($user.systemuserid)"
    }
    Write-Output "PASS role '$($spec.roleName)' $roleState ($roleId): granted $($grants.Count) privileges across $($tables.Count) tables$note$assignment."
} finally {
    Remove-Variable token, headers -ErrorAction SilentlyContinue
}
