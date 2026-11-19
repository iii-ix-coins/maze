param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectRoot
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath $ProjectRoot).Path
if (-not (Test-Path -LiteralPath (Join-Path $root 'package.json'))) {
    throw "ProjectRoot does not contain package.json: $root"
}

$directories = @(
    'engines/tx-engine',
    'engines/verify-engine'
)
$files = @(
    'HELIUS_SIGNATURE_DIAGNOSTIC.js',
    'shared/state/txState.js',
    'shared/state/tx-state.json'
)

function Remove-ProjectPath([string]$relativePath, [bool]$isDirectory) {
    $candidate = [System.IO.Path]::GetFullPath((Join-Path $root $relativePath))
    $rootPrefix = $root.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
    if (-not $candidate.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to remove a path outside ProjectRoot: $relativePath"
    }
    if (Test-Path -LiteralPath $candidate) {
        if ($isDirectory) {
            Remove-Item -LiteralPath $candidate -Recurse -Force
        } else {
            Remove-Item -LiteralPath $candidate -Force
        }
        Write-Host "Removed: $relativePath"
    } else {
        Write-Host "Already absent: $relativePath"
    }
}

foreach ($path in $directories) { Remove-ProjectPath $path $true }
foreach ($path in $files) { Remove-ProjectPath $path $false }

Write-Host 'Retired TX/Verify paths removed.' -ForegroundColor Green
