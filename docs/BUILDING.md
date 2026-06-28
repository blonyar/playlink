# Building Playlink

How to compile the Playlink server to a native binary for development, LAN testing, and deployment.

## 1. Quick build (local development)

From the repository root:

```bash
rustup run stable cargo build           # debug build, target/debug/playlink(.exe)
rustup run stable cargo run             # build + run with the default config
rustup run stable cargo test            # 59 unit + integration tests
```

The debug binary is fast to compile but slow at runtime. Use it for local development only.

## 2. Release build (single-file binary)

```bash
rustup run stable cargo build --release
# → target/release/playlink     (Linux / macOS)
# → target/release/playlink.exe (Windows)
```

Release binary characteristics (Linux x86_64, no LTO):

- Size: ~6 MB
- Cold start: <100 ms on a modern laptop
- Memory at idle: ~10 MB
- Memory under load: ~50–100 MB at 256 connections

The release build embeds the Web Debug Console through `include_dir!` so the resulting binary is self-contained: it does not need `web-console/` next to it at runtime.

## 3. Cross-compilation

Install the target with rustup and pass it to cargo:

```bash
# Linux x86_64 (from any host)
rustup target add x86_64-unknown-linux-gnu
rustup run stable cargo build --release --target x86_64-unknown-linux-gnu

# Windows from Linux/macOS (cross)
rustup target add x86_64-pc-windows-gnu
rustup run stable cargo build --release --target x86_64-pc-windows-gnu
```

For Windows MSVC targets from a non-Windows host, the toolchain setup is more involved and typically not worth the trouble — build on Windows or use GitHub Actions runners.

## 4. Optimized release with LTO

For deployment, enable link-time optimization in the workspace root `Cargo.toml`:

```toml
[profile.release]
opt-level = 3
lto = "thin"
codegen-units = 1
strip = true
```

This typically reduces the binary by ~30% and improves runtime performance. CI does not currently set this; add it for production builds.

## 5. Distributing the binary

The release binary is self-contained. Distribute it as a single file:

```text
playlink                 # the binary
README.txt              # how to run it
LICENSE                  # MIT for the JS SDK; whatever applies to the server
```

Optional: a small `start.sh` / `start.bat` for double-click launch on systems that prefer a script:

`start.sh`:

```sh
#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
exec "$DIR/playlink" "$@"
```

`start.bat`:

```bat
@echo off
"%~dp0playlink.exe" %*
```

The server reads its configuration from environment variables, so a wrapper script can also set defaults before launching the binary (e.g., `PLAYLINK_MODE=prod`, `PLAYLINK_BIND_ADDR=0.0.0.0:7777`).

## 6. Running as a service

The server does not daemonize itself. Use whatever service manager your platform provides:

- **Linux (systemd)**: write a `playlink.service` unit that runs the binary with the desired env vars.
- **Linux (Docker)**: build a small image that copies the binary in and `ENTRYPOINT`s it.
- **Windows (NSSM)**: wrap the binary with NSSM and let it manage restarts.
- **macOS (launchd)**: write a `~/Library/LaunchAgents/com.example.playlink.plist`.

A minimal systemd unit:

```ini
[Unit]
Description=Playlink room server
After=network.target

[Service]
Type=simple
Environment=PLAYLINK_MODE=prod
Environment=PLAYLINK_BIND_ADDR=0.0.0.0:7777
Environment=PLAYLINK_ALLOWED_ORIGINS=https://your-game.example
ExecStart=/opt/playlink/playlink
Restart=on-failure
RestartSec=5
User=playlink

[Install]
WantedBy=multi-user.target
```

## 7. Verifying a built binary

After copying the binary to a target machine:

```bash
# 1. Confirm the version string.
./playlink --version || true  # server does not implement --version yet; check banner log

# 2. Start it with dev mode and curl /health.
PLAYLINK_MODE=dev ./playlink &
curl http://127.0.0.1:7777/health
# {"status":"ok","name":"playlink","version":"0.1.0"}

# 3. Run the integration suite from a sibling machine.
PLAYLINK_WS_URL=ws://<server-ip>:7777/ws \
PLAYLINK_HTTP_URL=http://<server-ip>:7777 \
  npm --prefix examples/js-client run smoke
```

If the smoke test passes, the binary is good to deploy.

## 8. Embedding the Web Console

`include_dir!` in `src/main.rs` ships `web-console/` into the binary at compile time. To change the embedded assets:

1. Edit files in `web-console/`.
2. Rebuild: `rustup run stable cargo build --release`.
3. The new binary serves the updated console on `/`.

For local development without rebuilding, set `PLAYLINK_WEB_DIR=/path/to/web-console` and the server will serve files from that directory instead of the embedded ones. The env var is checked once at startup.

## 9. CI artifact publishing

The GitHub Actions workflow in `.github/workflows/ci.yml` runs tests on every push but does not yet produce a release artifact. To add release artifacts on tag pushes, add a separate `release.yml` workflow:

```yaml
name: release
on:
  push:
    tags: ['v*']
jobs:
  build:
    strategy:
      matrix:
        include:
          - target: x86_64-unknown-linux-gnu
            os: ubuntu-latest
            artifact: playlink-linux-x86_64
          - target: x86_64-pc-windows-msvc
            os: windows-latest
            artifact: playlink-windows-x86_64.exe
          - target: x86_64-apple-darwin
            os: macos-latest
            artifact: playlink-macos-x86_64
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.target }}
      - run: rustup run stable cargo build --release --target ${{ matrix.target }}
      - uses: actions/upload-artifact@v4
        with:
          name: ${{ matrix.artifact }}
          path: target/${{ matrix.target }}/release/playlink*
```

This produces three platform binaries per tag, ready to attach to a GitHub Release.

## 10. Size and dependency footprint

The release binary statically links the Rust standard library and pulls in only the runtime crates you see in `Cargo.toml`:

```text
axum 0.7
dashmap 5
futures-util 0.3
serde 1
serde_json 1
tokio 1 (full)
tower-http 0.5 (cors, fs, trace)
tracing 0.1
tracing-subscriber 0.3
uuid 1
include_dir 0.7
```

There are no C dependencies and no system libraries to install beyond the standard libc. The Windows MSVC build uses the Visual C++ runtime, which is present by default on all modern Windows installs.
