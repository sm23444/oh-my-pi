param([string]$BunPath = (Get-Command bun -ErrorAction Stop).Source)
$ErrorActionPreference = 'Stop'
$taskTestRoot = Join-Path ([IO.Path]::GetTempPath()) ('omp-zh-install-test-' + [guid]::NewGuid().ToString('N'))
$taskBeforePath = [Environment]::GetEnvironmentVariable('Path', 'User')
try {
    $taskFixture = Join-Path $taskTestRoot 'fixture'
    $taskCliDir = Join-Path $taskFixture 'node_modules\@oh-my-pi\pi-coding-agent\src'
    New-Item -ItemType Directory -Path $taskCliDir -Force | Out-Null
    $taskCli = 'const args=process.argv.slice(2); console.log(args[0]==="--version" ? "omp/18.13.2" : JSON.stringify(args));'
    [IO.File]::WriteAllText((Join-Path $taskCliDir 'cli.ts'), $taskCli, [Text.UTF8Encoding]::new($false))
    [IO.File]::WriteAllText((Join-Path $taskFixture 'omp-zh.json'), '{"version":"18.13.2","preview":true}', [Text.UTF8Encoding]::new($false))
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'install.ps1') -Destination $taskFixture
    $taskArchive = Join-Path $taskTestRoot 'fixture.zip'
    tar.exe -a -cf $taskArchive -C $taskFixture .
    if ($LASTEXITCODE -ne 0) { throw 'Installer fixture packaging failed' }
    $taskUnicode = 'cli-' + [char]0x4E2D + [char]0x6587 + ' with spaces'
    $taskInstall = Join-Path $taskTestRoot $taskUnicode
    $taskBin = Join-Path $taskTestRoot ('bin-' + $taskUnicode)
    & (Join-Path $PSScriptRoot 'install.ps1') -PackagePath $taskArchive -InstallDir $taskInstall -BinDir $taskBin -BunPath $BunPath -NoPath
    $taskLauncher = Join-Path $taskBin 'omp.cmd'
    chcp 936 > $null
    $taskVersion = & $taskLauncher --version
    if ($LASTEXITCODE -ne 0 -or ($taskVersion -join "`n") -notmatch 'omp/18\.13\.2') { throw 'Installed CLI cannot start from a Unicode path' }
    $taskForwarded = & $taskLauncher plugin 'two words' --help
    if ($LASTEXITCODE -ne 0) { throw 'Installed CLI argument forwarding failed' }
    $taskArguments = ($taskForwarded -join "`n") | ConvertFrom-Json
    if (($taskArguments -join '|') -ne 'plugin|two words|--help') { throw 'Installed CLI changed arguments' }
    if ([Environment]::GetEnvironmentVariable('Path', 'User') -ne $taskBeforePath) { throw 'Isolated installer test modified user PATH' }
    Write-Output 'Installer test passed: Unicode paths, spaces, arguments, unchanged user PATH.'
} finally {
    if (Test-Path -LiteralPath $taskTestRoot) { Remove-Item -LiteralPath $taskTestRoot -Recurse -Force }
}
