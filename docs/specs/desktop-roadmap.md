# Lane4 Desktop roadmap

`apps/desktop` (`@lane4hq/desktop`) is a local-first Tauri app for macOS and Windows ([ADR 0001](../adr/0001-tauri-for-desktop.md)). It is Lane4's **meet manager**. Team management stays on the web in `apps/admin`, and the desktop app does not copy admin screens ([ADR 0002](../adr/0002-desktop-is-for-running-meets.md)).

## Milestone 1: Meet file inspector (shipped in the scaffold)

**Goal:** open any Hy-Tek / SDIF file and see exactly what Lane4 parses, fully offline. It is also the first practical way to validate admin's imports and exports against real Team Manager / Meet Manager files.

- Opening files:
  - native Open dialog and window drag-and-drop;
  - one ZIP pack, or companion files together (EV3 + CL2, HY3 + CL2);
  - Team Manager roster exports fall back to a roster view.
- Views:
  - meet summary (events, entries, results, relays, athletes, teams);
  - filterable tables for each.
- Parsing reuses `@lane4hq/swim-formats` unchanged (`parseMeetFilesFromBytes`, `parseRosterFileFromBytes`).

**Next steps inside this milestone**

- [ ] [#66](https://github.com/JamesSingleton/lane4-hq/issues/66): "Compare" mode. Open an original TM/MM file next to Lane4's own export of the same meet (from admin), and diff events, entries, and times. This checks export → re-import round-trips without a coach in the loop (related: [#56](https://github.com/JamesSingleton/lane4-hq/issues/56)).
- [ ] [#67](https://github.com/JamesSingleton/lane4-hq/issues/67): export from desktop (HY3, CL2, SD3, ZIP) using `@lane4hq/swim-formats/export`, so round-trips can be checked locally.
- [ ] [#75](https://github.com/JamesSingleton/lane4-hq/issues/75): signed installers and auto-update (see the companion spec, "Distribution").

## Milestone 2: Run a meet (desktop side built)

**Goal:** a meet director runs a meet from the desktop app, with or without internet at the pool: seeding, heat sheets, live results from the timing console, and results export. It works like Hy-Tek Meet Manager with Meet Mobile:

- the deck machine holds the meet and never needs a network to run it;
- results publish when a connection is available, either automatically after each heat or pushed manually once official.

Built:

- [x] Meet database for events, teams, athletes, entries, heats, captures, and results. It is a JSON document per meet, saved atomically in the app data directory, with an append-only raw timing journal ([ADR 0004](../adr/0004-offline-meet-store-and-publishing.md)).
- [x] Meet setup from the host's EV3/HYV/ZIP, or a blank meet. Events can be added and removed.
- [x] Host-side entry merge: import each team's HY3/CL2/SD3/ZIP entry pack. Team detection, relay legs, and event checks run on import, and re-importing replaces a team's unswum entries.
- [x] Seeding: timed finals (fastest heat last, at least 3 swimmers in heat 1), circle seeding for prelims, center-out lanes for 6, 8, or 10 lanes. Swimmers can be scratched and moved.
- [x] Colorado Time Systems integration (System 6, System 5, 4000A, Gen7) over RS232/USB-serial, plus a simulated console. See the [companion spec](desktop-companion-v1.spec.md) and [ADR 0003](../adr/0003-cts-timing-interface-split.md).
- [x] Race review: auto-assignment to heats (titled races, or following on from the previous one), plus review flags:
  - pad/backup mismatch, and no pad time (backup used);
  - console DQ, and early relay takeoff;
  - no time, and time in an empty lane.

  Officials can edit status, time, and DQ code, then verify. Heats can also be entered by hand.
- [x] Results: places to the hundredth with ties, exhibition, and DQ/NS/DNF. Team scores use dual, invitational, or championship presets.
- [x] Export: a per-team HY3 results ZIP, all teams in one ZIP, a results CSV, and a `.lane4meet` backup.
- [x] Publishing queue: verified heats POST to the Lane4 API when online, with idempotency keys and backoff. The operator signs in by device code, approves it at `/device` in admin, and picks the hosting team. The token is kept in the OS keychain.
- [x] Lane4 API (`apps/api`, [ADR 0005](../adr/0005-lane4-api-service.md)): receives `lane4.heat-results/v1` publications, serves public live results, and lists a team's meets with their numbered programs.
- [x] Printed heat sheets and results (`@lane4hq/reports/meet-program`). The PDF renders in the webview and opens in the system viewer.
- [x] Prelims/finals: A/B/C finals from prelim results, with the A final swum last, center-out lanes, and block places (every A finalist places ahead of every B finalist). Prelims score no points when finals follow.
- [x] Diving: 1, 3, 5, or 7 judges (high/low awards dropped), score = award sum × DD, failed dives and balks, and a scoresheet on the Run meet screen. Results are placed by total points.

Still to do:

- [ ] "Download a meet onto the deck machine" in the desktop app: the API serves `GET /v1/teams/{teamId}/meets/{meetId}/program`, but the desktop can't import it yet.
- [ ] CL2 and SD3 result writers in `swim-formats` that round-trip, so team packs can include them again.
- [ ] Split records (HY3 G1) in the HY3 export.
- [ ] Diving in the HY3/CL2 export (dive results are shown, printed, and scored, but team packs carry swims only).
- [ ] Hardware validation on a real console ([#74](https://github.com/JamesSingleton/lane4-hq/issues/74)).

## Milestone 3: Follow a meet (web first)

**Goal:** parents and visiting clubs follow a meet live without installing anything.

- A public live-results page shows psych sheets, heat sheets, and results as the deck machine publishes them.
- A native Meet Mobile–style app comes later, if push notifications ("your swimmer's heat is next") justify it.

## Not on the desktop

- Team management (roster, entries, results, workouts, calendar) lives in `apps/admin`. It should work well on phones and tablets and be installable as a PWA. It is not rebuilt in desktop or as a native mobile app until real demand shows up.

## Non-goals (for now)

- Linux builds. Tauri supports them; there's just no user need yet.
- Family or parent portal, dues, messaging.
