#Requires -Version 7.0
[CmdletBinding()]
param(
    [ValidateSet('Debug', 'Release')]
    [string]$Configuration = 'Release'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$project = Join-Path $repositoryRoot 'src/BusinessProcessApi/BusinessProcessApi.csproj'
$assembly = Join-Path $repositoryRoot "src/BusinessProcessApi/bin/$Configuration/net462/business-process-api.dll"
$artifactDirectory = Join-Path $repositoryRoot 'artifacts/package'
$stagingDirectory = Join-Path ([IO.Path]::GetTempPath()) "business-process-api-$([Guid]::NewGuid().ToString('N'))"

try {
    New-Item -ItemType Directory -Path $stagingDirectory -Force | Out-Null
    New-Item -ItemType Directory -Path $artifactDirectory -Force | Out-Null

    & dotnet pack $project --configuration $Configuration --no-restore `
        -p:GeneratePackageOnBuild=false -p:IncludeBuildOutput=true --output $stagingDirectory
    if ($LASTEXITCODE -ne 0) { throw 'Plug-in packaging failed.' }

    $packages = @(Get-ChildItem -Path $stagingDirectory -Filter '*.nupkg' |
        Where-Object Name -NotLike '*.symbols.nupkg')
    if ($packages.Count -ne 1) { throw "Expected one package but found $($packages.Count)." }
    if (-not (Test-Path -LiteralPath $assembly)) { throw "Build output not found: $assembly" }

    $archive = [IO.Compression.ZipFile]::OpenRead($packages[0].FullName)
    try {
        $entry = $archive.GetEntry('lib/net462/business-process-api.dll')
        if ($null -eq $entry) { throw 'Package does not contain lib/net462/business-process-api.dll.' }
        $stream = $entry.Open()
        try { $embeddedHash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($stream)) }
        finally { $stream.Dispose() }
    }
    finally { $archive.Dispose() }

    $assemblyHash = (Get-FileHash -LiteralPath $assembly -Algorithm SHA256).Hash
    if ($embeddedHash -ne $assemblyHash) { throw 'Packaged DLL differs from the current build output.' }

    $destination = Join-Path $artifactDirectory $packages[0].Name
    Copy-Item -LiteralPath $packages[0].FullName -Destination $destination -Force
    [pscustomobject]@{
        PackagePath = $destination
        PackageSha256 = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash
        AssemblySha256 = $assemblyHash
    } | Format-List
}
finally {
    if (Test-Path -LiteralPath $stagingDirectory) {
        Remove-Item -LiteralPath $stagingDirectory -Recurse -Force
    }
}