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
Every line is 128 data bytes plus that checksum (130 characters). The file ends with CRLF.

## `A1` file header

Confirmed by a tester against a working Team Manager export. The
description starts at column 5. Starting it at column 3 puts `Me` in the
file-type field and shifts the publisher, version, and date two columns
left.

| Cols | Field | Confirmed |
|---|---|---|
| 3–4 | File type. Meet entries are `02`. Rosters use `03` and results use `07` in the same columns. | `02` confirmed by the tester |
| 5–29 | Description, space-padded to 25. Entries: `Meet Entries`. | yes |
| 30–44 | Software publisher, 15 characters. Team Manager files say `Hy-Tek, Ltd`. Meet Manager rejects other publisher strings. A file Lane4 creates says `Lane4 HQ, Ltd`. Re-export writes the publisher from the file. | yes |
| 45–58 | Software name and version, 14 characters. Entry files use `Win-TM 8.0Gf` or `Win-TM 8.0De`. A file Lane4 creates says `Lane4 1.0`. Re-export writes the token from the file. | yes |
| 59–66 | Creation date `MMDDYYYY`. Team Manager writes the day the file was made, which can differ from the meet date on `B1`. Lane4 writes the export date, including on re-export. | yes |
| 67–75 | Creation time, 9 characters, such as `  4:27 PM`. Team Manager writes the file clock. Lane4 writes the export clock, including on re-export. | yes |
| 76–128 | Licensee, 53 characters. Team Manager writes the school or club name. Lane4 keeps that text on re-export and writes the organization name on a new file. | yes |

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
| 103–108 | Entry-time setup. Entry files use `0.00YO` (Klein, Sonoran) or `0.00YL` (Charger). Lane4 writes the file's value back, and `0.00YO` on a new entry file. | present. The last letter is **unconfirmed**. |

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
| 109–111 | `C2` | Organization code. `USS` on the Maricopa files, `OTH` on another Team Manager entry file. Lane4 keeps the code and writes `USS` for a new USA team. | yes |
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
| 49–68 | Preferred name | blank on Maricopa. Written when the file has one. The swimmer's display name uses it. |
| 69 | Middle initial | blank on Maricopa. A single letter on some entry files. |
| 70–83 | USA id | blank here |
| 89–96 | Birth date | blank here |
| 97–99 | Age | `0` when birth date is blank |
| 100–101 | Class year | `FR`/`SO`/`JR`/`SR` on Maricopa. Numeric grades `09`–`12` on a Texas entry file. |
| 106–107 | Group text | present on that Texas file (`JV`). Meaning **unconfirmed**. |
| 109–111 | Subgroup text | present for some athletes on that file. Meaning **unconfirmed**. |

`C6` is an extra contact line. Lane4 keeps the 128-character body and
recomputes the checksum. The column map inside `C6` is **unconfirmed**.

`F3` relay legs repeat gender + the same 5-digit id + a 5-character last-name
stub, every 13 columns starting at column 3. The stub is the first five
characters of the `D1` last name, including a space (`De La`).

## `E1` / `F1`

| Cols | Field | Confirmed |
|---|---|---|
| 4–8 | Swimmer id (`E1`) | yes, same as `D1` |
| 9–13 | Last-name stub (`E1` only) | yes |
| 12 | `0` on Team Manager entry `F1` lines | yes on entry files. Not written on results files. |
| 13–15 | Relay gender (`F1` only) | yes. `FFF` or `MMM`. Confirmed by a tester against Team Manager. A blank column 13 (`FF` / `MM`) does not import. |
| 35–38 | `0.00` on Team Manager entry `E1` and `F1` lines | yes on entry files |
| 39–41 | Event number, right-justified in 3 columns, on Team Manager entry lines. Column 42 stays blank. Results files keep a 4-column event number. | yes |
| 50 | `0` on Team Manager entry `E1` and `F1` lines, immediately before the course letter | yes on entry files |
| 51 | Seed course letter | yes (`Y`) |
| 92 | One character on some entry `E1` lines (`C` on Sonoran, blank on another entry file). Lane4 writes it only when the source line had it. | present, meaning **unconfirmed** |
| 52–59 | Seed, seconds | yes |
| 60 | Converted course letter | yes (`Y` on these files) |

Event number, distance, stroke, and age group follow the SwimComm offsets
already covered by `packages/swim-formats/__tests__/hy3/parity.test.ts`.
`E2`/`F2`/`G1` results and splits are **not** in the Maricopa entry files.
The SwimComm corpus parses them; their full layouts stay **unconfirmed**
until a round-trip fixture covers them.
