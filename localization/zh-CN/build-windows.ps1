param(
    [Parameter(Mandatory = $true)][string]$Version,
    [Parameter(Mandatory = $true)][string]$Destination,
    [switch]$Preview
)
$ErrorActionPreference = 'Stop'
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid stable version' }
$taskBun = (Get-Command bun -ErrorAction Stop).Source
$taskRoot = $PSScriptRoot
$taskManifest = Invoke-RestMethod -Uri "https://registry.npmjs.org/@oh-my-pi%2fpi-coding-agent/$Version"
if ($taskManifest.version -ne $Version) { throw 'Registry version mismatch' }
$taskNativeVersion = $taskManifest.dependencies.'@oh-my-pi/pi-natives'
if ($taskNativeVersion -notmatch '^\d+\.\d+\.\d+$') { throw 'Unexpected native dependency version; update packaging adapter' }
if (Test-Path -LiteralPath $Destination) { throw 'Portable destination must be a new directory' }
New-Item -ItemType Directory -Path $Destination | Out-Null
$taskPackage = @{
    name = 'omp-zh-portable'; private = $true; version = $Version
    dependencies = @{
        '@oh-my-pi/pi-coding-agent' = $Version
        '@oh-my-pi/pi-natives-win32-x64' = $taskNativeVersion
    }
} | ConvertTo-Json -Depth 5
[IO.File]::WriteAllText((Join-Path $Destination 'package.json'), $taskPackage, [Text.UTF8Encoding]::new($false))
$taskCacheDir = Join-Path $Destination '.install-cache'
& $taskBun install --cwd $Destination --ignore-scripts --omit optional --backend copyfile --cache-dir $taskCacheDir
if ($LASTEXITCODE -ne 0) { throw 'Portable dependency installation failed' }
Remove-Item -LiteralPath $taskCacheDir -Recurse -Force
$taskApply = @('apply', '--source', $Destination, '--layout', 'npm', '--version', $Version, '--report', (Join-Path $Destination 'translation-report'))
if ($Preview) { $taskApply += '--allow-missing' }
& $taskBun (Join-Path $taskRoot 'pipeline.ts') @taskApply
if ($LASTEXITCODE -ne 0) { throw 'Portable translation validation failed' }
$taskLauncher = @'
@echo off
bun "%~dp0node_modules\@oh-my-pi\pi-coding-agent\src\cli.ts" %*
exit /b %errorlevel%
'@
[IO.File]::WriteAllText((Join-Path $Destination 'omp.cmd'), $taskLauncher.Replace("`n", "`r`n"), [Text.UTF8Encoding]::new($false))
Copy-Item -LiteralPath (Join-Path $taskRoot 'SEED-LICENSE') -Destination $Destination
Copy-Item -LiteralPath (Join-Path $taskRoot 'install.ps1') -Destination $Destination
[IO.File]::WriteAllText((Join-Path $Destination 'omp-zh.json'), (@{version=$Version; preview=$Preview.IsPresent} | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
$taskReadme = (Get-Content -LiteralPath (Join-Path $taskRoot 'windows-readme.txt') -Raw -Encoding UTF8).Replace('{{VERSION}}', $Version).Replace('{{PREVIEW}}', [string]$Preview.IsPresent)
[IO.File]::WriteAllText((Join-Path $Destination 'README.zh-CN.txt'), $taskReadme, [Text.UTF8Encoding]::new($false))
$taskLauncherPath = Join-Path $Destination 'omp.cmd'
$taskVersionOutput = & $taskLauncherPath --version
if ($LASTEXITCODE -ne 0 -or ($taskVersionOutput -join "`n") -notmatch [regex]::Escape($Version)) { throw 'Portable version check failed' }
$taskHelpOutput = & $taskLauncherPath --help
if ($LASTEXITCODE -ne 0 -or ($taskHelpOutput -join "`n") -notmatch '[\u3400-\u9fff]') { throw 'Portable Chinese help check failed' }
& $taskLauncherPath --smoke-test
if ($LASTEXITCODE -ne 0) { throw 'Portable worker smoke test failed' }
if (-not $Preview) {
    $taskUiProbe = Join-Path $Destination 'ui-smoke.ts'
    Copy-Item -LiteralPath (Join-Path $taskRoot 'ui-smoke.ts') -Destination $taskUiProbe
    try {
        & $taskBun $taskUiProbe
        if ($LASTEXITCODE -ne 0) { throw 'Portable Chinese menu and welcome UI check failed' }
    } finally {
        Remove-Item -LiteralPath $taskUiProbe -Force
    }
}
Write-Output "CLI package verified: $Version"
