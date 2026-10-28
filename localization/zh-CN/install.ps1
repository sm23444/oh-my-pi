param(
    [string]$Repository = 'sm23444/oh-my-pi',
    [string]$InstallDir = (Join-Path $env:LOCALAPPDATA 'omp-zh'),
    [switch]$Check,
    [string]$PackagePath = '',
    [string]$BunPath = ''
)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
if ($Repository -notmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$') { throw 'Invalid repository name' }
$taskHeaders = @{ 'User-Agent' = 'omp-zh-installer'; 'Accept' = 'application/vnd.github+json' }
$taskRelease = $null
if (-not $PackagePath) {
    $taskRelease = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repository/releases/latest" -Headers $taskHeaders
    if ($taskRelease.tag_name -notmatch '^zh-v\d+\.\d+\.\d+(?:-r\d+\.\d+)?$') { throw 'No supported Chinese CLI release found yet' }
    $taskAsset = @($taskRelease.assets | Where-Object { $_.name -eq 'omp-zh-cli-windows-x64.zip' })
    $taskChecksums = @($taskRelease.assets | Where-Object { $_.name -eq 'SHA256SUMS.txt' })
    if ($taskAsset.Count -ne 1 -or $taskChecksums.Count -ne 1) { throw 'Chinese CLI release assets are incomplete' }
}
if ($Check) {
    $taskInstalled = 'not installed'
    $taskStatePath = Join-Path $InstallDir 'installed.json'
    if (Test-Path -LiteralPath $taskStatePath) { $taskInstalled = (Get-Content -LiteralPath $taskStatePath -Raw | ConvertFrom-Json).version }
    Write-Output "Installed: $taskInstalled; latest Chinese release: $($taskRelease.tag_name)"
    return
}
$taskTemp = Join-Path ([IO.Path]::GetTempPath()) ('omp-zh-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $taskTemp | Out-Null
try {
    if (-not $PackagePath) {
        $PackagePath = Join-Path $taskTemp 'cli.zip'
        Invoke-WebRequest -UseBasicParsing -Uri $taskAsset[0].browser_download_url -OutFile $PackagePath
        $taskChecksumFile = Join-Path $taskTemp 'SHA256SUMS.txt'
        Invoke-WebRequest -UseBasicParsing -Uri $taskChecksums[0].browser_download_url -OutFile $taskChecksumFile
        $taskExpectedLine = @(Get-Content -LiteralPath $taskChecksumFile | Where-Object { $_ -match '^[a-fA-F0-9]{64}\s+\*?omp-zh-cli-windows-x64\.zip$' })
        if ($taskExpectedLine.Count -ne 1) { throw 'Missing CLI archive checksum' }
        $taskExpected = ($taskExpectedLine[0] -split '\s+')[0]
        if ((Get-FileHash -LiteralPath $PackagePath -Algorithm SHA256).Hash -ne $taskExpected) { throw 'CLI archive checksum mismatch' }
    }
    $taskExtracted = Join-Path $taskTemp 'package'
    Expand-Archive -LiteralPath $PackagePath -DestinationPath $taskExtracted
    $taskMetadata = Get-Content -LiteralPath (Join-Path $taskExtracted 'omp-zh.json') -Raw | ConvertFrom-Json
    if ($taskMetadata.version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid CLI package metadata' }
    if ($taskRelease -and ($taskRelease.tag_name -replace '-r\d+\.\d+$', '') -ne ('zh-v' + $taskMetadata.version)) { throw 'CLI package version mismatch' }
    if (-not $BunPath) {
        $taskBunCommand = Get-Command bun -ErrorAction SilentlyContinue
        if ($taskBunCommand) { $BunPath = $taskBunCommand.Source }
    }
    if (-not $BunPath) {
        $BunPath = Join-Path $InstallDir 'runtime\bun.exe'
        if (-not (Test-Path -LiteralPath $BunPath)) {
            $taskBunVersion = 'bun-v1.4.4'
            $taskBunArchive = Join-Path $taskTemp 'bun.zip'
            $taskBunSums = Join-Path $taskTemp 'bun-sums.txt'
            Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/oven-sh/bun/releases/download/$taskBunVersion/bun-windows-x64.zip" -OutFile $taskBunArchive
            Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/oven-sh/bun/releases/download/$taskBunVersion/SHASUMS256.txt" -OutFile $taskBunSums
            $taskBunLine = @(Get-Content -LiteralPath $taskBunSums | Where-Object { $_ -match '^[a-fA-F0-9]{64}\s+\*?(?:\./)?bun-windows-x64\.zip$' })
            if ($taskBunLine.Count -ne 1 -or (Get-FileHash -LiteralPath $taskBunArchive -Algorithm SHA256).Hash -ne ($taskBunLine[0] -split '\s+')[0]) { throw 'Bun archive checksum mismatch' }
            Expand-Archive -LiteralPath $taskBunArchive -DestinationPath (Join-Path $taskTemp 'bun')
            New-Item -ItemType Directory -Path (Split-Path $BunPath) -Force | Out-Null
            Copy-Item -LiteralPath (Join-Path $taskTemp 'bun\bun-windows-x64\bun.exe') -Destination $BunPath
        }
    }
    $BunPath = (Resolve-Path -LiteralPath $BunPath).Path
    $taskVersionOutput = & $BunPath (Join-Path $taskExtracted 'node_modules\@oh-my-pi\pi-coding-agent\src\cli.ts') --version
    if ($LASTEXITCODE -ne 0 -or ($taskVersionOutput -join "`n") -notmatch [regex]::Escape($taskMetadata.version)) { throw 'New CLI could not start; current launcher retained' }
    $taskDestination = Join-Path $InstallDir ('versions\' + $taskMetadata.version + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
    New-Item -ItemType Directory -Path (Split-Path $taskDestination) -Force | Out-Null
    Move-Item -LiteralPath $taskExtracted -Destination $taskDestination
    $taskBinDir = Join-Path $env:USERPROFILE '.local\bin'
    New-Item -ItemType Directory -Path $taskBinDir -Force | Out-Null
    # The launcher intercepts only self-update. Plugin updates continue to use official CLI handling.
    $taskLauncher = @"
@echo off
chcp 65001 >nul
if not "%~1"=="update" goto run
for %%A in (%*) do if "%%~A"=="--plugins" goto run
for %%A in (%*) do if "%%~A"=="-l" goto run
if "%~2"=="--check" goto check
if "%~2"=="-c" goto check
if not "%~2"=="" goto updatehelp
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$taskDestination\install.ps1" -Repository "$Repository" -InstallDir "$InstallDir" -BunPath "$BunPath"
exit /b %errorlevel%
:check
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$taskDestination\install.ps1" -Repository "$Repository" -InstallDir "$InstallDir" -BunPath "$BunPath" -Check
exit /b %errorlevel%
:updatehelp
echo omp update ^| omp update --check
exit /b 1
:run
"$BunPath" "$taskDestination\node_modules\@oh-my-pi\pi-coding-agent\src\cli.ts" %*
exit /b %errorlevel%
"@
    $taskLauncherPath = Join-Path $taskBinDir 'omp.cmd'
    if (Test-Path -LiteralPath $taskLauncherPath) {
        Copy-Item -LiteralPath $taskLauncherPath -Destination (Join-Path $InstallDir ('previous-launcher-' + [DateTime]::Now.ToString('yyyyMMddHHmmssfff') + '.cmd'))
    }
    [IO.File]::WriteAllText($taskLauncherPath, $taskLauncher, [Text.UTF8Encoding]::new($false))
    [IO.File]::WriteAllText((Join-Path $InstallDir 'installed.json'), (@{ version = $taskMetadata.version; directory = $taskDestination } | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
    $taskUserPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $taskParts = @($taskUserPath -split ';' | Where-Object { $_ -and $_.TrimEnd('\') -ine $taskBinDir.TrimEnd('\') })
    [Environment]::SetEnvironmentVariable('Path', ((@($taskBinDir) + $taskParts) -join ';'), 'User')
    $env:Path = $taskBinDir + ';' + $env:Path
    Write-Output "OMP $($taskMetadata.version) Chinese CLI installed. Reopen PowerShell and type omp. Run omp update to upgrade."
} finally {
    if (Test-Path -LiteralPath $taskTemp) { Remove-Item -LiteralPath $taskTemp -Recurse -Force }
}
