[CmdletBinding()]
param(
    [switch]$SkipIntegration,
    [string]$BindAddr = "127.0.0.1:7777"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$serverProcess = $null
$startedServer = $false
$previousBindAddr = $env:PLAYLINK_BIND_ADDR
$previousHttpUrl = $env:PLAYLINK_HTTP_URL
$previousWsUrl = $env:PLAYLINK_WS_URL

function Invoke-External {
    param(
        [string]$Name,
        [scriptblock]$Command
    )

    Write-Host ""
    Write-Host "==> $Name"
    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$Name failed with exit code $LASTEXITCODE"
    }
}

function Test-ServerHealth {
    param([string]$HealthUrl)

    & curl.exe --noproxy "*" --silent --fail $HealthUrl | Out-Null
    return $LASTEXITCODE -eq 0
}

function Restore-Env {
    if ($null -eq $previousBindAddr) {
        Remove-Item Env:\PLAYLINK_BIND_ADDR -ErrorAction SilentlyContinue
    } else {
        $env:PLAYLINK_BIND_ADDR = $previousBindAddr
    }

    if ($null -eq $previousHttpUrl) {
        Remove-Item Env:\PLAYLINK_HTTP_URL -ErrorAction SilentlyContinue
    } else {
        $env:PLAYLINK_HTTP_URL = $previousHttpUrl
    }

    if ($null -eq $previousWsUrl) {
        Remove-Item Env:\PLAYLINK_WS_URL -ErrorAction SilentlyContinue
    } else {
        $env:PLAYLINK_WS_URL = $previousWsUrl
    }
}

Push-Location $repoRoot
try {
    $hostPart, $portPart = $BindAddr.Split(":", 2)
    if ([string]::IsNullOrWhiteSpace($hostPart) -or [string]::IsNullOrWhiteSpace($portPart)) {
        throw "BindAddr must look like 127.0.0.1:7777"
    }

    $httpUrl = "http://$BindAddr"
    $wsUrl = "ws://$BindAddr/ws"
    $healthUrl = "$httpUrl/health"

    Invoke-External "Rust format" { rustup run stable cargo fmt --check }
    Invoke-External "Rust check" { rustup run stable cargo check }
    Invoke-External "Rust tests" { rustup run stable cargo test }

    $jsFiles = @(
        "examples/js-client/playlink-client.js",
        "examples/js-client/sdk-demo.js",
        "examples/js-client/mini-game.js",
        "examples/js-client/mini-game-server.js",
        "web-console/assets/app.js",
        "examples/js-client/smoke.js",
        "examples/js-client/errors.js",
        "examples/js-client/state-sync.js",
        "examples/js-client/idle-timeout.js",
        "examples/js-client/discover-lan.js"
    )

    foreach ($file in $jsFiles) {
        Invoke-External "JS syntax: $file" { node --check $file }
    }

    Invoke-External "JS helper: state-sync" { npm --prefix examples/js-client run state-sync }

    if (-not $SkipIntegration) {
        Invoke-External "Build Playlink server" { rustup run stable cargo build }

        $env:PLAYLINK_BIND_ADDR = $BindAddr
        $env:PLAYLINK_HTTP_URL = $httpUrl
        $env:PLAYLINK_WS_URL = $wsUrl

        if (Test-ServerHealth $healthUrl) {
            Write-Host ""
            Write-Host "==> Reusing running Playlink server at $httpUrl"
        } else {
            $serverExe = Join-Path $repoRoot "target/debug/playlink.exe"
            $stdoutLog = Join-Path $env:TEMP "playlink-verify-server.out.log"
            $stderrLog = Join-Path $env:TEMP "playlink-verify-server.err.log"

            Write-Host ""
            Write-Host "==> Starting Playlink server at $httpUrl"
            $serverProcess = Start-Process `
                -WindowStyle Hidden `
                -PassThru `
                -FilePath $serverExe `
                -WorkingDirectory $repoRoot `
                -RedirectStandardOutput $stdoutLog `
                -RedirectStandardError $stderrLog
            $startedServer = $true

            $ready = $false
            for ($i = 0; $i -lt 40; $i++) {
                Start-Sleep -Milliseconds 250
                if (Test-ServerHealth $healthUrl) {
                    $ready = $true
                    break
                }
                if ($serverProcess.HasExited) {
                    break
                }
            }

            if (-not $ready) {
                Write-Host "Server stdout:"
                if (Test-Path $stdoutLog) { Get-Content -Raw $stdoutLog }
                Write-Host "Server stderr:"
                if (Test-Path $stderrLog) { Get-Content -Raw $stderrLog }
                throw "Playlink server did not become healthy at $healthUrl"
            }
        }

        Invoke-External "JS integration: smoke" { npm --prefix examples/js-client run smoke }
        Invoke-External "JS integration: errors" { npm --prefix examples/js-client run errors }
        Invoke-External "JS integration: sdk-demo" { npm --prefix examples/js-client run sdk-demo }
    }

    Write-Host ""
    Write-Host "Playlink verification passed."
} finally {
    if ($startedServer -and $null -ne $serverProcess -and -not $serverProcess.HasExited) {
        Stop-Process -Id $serverProcess.Id -Force
        Wait-Process -Id $serverProcess.Id -ErrorAction SilentlyContinue
    }
    Restore-Env
    Pop-Location
}
