[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [uri]$EnvironmentUrl,
    [Parameter(Mandatory)]
    [guid]$TenantId,
    [Parameter(Mandatory)]
    [guid]$OrganizationId,
    [ValidateRange(1, 60)]
    [int]$TimeoutMinutes = 10,
    [double]$MaxRunMinutes = 5,
    # Re-run on an instance this script created earlier: deletes only its 'extracted-order' data value and
    # creates a new Order Extraction Step, so the run takes the stage time instead of the seeding time.
    [guid]$InstanceId,
    [string]$OrderImage = (Join-Path $PSScriptRoot 'test-data/sample-purchase-order.png'),
    # After the stage completed, creates a second Order Extraction Step and asserts the run-once guard ends it.
    [switch]$CheckGuard,
    # Failure path: use an image that holds no order (for example a blank one) and assert the step and the
    # instance end Failed with ORDER_EXTRACTION_FAILED and no review is raised.
    [switch]$ExpectFailure
)

# Stage test for extract-order-data. Seeds what mail-order-intake leaves (instance, image attachment, completed
# intake step), creates the Order Extraction Step the stage triggers on, waits, then asserts the acceptance
# criteria and the run time. It writes to the target environment and leaves the labelled test instance in place.

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'test-common.ps1')

try {
    Connect-TestEnvironment $EnvironmentUrl $TenantId $OrganizationId
    $useSample = ((Resolve-Path $OrderImage).Path -eq (Resolve-Path (Join-Path $PSScriptRoot 'test-data/sample-purchase-order.png')).Path)
    $expected = Get-Content (Join-Path $PSScriptRoot 'test-data/sample-extracted-order.json') -Raw | ConvertFrom-Json

    if ($InstanceId) {
        Assert-TestInstance $InstanceId
        Remove-DataValues $InstanceId 'extracted-order'
        $id = $InstanceId
    }
    else {
        $id = New-TestInstance 'extract-order-data' 324010001 'validating mail order'
        $name = [IO.Path]::GetFileName($OrderImage)
        $att = Invoke-Dv Post 'faf001_bpattachments' @{
            faf001_attachmenttype = 324010001; 'faf001_bpinstanceid@odata.bind' = "/faf001_bpinstances($id)"
            faf001_description = 'Seeded for a stage test'; faf001_filename = $name; faf001_filesize = (Get-Item $OrderImage).Length
            faf001_mimetype = 'image/png'; faf001_receivedon = (Get-Date).ToUniversalTime().ToString('o')
            faf001_source = 324010000; faf001_storagetype = 324010002
        } @{ Prefer = 'return=representation' }
        $null = Invoke-RestMethod -Method Patch -Uri "$($script:Api)/faf001_bpattachments($($att.faf001_bpattachmentid))/faf001_file" `
            -Headers ($script:Headers + @{ 'x-ms-file-name' = $name }) -ContentType 'application/octet-stream' -InFile $OrderImage -ErrorAction Stop
        $now = (Get-Date).ToUniversalTime().ToString('o')
        $null = Invoke-Dv Post 'faf001_bpsteps' @{
            'faf001_bpinstanceid@odata.bind' = "/faf001_bpinstances($id)"; faf001_stepname = 'Order Intake Validation'
            faf001_steptype = 324010000; faf001_status = 324010003; faf001_starttime = $now; faf001_endtime = $now
        }
    }

    $created = [DateTime]::UtcNow
    $stepId = New-Step $id 'Order Extraction Step' 324010006 324010000
    Write-Output "Created Order Extraction Step $stepId; waiting up to $TimeoutMinutes minute(s)..."
    $step = Wait-For { $s = Invoke-Dv Get "faf001_bpsteps($stepId)?`$select=faf001_status,faf001_errorcode,faf001_errormessage"
        if ($s.faf001_status -in @(324010003, 324010004)) { $s } } $TimeoutMinutes
    $elapsed = [DateTime]::UtcNow - $created
    Write-Output ("Step status {0} after {1:N1} minute(s)" -f $step.faf001_status, $elapsed.TotalMinutes)

    if ($ExpectFailure) {
        Add-Check 'Extraction step failed with the order error code' ($step -and $step.faf001_status -eq 324010004 -and $step.faf001_errorcode -eq 'ORDER_EXTRACTION_FAILED') "status $($step.faf001_status) $($step.faf001_errorcode)"
        Add-Check 'Step error message explains the failure' ([bool]$step.faf001_errormessage) "$($step.faf001_errormessage)"
        $inst = Invoke-Dv Get "faf001_bpinstances($id)?`$select=faf001_status,faf001_errorcode,faf001_endtime"
        Add-Check 'Instance failed with the same error code and end time' ($inst.faf001_status -eq 324010005 -and $inst.faf001_errorcode -eq 'ORDER_EXTRACTION_FAILED' -and $inst.faf001_endtime)
        Add-Check 'Nothing stored as a result and no review raised' ($null -eq (Get-DataJson $id 'extracted-order') -and @(Get-Steps $id 'Extracted Order Data Review' $created).Count -eq 0)
        Write-Output "Test instance: $id"
        Write-TestResults
        return
    }

    Add-Check 'Extraction step completed' ($step -and $step.faf001_status -eq 324010003) "status $($step.faf001_status) $($step.faf001_errorcode) $($step.faf001_errormessage)"
    Add-Check "Run time within $MaxRunMinutes minutes" ($elapsed.TotalMinutes -le $MaxRunMinutes) ('{0:N1} min' -f $elapsed.TotalMinutes)

    $data = Get-DataJson $id 'extracted-order'
    Add-Check 'Extracted order stored on the extraction step' ($null -ne $data -and $data.StepId -eq $stepId)
    if ($data) {
        $o = $data.Json
        Add-Check 'Order id and at least one line extracted' ($o.order_id -and @($o.line_items).Count -ge 1) "order_id=$($o.order_id) lines=$(@($o.line_items).Count)"
        if ($useSample) {
            Add-Check 'Order id matches the sample' ($o.order_id -eq $expected.order_id) "$($o.order_id)"
            Add-Check 'Three lines with the sample SKUs' (@($o.line_items).Count -eq 3 -and -not (Compare-Object @($o.line_items.sku) @($expected.line_items.sku))) (@($o.line_items.sku) -join ',')
            Add-Check 'Order total matches the sample' ([math]::Abs([double]$o.order_total - [double]$expected.order_total) -lt 0.01) "$($o.order_total)"
        }
    }

    $review = @(Get-Steps $id 'Extracted Order Data Review' $created)
    Add-Check 'Human review step created exactly once, waiting' ($review.Count -eq 1 -and $review[0].faf001_status -eq 324010002 -and $review[0].faf001_steptype -eq 324010001) "found $($review.Count)"
    if ($review.Count -ge 1) {
        $task = @(Get-Task $id $review[0].faf001_bpstepid)
        Add-Check 'Review task waiting, widget and role set' ($task.Count -eq 1 -and $task[0].faf001_widgetid -eq 'extracted-order-review-ui' -and $task[0].faf001_status -eq 324010003 -and $task[0]._faf001_requiredrole_value) "found $($task.Count)"
    }
    $inst = Invoke-Dv Get "faf001_bpinstances($id)?`$select=faf001_status,faf001_statusmessage,_faf001_lastcompletedstepid_value"
    Add-Check 'Instance waiting for review' ($inst.faf001_status -eq 324010002) "$($inst.faf001_statusmessage)"
    Add-Check 'Last completed step is the extraction step' ($inst._faf001_lastcompletedstepid_value -eq $stepId)

    if ($CheckGuard) {
        $second = New-Step $id 'Order Extraction Step' 324010006 324010000
        Start-Sleep -Seconds 60
        $s2 = Invoke-Dv Get "faf001_bpsteps($second)?`$select=faf001_status"
        $values = @((Invoke-Dv Get "faf001_bpdatavalues?`$select=faf001_bpdatavalueid&`$filter=_faf001_bpinstanceid_value eq $id and faf001_datakey eq 'extracted-order'").value)
        Add-Check 'Run-once guard: second trigger ended without work' ($s2.faf001_status -eq 324010000 -and $values.Count -eq 1 -and @(Get-Steps $id 'Extracted Order Data Review' $created).Count -eq 1)
    }
    Write-Output "Test instance: $id"
}
finally {
    Remove-Variable token -ErrorAction SilentlyContinue
}
Write-TestResults
