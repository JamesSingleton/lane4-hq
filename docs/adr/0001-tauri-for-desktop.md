# 0001. Tauri v2 for the desktop app

- **Status:** Accepted
- **Date:** 2026-09-28

## Context

`apps/desktop` started as the Electron quick-start (a `BrowserWindow` loading a hello-world page). The desktop app has to:

- run on **macOS and Windows** (Linux is not a goal, but shouldn't be ruled out);
- work **offline**, in pool decks and timing booths with unreliable network;
- open coach and host files (HY3, CL2, SD3, EV3, HYV, XLS, ZIP) with the same parsers the web app uses (`@lane4hq/swim-formats`, which is browser-safe);
- later, talk to timing hardware over RS232/USB-serial with tight timing windows (see [ADR 0003](0003-cts-timing-interface-split.md));
- run meets as Lane4's meet manager. Team management stays on the web (see [ADR 0002](0002-desktop-is-for-running-meets.md)).

## Decision

Use **Tauri v2**: a Rust core with the OS webview (WKWebView on macOS, WebView2 on Windows), and a **Vite + React + TypeScript** UI that consumes the existing workspace packages (`@lane4hq/ui`, `@lane4hq/swim-formats`, `@lane4hq/swim-core`).

- Domain logic stays in TypeScript packages with Vitest coverage, as the repo already requires. Rust stays thin: windowing, OS integration, file access, and (later) serial transport.
- Security posture:
  - a strict CSP with no remote scripts;
  - Tauri commands are deny-by-default. `apps/desktop/src-tauri/build.rs` lists them, and `capabilities/default.json` grants the main window only what it needs: dialogs, meet-file read and export write, the meet store, serial timing, keychain sign-in and publishing, and the updater. There is no blanket filesystem scope;
  - meet files are read through a single `read_meet_file` command that only accepts meet-file extensions (max 50 MB), instead of a broad fs-plugin scope. That keeps drag-and-drop from USB sticks and other drives working without granting the webview blanket read access.
- Bundles: `.app`/`.dmg` (universal) on macOS, NSIS and MSI on Windows, with WebView2 bootstrapped when missing.
- Root `pnpm build` (Turbo) only builds the desktop web assets, so no one needs Rust to build the monorepo. Native bundles are an explicit `pnpm bundle:desktop`, and run in CI on macOS and Windows runners.

## Consequences

- **Pros**
  - Installers are small: a release `.app` is about 3.5 MB, versus 100+ MB for Electron.
  - Memory use is lower.
  - Rust is a good fit for serial I/O.
  - The webview runs the same TS parsers as admin, so files parse identically in both apps.
- **Cons**
  - Contributors who build native bundles need a Rust toolchain (plus MSVC Build Tools on Windows).
  - Webview engines differ by OS (WebKit vs Chromium), so UI must be checked on both. The Vite build targets `safari15` and `chrome105`. The macOS bundle's `minimumSystemVersion` is 12.3, because PDF printing uses `wasm-unsafe-eval` and WebKit supports that from Safari 16.
  - Code signing and notarization need Apple and Windows certificates. This is tracked in the companion spec.
- Electron is removed entirely. No Electron code was carried forward.
