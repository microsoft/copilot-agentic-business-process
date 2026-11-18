# Shared helpers for the stage test scripts (test-*.ps1). Dot-source it: . (Join-Path $PSScriptRoot 'test-common.ps1')
# The tests write to the target environment: they create labelled test instances ("[FAF-TEST] ...") and leave them in place.

$script:TestLabel = '[FAF-TEST]'
$script:Results = [System.Collections.Generic.List[object]]::new()

function Connect-TestEnvironment {
    param([uri]$EnvironmentUrl, [guid]$TenantId, [guid]$OrganizationId)
    if (-not $EnvironmentUrl.IsAbsoluteUri -or $EnvironmentUrl.Scheme -ne 'https' -or
        $EnvironmentUrl.UserInfo -or $EnvironmentUrl.Query -or $EnvironmentUrl.Fragment -or
        $EnvironmentUrl.AbsolutePath -ne '/') {
        throw 'EnvironmentUrl must be an HTTPS Dataverse origin without credentials, query, or path.'
    }
    $org = $EnvironmentUrl.GetLeftPart([UriPartial]::Authority)
    $token = az account get-access-token --tenant $TenantId --resource $org --query accessToken --output tsv
    if ($LASTEXITCODE -ne 0 -or -not $token) { throw 'Could not acquire Dataverse token.' }
    $script:Api = "$org/api/data/v9.2"
    $script:Headers = @{ Authorization = "Bearer $token"; Accept = 'application/json'; 'OData-MaxVersion' = '4.0'; 'OData-Version' = '4.0' }
    $identity = Invoke-RestMethod -Headers $script:Headers -Uri "$($script:Api)/WhoAmI" -ErrorAction Stop
    if ($identity.OrganizationId -ne $OrganizationId.ToString()) { throw 'Unexpected organization; nothing was created.' }
}

function Invoke-Dv([string]$Method, [string]$Path, $Body, [hashtable]$Extra = @{}) {
    $params = @{ Method = $Method; Uri = "$($script:Api)/$Path"; Headers = ($script:Headers + $Extra); ErrorAction = 'Stop' }
    if ($null -ne $Body) { $params.Body = ($Body | ConvertTo-Json -Depth 10 -Compress); $params.ContentType = 'application/json' }
    Invoke-RestMethod @params
}

function Add-Check([string]$Name, [bool]$Passed, [string]$Detail = '') {
    $script:Results.Add([pscustomobject]@{ Check = $Name; Result = $(if ($Passed) { 'PASS' } else { 'FAIL' }); Detail = $Detail })
}

function Write-TestResults {
    $script:Results | Format-Table -AutoSize -Wrap
    Remove-Variable Headers -Scope Script -ErrorAction SilentlyContinue
    if (@($script:Results | Where-Object Result -eq 'FAIL').Count -gt 0) { exit 1 }
}

function New-TestInstance([string]$Label, [int]$Status = 324010001, [string]$StatusMessage = 'seeded for a stage test') {
    $stamp = (Get-Date).ToUniversalTime().ToString('o')
    $key = "$($script:TestLabel) $Label $((Get-Date).ToUniversalTime().ToString('yyyy-MM-dd HH:mm'))Z"
    $i = Invoke-Dv Post 'faf001_bpinstances' @{
        faf001_businesskey = $key; faf001_channel = 324010005; faf001_initiatorexternal = 'stage-test@invalid.example'
        faf001_lastupdated = $stamp; faf001_processdescription = "Stage test instance: $Label (seeded, not received by email)"
        faf001_processname = 'Order Processing Test'; faf001_processversion = '1.0'; faf001_starttime = $stamp
        faf001_status = $Status; faf001_statusmessage = $StatusMessage
    } @{ Prefer = 'return=representation' }
    Write-Host "Created test instance $($i.faf001_bpinstanceid)"
    $i.faf001_bpinstanceid
}

# Re-run guard: only instances this script family created may be modified.
function Assert-TestInstance([guid]$InstanceId) {
    $i = Invoke-Dv Get "faf001_bpinstances($InstanceId)?`$select=faf001_businesskey"
    if (-not $i.faf001_businesskey.StartsWith($script:TestLabel)) { throw "Instance $InstanceId is not a stage test instance; refusing to change its data." }
}

function New-DataValue([guid]$InstanceId, [string]$Key, [string]$Text, [string]$Json) {
    $b = @{ 'faf001_bpinstanceid@odata.bind' = "/faf001_bpinstances($InstanceId)"; faf001_datakey = $Key; faf001_description = 'Seeded for a stage test' }
    if ($Json) { $b.faf001_datatype = 324010004; $b.faf001_valuejson = $Json } else { $b.faf001_datatype = 324010000; $b.faf001_valuetext = $Text }
    $null = Invoke-Dv Post 'faf001_bpdatavalues' $b
}

function Remove-DataValues([guid]$InstanceId, [string]$KeyPrefix) {
    $rows = @((Invoke-Dv Get "faf001_bpdatavalues?`$select=faf001_bpdatavalueid&`$filter=_faf001_bpinstanceid_value eq $InstanceId and startswith(faf001_datakey,'$KeyPrefix')").value)
    foreach ($r in $rows) { $null = Invoke-Dv Delete "faf001_bpdatavalues($($r.faf001_bpdatavalueid))" }
    Write-Output "Deleted $($rows.Count) '$KeyPrefix*' data value(s)"
}

function New-Step([guid]$InstanceId, [string]$Name, [int]$Type, [int]$Status) {
    $s = Invoke-Dv Post 'faf001_bpsteps' @{
        'faf001_bpinstanceid@odata.bind' = "/faf001_bpinstances($InstanceId)"; faf001_stepname = $Name
        faf001_steptype = $Type; faf001_status = $Status; faf001_starttime = (Get-Date).ToUniversalTime().ToString('o')
    } @{ Prefer = 'return=representation' }
    $s.faf001_bpstepid
}

# A human gate completes when its step row is modified to Completed; the stage flows trigger on that modification.
function Complete-HumanStep([guid]$InstanceId, [string]$Name) {
    $id = New-Step $InstanceId $Name 324010001 324010002
    Start-Sleep -Seconds 5
    $null = Invoke-Dv Patch "faf001_bpsteps($id)" @{ faf001_status = 324010003; faf001_endtime = (Get-Date).ToUniversalTime().ToString('o') }
    $id
}

function Get-Steps([guid]$InstanceId, [string]$Name, [datetime]$Since) {
    $sinceIso = $Since.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    @((Invoke-Dv Get "faf001_bpsteps?`$select=faf001_bpstepid,faf001_stepname,faf001_status,faf001_steptype,faf001_errorcode,faf001_errormessage&`$filter=_faf001_bpinstanceid_value eq $InstanceId and faf001_stepname eq '$Name' and createdon ge $sinceIso&`$orderby=createdon asc").value)
}

# Polls until the script block returns a non-null value or the timeout passes; returns that value (or $null).
function Wait-For([scriptblock]$Condition, [int]$TimeoutMinutes, [int]$PollSeconds = 10) {
    $deadline = [DateTime]::UtcNow.AddMinutes($TimeoutMinutes)
    do {
        $v = & $Condition
        if ($null -ne $v) { return $v }
        Start-Sleep -Seconds $PollSeconds
    } while ([DateTime]::UtcNow -lt $deadline)
    $null
}

function Get-DataJson([guid]$InstanceId, [string]$Key) {
    $row = @((Invoke-Dv Get "faf001_bpdatavalues?`$select=faf001_valuejson,_faf001_bpstepid_value&`$filter=_faf001_bpinstanceid_value eq $InstanceId and faf001_datakey eq '$Key'").value) | Select-Object -First 1
    if ($row) { [pscustomobject]@{ Json = ($row.faf001_valuejson | ConvertFrom-Json); StepId = $row._faf001_bpstepid_value } }
}

function Get-Task([guid]$InstanceId, [guid]$StepId) {
    @((Invoke-Dv Get "faf001_bptasks?`$select=faf001_taskname,faf001_widgetid,faf001_status,_faf001_requiredrole_value&`$filter=_faf001_bpinstanceid_value eq $InstanceId and _faf001_bpstepid_value eq $StepId").value)
}
