[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [uri]$EnvironmentUrl,
    [Parameter(Mandatory)]
    [guid]$TenantId,
    [Parameter(Mandatory)]
    [guid]$OrganizationId
)

$ErrorActionPreference = 'Stop'
if (-not $EnvironmentUrl.IsAbsoluteUri -or $EnvironmentUrl.Scheme -ne 'https' -or
    $EnvironmentUrl.UserInfo -or $EnvironmentUrl.Query -or $EnvironmentUrl.Fragment -or
    $EnvironmentUrl.AbsolutePath -ne '/') {
    throw 'EnvironmentUrl must be an HTTPS Dataverse origin without credentials, query, or path.'
}
$org = $EnvironmentUrl.GetLeftPart([UriPartial]::Authority)
$flowNames = @('finalize-order', 'validate-order', 'extract-order-data', 'mail-order-intake')
$token = az account get-access-token --tenant $TenantId --resource $org --query accessToken --output tsv
if ($LASTEXITCODE -ne 0 -or -not $token) { throw 'Could not acquire Dataverse token.' }
$headers = @{ Authorization = "Bearer $token"; Accept = 'application/json' }

try {
    $api = "$org/api/data/v9.2"
    $identity = Invoke-RestMethod -Headers $headers -Uri "$api/WhoAmI" -ErrorAction Stop
    if ($identity.OrganizationId -ne $OrganizationId.ToString()) { throw 'Unexpected organization; no flows activated.' }
    $fetchXml = @'
<fetch distinct="true">
    <entity name="workflow">
        <attribute name="workflowid" />
        <attribute name="name" />
        <attribute name="statecode" />
        <filter>
            <condition attribute="category" operator="eq" value="5" />
            <condition attribute="type" operator="eq" value="1" />
            <condition attribute="name" operator="in">
                <value>finalize-order</value>
                <value>validate-order</value>
                <value>extract-order-data</value>
                <value>mail-order-intake</value>
            </condition>
        </filter>
        <link-entity name="solutioncomponent" from="objectid" to="workflowid">
            <filter><condition attribute="componenttype" operator="eq" value="29" /></filter>
            <link-entity name="solution" from="solutionid" to="solutionid">
                <filter><condition attribute="uniquename" operator="eq" value="OrderProcessing" /></filter>
            </link-entity>
        </link-entity>
    </entity>
</fetch>
'@
    $result = Invoke-RestMethod -Headers $headers -Uri "$api/workflows?fetchXml=$([Uri]::EscapeDataString($fetchXml))" -ErrorAction Stop
    $flows = @($result.value)
    foreach ($flowName in $flowNames) {
        $matches = @($flows | Where-Object { $_.name -eq $flowName })
        if ($matches.Count -ne 1) { throw "Expected one '$flowName' in OrderProcessing; no flows activated." }
        if ($matches[0].statecode -notin @(0, 1)) { throw "Unexpected state for '$flowName'; no flows activated." }
    }
    foreach ($flowName in $flowNames) {
        $flow = $flows | Where-Object { $_.name -eq $flowName }
        $flowUri = "$api/workflows($($flow.workflowid))"
        $current = Invoke-RestMethod -Headers $headers -Uri "$flowUri`?`$select=name,statecode,statuscode" -ErrorAction Stop
        if ($current.statecode -eq 1) {
            Write-Output "Unchanged: '$flowName' is already active."
            continue
        }
        if ($current.statecode -ne 0) { throw "Unexpected state for '$flowName'; activation stopped." }
        $updateHeaders = $headers.Clone()
        $updateHeaders['If-Match'] = $current.'@odata.etag'
        $null = Invoke-RestMethod -Method Patch -Headers $updateHeaders -Uri $flowUri -ContentType 'application/json' -Body '{"statecode":1}' -ErrorAction Stop
        $after = Invoke-RestMethod -Headers $headers -Uri "$flowUri`?`$select=name,statecode,statuscode" -ErrorAction Stop
        if ($after.statecode -ne 1) { throw "Activation not verified for '$flowName'; inspect the flow before retrying." }
        Write-Output "Activated: '$flowName'."
    }
} finally {
    Remove-Variable token, headers, updateHeaders -ErrorAction SilentlyContinue
}