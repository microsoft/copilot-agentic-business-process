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
    [ValidateSet('approved', 'rejected')]
    [string]$Decision = 'approved',
    # Re-run on an instance this script created earlier: deletes only its 'order-evaluation.' data values and
    # completes a new Extracted Order Data Review step, so the run takes the stage time instead of the seeding time.
    [guid]$InstanceId,
    # After the stage completed, completes the review step again and asserts the run-once guard ends it.
    [switch]$CheckGuard
)

# Stage test for validate-order. Seeds what the extraction stage and the first human gate leave (the extracted
# order, the reviewer's decision and corrected order, the review step), completes the Extracted Order Data
# Review step, waits, then asserts the acceptance criteria and the run time. The upstream result is seeded, not
# produced, so this test does not depend on the extraction agent. It writes to the target environment and leaves
# the labelled test instance in place.

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'test-common.ps1')

try {
    Connect-TestEnvironment $EnvironmentUrl $TenantId $OrganizationId
    $orderJson = Get-Content (Join-Path $PSScriptRoot 'test-data/sample-extracted-order.json') -Raw

    if ($InstanceId) {
        Assert-TestInstance $InstanceId
        Remove-DataValues $InstanceId 'order-evaluation.'
        $id = $InstanceId
    }
    else {
        $id = New-TestInstance 'validate-order' 324010002 'waiting for extracted order review'
        New-DataValue $id 'extracted-order' $null $orderJson
        New-DataValue $id 'extracted-order-review.decision' $Decision $null
        New-DataValue $id 'extracted-order-review.edited_order' $null $orderJson
    }

    $created = [DateTime]::UtcNow
    $humanStep = Complete-HumanStep $id 'Extracted Order Data Review'
    Write-Output "Completed Extracted Order Data Review step $humanStep ($Decision); waiting up to $TimeoutMinutes minute(s)..."

    if ($Decision -eq 'rejected') {
        $inst = Wait-For { $i = Invoke-Dv Get "faf001_bpinstances($id)?`$select=faf001_status,faf001_statusmessage,faf001_endtime"
            if ($i.faf001_status -eq 324010004) { $i } } $TimeoutMinutes
        Add-Check 'Instance closed as not approved' ($inst -and $inst.faf001_statusmessage -eq 'order was not approved by user') "$($inst.faf001_statusmessage)"
        Add-Check 'End time recorded' ($inst -and $inst.faf001_endtime)
        Add-Check 'No evaluation was started' (@(Get-Steps $id 'Order Evaluation' $created).Count -eq 0)
    }
    else {
        $step = Wait-For { $s = @(Get-Steps $id 'Order Evaluation' $created) | Select-Object -First 1
            if ($s -and $s.faf001_status -in @(324010003, 324010004)) { $s } } $TimeoutMinutes
        $elapsed = [DateTime]::UtcNow - $created
        Write-Output ("Order Evaluation step status {0} after {1:N1} minute(s)" -f $step.faf001_status, $elapsed.TotalMinutes)
        Add-Check 'Order Evaluation step completed' ($step -and $step.faf001_status -eq 324010003) "status $($step.faf001_status) $($step.faf001_errorcode) $($step.faf001_errormessage)"
        Add-Check "Run time within $MaxRunMinutes minutes" ($elapsed.TotalMinutes -le $MaxRunMinutes) ('{0:N1} min' -f $elapsed.TotalMinutes)

        $data = Get-DataJson $id 'order-evaluation.result'
        Add-Check 'Evaluation result stored on the evaluation step' ($null -ne $data -and $step -and $data.StepId -eq $step.faf001_bpstepid)
        if ($data) {
            $r = $data.Json
            $skills = @('validate-order-product-identity', 'validate-order-product-availability', 'evaluate-order-discounts-promotions')
            Add-Check 'One result per skill' (@($r.skill_results).Count -eq 3 -and -not (Compare-Object @($r.skill_results.skill) $skills)) (@($r.skill_results.skill) -join ',')
            Add-Check 'Verdict follows identity and availability' ($r.verdict -eq $(if (@($r.skill_results | Where-Object { $_.skill -ne 'evaluate-order-discounts-promotions' -and $_.status -ne 'pass' }).Count -eq 0) { 'pass' } else { 'flag' })) "verdict=$($r.verdict)"
            Add-Check 'Sample order passes validation' ($r.verdict -eq 'pass') "verdict=$($r.verdict): $($r.reasoning)"
            Add-Check 'Pricing adjustments are proposals only' ($r.pricing_adjustments.proposed_only -eq $true)
        }
        $review = @(Get-Steps $id 'Order Evaluation Review' $created)
        Add-Check 'Approver step created exactly once, waiting' ($review.Count -eq 1 -and $review[0].faf001_status -eq 324010002 -and $review[0].faf001_steptype -eq 324010001) "found $($review.Count)"
        if ($review.Count -ge 1) {
            $task = @(Get-Task $id $review[0].faf001_bpstepid)
            Add-Check 'Approval task waiting, widget and role set' ($task.Count -eq 1 -and $task[0].faf001_widgetid -eq 'order-evaluation-review-ui' -and $task[0].faf001_status -eq 324010003 -and $task[0]._faf001_requiredrole_value) "found $($task.Count)"
        }
        $inst = Invoke-Dv Get "faf001_bpinstances($id)?`$select=faf001_status,_faf001_lastcompletedstepid_value"
        Add-Check 'Instance waiting for the approver' ($inst.faf001_status -eq 324010002)
        Add-Check 'Last completed step is the evaluation step' ($step -and $inst._faf001_lastcompletedstepid_value -eq $step.faf001_bpstepid)

        if ($CheckGuard) {
            $null = Complete-HumanStep $id 'Extracted Order Data Review'
            Start-Sleep -Seconds 60
            $values = @((Invoke-Dv Get "faf001_bpdatavalues?`$select=faf001_bpdatavalueid&`$filter=_faf001_bpinstanceid_value eq $id and faf001_datakey eq 'order-evaluation.result'").value)
            Add-Check 'Run-once guard: second trigger ended without work' ($values.Count -eq 1 -and @(Get-Steps $id 'Order Evaluation' $created).Count -eq 1)
        }
    }
    Write-Output "Test instance: $id"
}
finally {
    Remove-Variable token -ErrorAction SilentlyContinue
}
Write-TestResults
