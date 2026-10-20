# Swim format fixtures

Golden corpus for parser/integration testing. Families map to Hy-Tek export kinds.

## Meet Results (post-meet times)

| File | Purpose |
|------|---------|
| `ctcc-meet-results-2005.cl2` / `.zip` | Legacy Meet Manager CL2-only results (D0 times, no G0) |
| `azsi-results.cl2` / `azsi-results.hy3` | Modern Meet Manager results (D0 + G0) |

## Meet Entries / Roster (Team Manager packs)

| File | Purpose |
|------|---------|
| `ctcc-entries.cl2` / `.hy3` / `.zip` | Dual pack: CL2 + HY3 meet entries (E0/F0 relays) |
| `ctcc-roster.cl2` / `.hy3` / `.zip` | Swimmers Only + Rosters Only + nested entries ZIP |
| `mari-entries.cl2` / `mari-entries.hy3` | Modern Team Manager meet entries |
| `mari-sonoran-2026.cl2` / `.hy3` | 2026 Sonoran Desert Invitational entries (MARI, Team Manager Lite 8.0D). Names, coach, email, and street scrubbed; CL2/HY3 checksums recomputed |
| `mari-charger-2024.cl2` / `.hy3` | 2024 Charger entries pair, same team, scrubbed the same way so relay legs still match |
| `mari-az-roster.cl2` / `.hy3` | Swimmers Only / Rosters Only (20 athletes), scrubbed with the same name map |
| `roster-swimmers.cl2` / `roster-only.hy3` | Roster-only exports |

## Meet Events (pre-meet event lists)

| File | Purpose |
|------|---------|
| `sonoran-events.ev3` | Bare EV3 |
| `charger-events.ev3` / `.hyv` / `.zip` | EV3+HYV with dive events (stroke F) |
| `charger-2024-invitational.ev3` / `.hyv` | 2024 Charger Swim Dive Invitational (Meet Manager 8.0Gh). Street scrubbed. Trailing checksum is **not** recomputed (algorithm unknown) |
| `croswhite-2025-events.*` / `croswhite-2026-events.*` | Swim/Dive invite EV3+HYV |
| `croswhite-2026-invite-rev.ev3` / `.hyv` | Later Croswhite Invite revision (8.0Gh). EV3 street scrubbed; HYV has no street. Trailing checksum not recomputed |
| `desert-sunrise-events.*` | Swim-only EV3+HYV |
| `azsi-events.ev3` / `.hyv` | Championship events with QTs |

## Third-party

`third-party/hytek-parser/` — eight MIT SwimComm HY3 results files.
Parse tests only. Upstream redaction left the line checksums stale.

`third-party/tunas/` — three MIT tunas golden files (`reno_walk_on_meet`,
`aaa_league_championship`, `pasa_distance_intersquad`) with expected JSON.
Names, ids, birth dates, and contacts are scrubbed; checksums were
recomputed. Field-level oracles cover prelims, finals, relays, and D3.

## SDIF

| File | Purpose |
|------|---------|
| `AZAZSL_ext7716201449890453768.sd3` | TeamUnify SDIF meet entries |

### CL2 A0 file kinds

- `02Meet Results` — results (legacy D0 times or modern G0)
- `20Meet Entries` — entries + optional relays (E0/F0)
- `20Swimmers Only` — roster, not meet import
