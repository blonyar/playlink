# Build and run the Playlink GUI launcher.
#
# The launcher is gated behind the `launcher` Cargo feature so the
# server-only `cargo build` / `cargo test` paths (CI, verify.ps1) do
# not pull in eframe / winit / rfd / chrono. This script just turns
# the feature on and runs the resulting exe.
#
# Usage:
#   .\scripts\run-launcher.ps1            # build (debug) + run
#   .\scripts\run-launcher.ps1 -Release   # build (release) + run
#   .\scripts\run-launcher.ps1 -SkipBuild # just run an already-built binary

[CmdletBinding()]
param(
    [switch]$Release,
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot
try {
    if (-not $SkipBuild) {
        $profile = if ($Release) { "release" } else { "dev" }
        Write-Host "==> Building playlink-launcher ($profile, --features launcher)"
        $args = @("run", "stable", "cargo", "build", "--features", "launcher", "--bin", "playlink-launcher")
        if ($Release) { $args += "--release" }
        & rustup @args
        if ($LASTEXITCODE -ne 0) {
            throw "cargo build failed (exit $LASTEXITCODE)"
        }
    }

    $exe = if ($Release) {
        Join-Path $repoRoot "target\release\playlink-launcher.exe"
    } else {
        Join-Path $repoRoot "target\debug\playlink-launcher.exe"
    }

    if (-not (Test-Path -LiteralPath $exe)) {
        throw "Launcher binary not found at $exe. Run without -SkipBuild first."
    }

    Write-Host "==> Launching $exe"
    & $exe
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        Write-Host "launcher exited with code $exitCode"
    }
} finally {
    Pop-Location
}
