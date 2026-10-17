# Lane4 Desktop (`@lane4hq/desktop`)

Local-first desktop app for macOS and Windows, built with [Tauri v2](https://tauri.app) (Rust core + system webview) and a Vite/React UI that uses the shared `@lane4hq/ui` design system.

It is Lane4's meet manager: it runs a swim meet on the pool deck, fully offline.

1. **Setup:** create a meet from the host's event file (EV3/HYV/ZIP), then import each team's entry pack (HY3/CL2/SD3/ZIP).
2. **Heat sheet:** seed heats, scratch swimmers, and move lanes. Once prelims are verified, build A/B/C finals from them. Draw the dive order for diving events. Print the heat sheet.
3. **Run meet:** connect a Colorado Time Systems console (System 6, System 5, 4000A, Gen7). Each finished race is pulled automatically and matched to its heat. An official checks pad, backup, and button times, fixes DQs and missed touches, and verifies. Diving is scored by hand on a scoresheet (dive code, DD, one award per judge).
4. **Results:** event standings and team scores, printable per event or for the whole meet.
5. **Export & publish:** a HY3 results ZIP per team (for Team Manager, TeamUnify, SwimTopia, Commit), a CSV, and a `.lane4meet` backup. Verified heats publish to the Lane4 API (`apps/api`) whenever the machine is online, and wait in a queue when it isn't. Sign in with a device code (approved at `/device` in admin) and choose the team hosting the meet.

The old meet file inspector is still there: **Inspect a file** on the home screen. See [`docs/specs/desktop-roadmap.md`](../../docs/specs/desktop-roadmap.md), [ADR 0003](../../docs/adr/0003-cts-timing-interface-split.md), and [ADR 0004](../../docs/adr/0004-offline-meet-store-and-publishing.md).

### Without a timer

Choose **Simulated CTS console** in the Run meet connection bar. It speaks the same protocol as real hardware (`@lane4hq/timing-cts/simulator`). **Swim E# H#** runs the next seeded heat with realistic times, splits, button backups, occasional missed touchpads, and relay exchanges. Untick "Console knows event/heat" to practise untitled races. `pnpm --filter @lane4hq/desktop dev:web` runs the whole flow in a browser, with meets kept in localStorage.

### Connecting a real console

- Cable the console's **top RS232 port (COM 1)** to the laptop, usually through a USB-serial adapter (FTDI or Prolific; install the driver on Windows if it doesn't show up).
- The port appears as `COMn` on Windows or `/dev/cu.usbserial-…` on macOS. The link runs at 9600 baud, odd parity, 8 data bits, 1 stop bit.
- **Last race pulled** controls where polling resumes. **Only new races** skips everything already stored on the console.

### Where data lives

The app data directory (`~/Library/Application Support/com.lane4hq.desktop/meets` on macOS, `%APPDATA%\com.lane4hq.desktop\meets` on Windows) holds:

- `<id>.json` for the meet, plus `<id>.json.bak` (the previous save; deleting a meet moves both into `trash/`);
- `<id>.captures.jsonl`, the raw timing journal;
- a `trash/` folder for deleted meets.

The publish token is kept in the macOS Keychain or Windows Credential Manager.

## Prerequisites

Everyone needs Node 24+ and pnpm (see the root `package.json`), plus the Rust toolchain:

```sh
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
# new shell, or:
source ~/.cargo/env
cargo --version
```

### macOS

- macOS 12.3 or newer. PDF printing uses WebAssembly (`wasm-unsafe-eval`), which WebKit supports from Safari 16.
- Xcode Command Line Tools: `xcode-select --install` (confirm with `xcode-select -p`).
- For universal (Apple Silicon + Intel) release builds: `rustup target add aarch64-apple-darwin x86_64-apple-darwin`.

### Windows

- Rust via [rustup-init.exe](https://rustup.rs) with the default **MSVC** toolchain.
- [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the **Desktop development with C++** workload.
- [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/). It ships with Windows 10 (recent updates) and 11. The installer downloads the bootstrapper on machines that lack it.

## Scripts

Run from the repo root:

| Command | What it does |
|---|---|
| `pnpm dev:desktop` | Launch the Tauri app with hot reload (`tauri dev`) |
| `pnpm --filter @lane4hq/desktop dev:web` | UI only, in a browser at http://localhost:1420 (native file APIs unavailable) |
| `pnpm bundle:desktop` | Release installer for the current OS (`tauri build`) |
| `pnpm --filter @lane4hq/desktop build` | Web assets only (`dist/`). This is what root `pnpm build` / Turbo runs, so it never needs Rust |
| `pnpm --filter @lane4hq/desktop test` | Vitest (TS) |
| `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml` | Rust unit tests |
| `pnpm --filter @lane4hq/desktop check:types` | TypeScript |

Bundles land in `src-tauri/target/release/bundle/`: `.app`/`.dmg` on macOS, and `.msi`/NSIS `.exe` on Windows. For a universal macOS build, run `pnpm --filter @lane4hq/desktop bundle --target universal-apple-darwin`.

## Layout

- `src/screens/`: one component per workspace section (setup, heats, run, results, export) plus the meets home and the inspector.
- `src/state/`: the meet, timing, and publish providers (`state` / `actions` / `meta` contexts).
- `src/lib/`: tested, framework-free logic: the timing session and polling, the publish-queue drainer, the meet repository and save queue, and the heat simulator.
- Domain logic comes from workspace packages: `@lane4hq/meet-engine`, `@lane4hq/timing-cts`, and `@lane4hq/swim-formats`.
- `src-tauri/`: the Rust core.
  - `timing/`: serial transport and framing.
  - `store.rs`: atomic meet files.
  - `publish.rs`: device sign-in, keychain, and HTTPS to the Lane4 API.
  - `update.rs`: app updates; `deep_link.rs`: `lane4://` links.
  - `export_file.rs`, plus `capabilities/`. Every app command is deny-by-default through the app manifest in `build.rs` and granted explicitly.

## Security notes

- A strict CSP is set in `tauri.conf.json`. No remote scripts are allowed. `'wasm-unsafe-eval'` is there only so react-pdf's WebAssembly layout engine can run; WebKit supports it from Safari 16 (macOS 12.3+ with current Safari), so PDF printing needs that on macOS.
- Printed reports are rendered in the webview and handed to `open_report`, which writes them to the app cache directory and opens them in the system PDF viewer.
- File access goes through app commands that check extensions:
  - `read_meet_file` for meet files;
  - `write_export_file` for zip/hy3/cl2/sd3/csv/lane4meet;
  - the `store_*` commands, which only touch `meets/` in the app data directory and validate meet ids.
- The Lane4 server is fixed per build, never chosen by the user. Debug builds talk to `http://localhost:8080` (API) and `http://localhost:3001` (admin, for sign-up and approving sign-ins). Release builds talk to `https://api.lane4hq.com` and `https://admin.lane4hq.com`. Set `LANE4_API_URL` / `LANE4_ADMIN_URL` when building to point a build elsewhere, e.g. staging. A token is only ever sent back to the server that issued it.
- The server must be HTTPS (localhost excepted). Sign-in and POSTs are made from Rust, so the CSP doesn't need a `connect-src` exception. The session token and the pending device code never reach the webview.
- Handle paths with Tauri APIs; never hand-join path strings, because Windows uses `\`.

- Sign-in uses the system browser (RFC 8252): the app starts a device code and opens admin's `/device` page with it filled in. After approval, the page opens `lane4://sign-in/approved` (`src-tauri/src/deep_link.rs`), which brings the app forward and polls immediately. The link carries nothing secret; only this app holds the device code that collects the token. The scheme is registered by the installers; on macOS it only works from a bundled app, so `pnpm tauri dev` falls back to the normal poll.
- Updates are verified against the updater public key compiled into the build, so neither the API nor GitHub can push an unsigned installer.

## Releases

CI (`.github/workflows/desktop.yml`) builds unsigned macOS and Windows bundles on PRs. Those builds have no updater key and never update.

To ship an update (`.github/workflows/desktop-release.yml`):

1. One time: run `pnpm --filter @lane4hq/desktop tauri signer generate -w ~/.tauri/lane4.key`. Save the private key and its password as repo secrets `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, and the public key as the repo variable `LANE4_UPDATER_PUBKEY`. Keep a backup of the private key: losing it means existing installs can't update.
2. Bump `version` in `src-tauri/tauri.conf.json`, merge, then push the tag `desktop-v<version>`.
3. The workflow builds signed updater bundles into a draft release. Publish the draft to ship it; within 5 minutes `GET /v1/desktop/update` offers it.

The app checks for an update on the meets list only, and installs only when the user chooses, so it never restarts in the middle of a meet. macOS signing and notarization start working once the `APPLE_*` secrets exist; Windows Authenticode is still to do.
