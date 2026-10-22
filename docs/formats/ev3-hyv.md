# EV3 and HYV event files

Confirmed against the scrubbed Meet Manager 8.0Gh pair
`charger-2024-invitational.ev3` / `.hyv` and
`croswhite-2026-invite-rev.ev3` / `.hyv`, plus the older event fixtures
already in `packages/swim-formats/fixtures/`. CRLF. Fields are
semicolon-separated. Indexes below are 0-based, matching `split(";")`.

## Trailing checksum

**Unknown.** CL2 and HY3 checksums do not reproduce the last token.

- EV3 header ends with a 5-character token and `*>` (for example `42162*>`).
  Event rows end with `4*>` on relays and `0*>` on individual events,
  including diving. That `4`/`0` tracks relay vs individual in every
  file checked; it was not shown to be a sum of the row.
- HYV headers end with a 5-character token and no `*>`. Event rows end
  with an empty field.
- Existing fixtures also use forms like `6244S*>` and `1234s*>`. No
  single weighted sum, divisor, or offset fit both the Maricopa headers
  and those tokens.

Street addresses in the new EV3 files were replaced in place. The
trailing token was left as exported by Meet Manager and is no longer a
checksum of the scrubbed header. HYV files in this pair have no street,
so they are unchanged.

## EV3 header (35 fields)

Confirmed from these files:

| Index | Meaning |
|---|---|
| 0 | Meet name |
| 1 | Facility |
| 2 | Start `M/D/YYYY` |
| 3 | End |
| 4 | A third date (age-up or entry deadline — **unconfirmed** which) |
| 5 | Course policy: `Y`, `YO`, or `YLS`. The leading letter is the pool course (`Y` → SCY). `YLS` is not long course. |
| 11 | Meet Manager version (`8.0Gh`) |
| 18 | Max combined entries |
| 19 | Max individual entries |
| 20 | Max relay entries |
| 23 | Entry deadline `M/D/YYYY` |
| 24 | Street |
| 26 | City |
| 27 | State |
| 28 | Postal code |
| 29 | Country |

Other header indexes are present and stable in these two meets
(software banner, `N` flags, `01/01/1970`) but their names are
**unconfirmed**.

## EV3 event row (30 fields)

| Index | Meaning |
|---|---|
| 0 | Event number |
| 2 | `F` (finals in these invites) |
| 4 | `I` individual or `R` relay |
| 5 | `B` boys / `G` girls |
| 6–7 | Age low / high (`0` / `109` = open) |
| 8 | Distance (`0` on diving) |
| 9 | Stroke `A`–`E`, or `F` diving |
| 10 | Dive count (`11` on the dive events, else `0`) |
| 25 | Course letter `Y` |

Session, heat, and round indexes beyond this list are **unconfirmed**.

## HYV

Header: name, three dates, course letter, facility, then a software
string, `8.0Gh`, `CN`, and the unknown trailing token.

Event row:

| Index | Meaning |
|---|---|
| 0 | Event number |
| 1 | `F` |
| 2 | `M` / `F` |
| 3 | `I` / `R` |
| 4–5 | Ages (open is `0` / `0` here, unlike EV3's `109`) |
| 6 | Distance, or `1` on diving |
| 7 | Stroke `1`–`5`, or `6` diving |

Qualifying times, when present, are later fields. These two invites
leave them blank except two Charger distance events, which is
**unconfirmed** as a general rule.
