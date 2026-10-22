# HY3 entries and rosters

Confirmed against the scrubbed Maricopa fixtures
`mari-sonoran-2026.hy3`, `mari-charger-2024.hy3`, and `mari-az-roster.hy3`
(Team Manager Lite 8.0D, CRLF, 130-byte lines) and against the MIT
SwimComm parse corpus in `packages/swim-formats/fixtures/hytek-parser/`
(parse only; those checksums are stale).

Column numbers are 1-based. The age-up date and the checksum steps match
[tunas' HY3 notes](https://github.com/ajoe2/tunas/blob/main/docs/formats/hy3_format.md).
SwimComm's `hytek-parser` is the column parity reference for `D1`/`E1`.

## Line checksum

Columns 129–130. Verified on every original Maricopa line, then
recomputed after scrubbing. Sum CP-1252 **bytes** of columns 1–128:

- 1-based odd columns are added once.
- 1-based even columns are doubled.
- `value = floor((odd + 2 * even) / 21) + 205`.
- Write the units digit, then the tens digit, of `value % 100`.

A Unicode en dash (`U+2013`) is byte `0x96`, not `0x2013`.

## `B1` meet

| Cols | Field | Confirmed |
|---|---|---|
| 3–47 | Meet name | yes |
| 48–92 | Facility | yes |
| 93–100 | Start `MMDDYYYY` | yes |
| 101–108 | End `MMDDYYYY` | yes |
| 109–116 | Age-up date `MMDDYYYY` | yes. Sonoran is `07012026`, which is not the meet date `10242026`. Charger repeats the meet date. |
| 117–120 | Altitude feet | yes on Sonoran (`1100`); blank on Charger |

## `B2`

| Cols | Field | Confirmed |
|---|---|---|
| 99 | Course letter `Y`/`S`/`L` | yes (`Y` on both entry files) |
| 103–108 | Entry-time policy such as `0.00YO` | present, **meaning unconfirmed** beyond "not the pool course" |

## `C1` team

| Cols | Field | Confirmed |
|---|---|---|
| 3–7 | Team code `MARI` | yes |
| 8–37 | Full name | yes |
| 38–53 | Short name `MHS` | yes |
| 54–55 | LSC `AZ` | yes |
| 56–85 | Coach name | yes |
| 86–115 | Second contact | blank here. Parsed when it differs from column 56. |
| 121–122 | Team type `HS` | yes on these files |

## `C2` address and `C3` contact

| Cols | Record | Field | Confirmed |
|---|---|---|---|
| 3–32 | `C2` | Street | yes |
| 33–62 | `C2` | Address line 2 | blank |
| 63–92 | `C2` | City | yes |
| 93–94 | `C2` | State | yes |
| 95–104 | `C2` | Postal code | yes |
| 105–107 | `C2` | Country `USA` | yes |
| 109–111 | `C2` | `USS` | yes |
| 93–128 | `C3` | Email | yes |
| 33–52, 53–72, 73–92 | `C3` | Phones and fax | blank in these files. SwimComm results files do populate phones; treated as the same columns. |

## `C4`

**Unconfirmed.** None of the Maricopa files or the SwimComm corpus
contain a `C4`. tunas lists `C1`–`C3` and a rare `C8`, not `C4`.
Lane4 keeps columns 3–122 as a team note so the line is not dropped.

## `D1` athlete

| Cols | Field | Confirmed |
|---|---|---|
| 3 | `M`/`F` | yes |
| 4–8 | In-file swimmer id, right-justified | yes. Export must keep this id. Columns 7–8 are the last two digits of that field. |
| 9–28 | Last name | yes |
| 29–48 | First name | yes |
| 49–68 | Preferred name | blank here |
| 70–83 | USA id | blank here |
| 89–96 | Birth date | blank here |
| 97–99 | Age | `0` when birth date is blank |
| 100–101 | Class year `FR`/`SO`/`JR`/`SR` | yes |

`F3` relay legs repeat gender + the same 5-digit id + a 5-character last-name
stub, every 13 columns starting at column 3. The stub is the `D1` last name.

## `E1` / `F1`

| Cols | Field | Confirmed |
|---|---|---|
| 4–8 | Swimmer id (`E1`) | yes, same as `D1` |
| 9–13 | Last-name stub | yes |
| 51 | Seed course letter | yes (`Y`) |
| 52–59 | Seed, seconds | yes |
| 60 | Converted course letter | yes (`Y` on these files) |

Event number, distance, stroke, and age group follow the SwimComm offsets
already covered by `packages/swim-formats/__tests__/hy3/parity.test.ts`.
`E2`/`F2`/`G1` results and splits are **not** in the Maricopa entry files.
The SwimComm corpus parses them; their full layouts stay **unconfirmed**
until a round-trip fixture covers them.
