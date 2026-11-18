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
    # Re-run on an instance this script created earlier: deletes only its SAP payload artifacts and completes a
    # new Order Evaluation Review step, so the run takes the stage time instead of the seeding time.
    [guid]$InstanceId,
    # After the stage completed, completes the review step again and asserts the run-once guard ends it.
    [switch]$CheckGuard
)

# Stage test for finalize-order. Seeds what the earlier stages leave (the reviewer's corrected order, the
# approver's decision, the Order Evaluation Review step), completes that step, waits, then asserts the
# acceptance criteria and the run time. It writes to the target environment and leaves the labelled test
# instance in place.

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'test-common.ps1')

function Get-Artifacts([guid]$Instance) {
    @((Invoke-Dv Get "faf001_bpartifacts?`$select=faf001_bpartifactid,faf001_artifactname,faf001_artifacttype,faf001_filesize&`$filter=_faf001_bpinstanceid_value eq $Instance and faf001_artifacttype eq 324010005").value)
}

try {
    Connect-TestEnvironment $EnvironmentUrl $TenantId $OrganizationId
    $orderJson = Get-Content (Join-Path $PSScriptRoot 'test-data/sample-extracted-order.json') -Raw
    $order = $orderJson | ConvertFrom-Json

    if ($InstanceId) {
        Assert-TestInstance $InstanceId
        foreach ($a in Get-Artifacts $InstanceId) { $null = Invoke-Dv Delete "faf001_bpartifacts($($a.faf001_bpartifactid))" }
        $id = $InstanceId
    }
    else {
        $id = New-TestInstance 'finalize-order' 324010002 'waiting for reviewing agent order evaluation'
        New-DataValue $id 'extracted-order-review.edited_order' $null $orderJson
        New-DataValue $id 'order-evaluation-review.decision' $Decision $null
    }

    $created = [DateTime]::UtcNow
    $humanStep = Complete-HumanStep $id 'Order Evaluation Review'
    Write-Output "Completed Order Evaluation Review step $humanStep ($Decision); waiting up to $TimeoutMinutes minute(s)..."

    $inst = Wait-For { $i = Invoke-Dv Get "faf001_bpinstances($id)?`$select=faf001_status,faf001_statusmessage,faf001_endtime,faf001_errorcode,faf001_errormessage,_faf001_lastcompletedstepid_value"
        if ($i.faf001_status -in @(324010004, 324010005)) { $i } } $TimeoutMinutes
    $elapsed = [DateTime]::UtcNow - $created
    Write-Output ("Instance status {0} after {1:N1} minute(s)" -f $inst.faf001_status, $elapsed.TotalMinutes)
    Add-Check 'Instance completed' ($inst -and $inst.faf001_status -eq 324010004) "$($inst.faf001_statusmessage) $($inst.faf001_errorcode) $($inst.faf001_errormessage)"
    Add-Check 'End time recorded, no error' ($inst -and $inst.faf001_endtime -and -not $inst.faf001_errorcode)

    if ($Decision -eq 'rejected') {
        Add-Check 'Order Rejected step recorded' (@(Get-Steps $id 'Order Rejected' $created).Count -eq 1)
        Add-Check 'No SAP payload generated' ((Get-Artifacts $id).Count -eq 0 -and @(Get-Steps $id 'Generate SAP order payload' $created).Count -eq 0)
    }
    else {
        Add-Check "Run time within $MaxRunMinutes minutes" ($elapsed.TotalMinutes -le $MaxRunMinutes) ('{0:N1} min' -f $elapsed.TotalMinutes)
        $sap = @(Get-Steps $id 'Generate SAP order payload' $created)
        Add-Check 'Payload step completed once' ($sap.Count -eq 1 -and $sap[0].faf001_status -eq 324010003) "found $($sap.Count)"
        Add-Check 'Order Validated step recorded' (@(Get-Steps $id 'Order Validated' $created).Count -eq 1)
        Add-Check 'Last completed step is the payload step' ($sap.Count -ge 1 -and $inst._faf001_lastcompletedstepid_value -eq $sap[0].faf001_bpstepid)

        $artifacts = @(Get-Artifacts $id)
        Add-Check 'One SAP payload artifact named after the customer PO' ($artifacts.Count -eq 1 -and $artifacts[0].faf001_artifactname -eq "SAP_SalesOrder_$($order.order_id).json") "$($artifacts.faf001_artifactname)"
        if ($artifacts.Count -ge 1) {
            $tmp = New-TemporaryFile
            try {
                Invoke-WebRequest -Uri "$($script:Api)/faf001_bpartifacts($($artifacts[0].faf001_bpartifactid))/faf001_file/`$value" -Headers $script:Headers -OutFile $tmp -ErrorAction Stop
                $payload = Get-Content $tmp -Raw | ConvertFrom-Json
            }
            finally { Remove-Item $tmp -ErrorAction SilentlyContinue }
            Add-Check 'Payload file is the SAP order, one item per line' ($payload.SalesOrderType -and $payload.TransactionCurrency -eq $order.currency -and @($payload.to_Item).Count -eq @($order.line_items).Count) "items=$(@($payload.to_Item).Count)"
            Add-Check 'Payload carries the customer PO and the SKUs' ($payload.PurchaseOrderByCustomer -eq $order.order_id -and -not (Compare-Object @($payload.to_Item.Material) @($order.line_items.sku))) "$($payload.PurchaseOrderByCustomer)"
        }
        if ($CheckGuard) {
            $null = Complete-HumanStep $id 'Order Evaluation Review'
            Start-Sleep -Seconds 60
            Add-Check 'Run-once guard: second trigger ended without work' ((Get-Artifacts $id).Count -eq 1 -and @(Get-Steps $id 'Generate SAP order payload' $created).Count -eq 1)
        }
    }
    Write-Output "Test instance: $id"
}
finally {
    Remove-Variable token -ErrorAction SilentlyContinue
}
Write-TestResults
