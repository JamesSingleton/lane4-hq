# 0004. Offline meet store and results publishing

- **Status:** Accepted
- **Date:** 2026-09-29

## Context

[ADR 0002](0002-desktop-is-for-running-meets.md) left one question open: how a meet runs offline. The deck machine has to keep running a meet with no network, survive crashes and power loss mid-session, and get verified results to Lane4 when a connection shows up. Teams also need results files they can import into their own team manager (Hy-Tek Team Manager, TeamUnify, SwimTopia, Commit Swimming).

## Decision

1. **The deck machine is the source of truth for a meet.** A meet is one JSON document (`@lane4hq/meet-engine` `Meet`, `schemaVersion: 1`). Every change is a pure function (`seedEvent`, `verifyHeat`, `mergeTeamEntries`, …) that returns a new document. The UI holds the latest document and saves it after every change.
2. **Storage is plain files in the app data directory, owned by Rust** (`src-tauri/src/store.rs`):
   - `meets/<id>.json`, written atomically: temp file, fsync, rename. The previous version is kept as `<id>.json.bak`.
   - `meets/<id>.captures.jsonl`, an append-only journal with one line per race pulled from the timer, holding the raw DATA bytes. Timing survives even if the meet document is lost or corrupted.
   - Deleting a meet moves its files into `meets/trash/`. Nothing is erased.
   - Saves are serialized and coalesced in the webview (`createSaveQueue`), so the newest document always wins and writes never overlap.

   SQLite was the first plan ([companion spec](../specs/desktop-companion-v1.spec.md)). A meet is small: a large invitational is a few MB of JSON. Whole-document atomic writes are simpler than a schema and migrations, can be backed up and diffed, and move between machines as a `.lane4meet` file. Revisit this if meets outgrow it.
3. **Only verified heats count.** Races pulled from the console are *captures*. An official reviews each one against the heat sheet and *verifies* it. Only verified heats feed places, scores, exports, and publishing. Re-verifying a heat bumps its `revision`.
4. **Publishing is a queue that drains when online.** Every verified heat is queued. Every 15 s, on the browser `online` event, and right after a verification, the desktop app:
   1. probes the Lane4 API (`/health`);
   2. POSTs each due heat as a `lane4.heat-results/v1` publication to `/v1/teams/{team}/hosted-meets/{meetId}/heats` ([ADR 0005](0005-lane4-api-service.md)).

   The `Idempotency-Key` is `<meetId>:<event><P|F>:<heat>:r<revision>` (`P` and `F` mark prelims and finals), so a retried POST can't double-count, and a corrected heat publishes as a new revision. `2xx` and `409` (a newer revision is already stored) count as published. Other responses back off exponentially, from 5 s up to 5 min. A network failure stops the pass and leaves everything queued.
   - The API URL and hosting team live in app config. The URL must be `https://`, except `http://localhost` for development.
   - The operator signs in by device code. The session token lives in the OS keychain (macOS Keychain, Windows Credential Manager, via the `keyring` crate) and never goes back to the webview. Sign-in and POSTs are made from Rust (`reqwest` with rustls), so no CSP or CORS exception is needed.
   - The payload contract is `HeatPublication` in `packages/meet-engine/src/publish.ts`, mirrored by the API's zod schema.
5. **Team results files are generated per team.** Hy-Tek files carry one team, so each team gets its own results ZIP, and "all teams" is a ZIP of team folders. The pack currently contains **HY3 only**, because HY3 round-trips exactly through `@lane4hq/swim-formats` (times, places, DQ codes, relays). The CL2 and SD3 result writers don't yet re-import cleanly, so they stay out until they have golden round-trip coverage.

## Consequences

- The meet runs the same with or without WiFi. Publishing is best-effort and never blocks the deck.
- A crash loses at most the change being written. The capture journal means timing is never lost.
- Moving a meet to another machine is "Meet backup" then "Open a backup". There's no live multi-machine sync. Two deck machines editing the same meet isn't supported.
- The API stores one row per heat and keeps the highest revision ([ADR 0005](0005-lane4-api-service.md)).
