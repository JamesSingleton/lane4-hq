# CL2 / SDIF meet entries

Confirmed against the scrubbed Maricopa fixtures in
`packages/swim-formats/fixtures/mari-sonoran-2026.cl2`,
`mari-charger-2024.cl2`, and `mari-az-roster.cl2`
(Team Manager Lite 8.0D, CRLF, 160-byte lines).
Column numbers are 1-based.

The SDIF v3 narrative used below is the one published by
[tunas](https://github.com/ajoe2/tunas/blob/main/docs/formats/cl2_format.md).
Fields marked **unconfirmed** are in that write-up but not exercised by
these fixtures.

## Line checksum

Columns 157–160 are ` N` plus two digits (159–160).

Verified on every line of the original Maricopa files before scrubbing,
and recomputed after scrubbing:

1. Sum the CP-1252 bytes of columns 1–156 (not Unicode code points; bytes
   `0x80`–`0x9F` differ from the characters Windows-1252 displays).
2. `value = floor(sum / 19) + 211`.
3. Emit the units digit, then the tens digit, of `value % 100`.

## Course

| Cols | Record | Confirmed |
|---|---|---|
| 150 | `B1` | Meet course letter: `Y` SCY, `S` SCM, `L` LCM. This is the meet course. Columns 88–100 are facility text (`Copper Sky`) and are not a course code. |
| 97, 106, 115, 124 | `D0` | Course of seed, prelim, swim-off, finals. Sonoran/Charger seeds use column 97 = `Y`. |
| 54, 63, 72, 81 | `E0` | Same four courses for a relay. Seeds use column 54 = `Y`. |

## Records these files actually contain

`A0`, `B1` (entries only), `C1`, `D0`, `D3`, `E0`, `F0`, `Z0`.
The roster file has no `B1`, `E0`, or `F0`. It is a Swimmers Only export.

### `C1` team

| Cols | Field | Confirmed on MARI |
|---|---|---|
| 3 | Org code `1` | yes |
| 4–5 | LSC `AZ` | yes |
| 12–17 | Team id `AZ` + `MARI` | yes. The team abbreviation is `MARI`; the six-character id repeats the LSC. |
| 18–47 | Full team name | yes |
| 48–63 | Short name `MHS` | yes |
| 108–127 | City | yes (`Maricopa`) |
| 128–129 | State | yes (`AZ`) |
| 130–139 | Postal code | yes |
| 140–142 | Country | yes (`USA`) |
| 64–107 address, 143 region, 150 extra team-code character | | **unconfirmed** (blank in these files) |

### `D0` individual entry

| Cols | Field | Confirmed |
|---|---|---|
| 4–5 | LSC | yes (`AZ`) |
| 8–9 | Class year `FR`/`SO`/`JR`/`SR` | yes |
| 12–51 | `Last, First` | yes |
| 66–67 | `FF` / `MM` | yes |
| 69–72 | Stroke code (`1001` = 100 free, …) | yes |
| 73–76 | Meet event number | yes |
| 77–80 | `UNOV` | yes |
| 90–96 | Seed time | yes |
| 97 | Seed course letter | yes |
| 98–105 | Prelim time | yes, on the scrubbed tunas AAA and Reno results (`third-party/tunas`) |
| 106 | Prelim course | yes, same files |
| 107–114 | Swim-off time | column confirmed; these files leave it blank |
| 115 | Swim-off course | column confirmed; blank in these files |
| 116–123 | Finals time | yes, same files |
| 124 | Finals course | yes, same files |

When the file also has `G0` split lines, the official round time is the `D0` column above. `G0` repeats that time as the last split and carries the round code in column 144 (`P` / `F` / `S`).

USS#, birth date, and age on `D0` are **unconfirmed** here (blank).

### `D3` individual info

One `D3` follows a swimmer's first `D0`. Layout per tunas, checked
against these files:

| Cols | Field | In these files |
|---|---|---|
| 3–16 | 14-character USS# / SWIMS id | blank. When present, it fills a blank `D0` id. |
| 17–31 | Preferred first name | blank |
| 32–33 | Ethnicity | `X` then space |
| 34–46 | Yes/no registration flags | `FFFFFFFFFFFFF` |

Per-flag meanings (junior high, high school, …) are the tunas table.
These files only show `F`. Anything past column 46 is **unconfirmed**.

### `E0` / `F0` relays

| Cols | Record | Field | Confirmed |
|---|---|---|---|
| 4–5 | both | LSC | yes |
| 12 | `E0` | Relay letter | yes |
| 13–18 | `E0` | Team id `AZMARI` | yes |
| 21 | `E0` | Sex `M`/`F` | yes |
| 23–26 | `E0` | Distance + stroke digit | yes |
| 27–30 | `E0` | Event number | yes |
| 47–53 | `E0` | Seed time | yes |
| 54 | `E0` | Seed course | yes |
| 16–21 | `F0` | Team id | yes, glued to the relay letter in column 22 and `Last, First` at column 23 |

`E0` columns 63 and 72 (prelim and swim-off courses) are blank on the
Maricopa entry files and on the tunas AAA relays. AAA finals time is
columns 73–80 with course `Y` in column 81.

## EV3 / HYV checksum

Not a CL2 checksum. See [ev3-hyv.md](./ev3-hyv.md). The trailing token on
those files was **not** recomputed after the street was scrubbed.
