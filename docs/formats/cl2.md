# CL2 / SDIF meet entries

Confirmed against the scrubbed Maricopa fixtures in
`packages/swim-formats/fixtures/mari-sonoran-2026.cl2`,
`mari-charger-2024.cl2`, and `mari-az-roster.cl2`
(Team Manager Lite 8.0D, CRLF, 160-byte lines, file ends with CRLF).
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
| 150 | `B1` | Meet course letter: `Y` SCY, `S` SCM, `L` LCM. This is the meet course. The facility name starts at column 86 and is not a course code. |
| 97, 106, 115, 124 | `D0` | Course of seed, prelim, swim-off, finals. Sonoran/Charger seeds use column 97 = `Y`. |
| 54, 63, 72, 81 | `E0` | Same four courses for a relay. Seeds use column 54 = `Y`. |

## `A0` file header

Entry and roster files share one banner. Results files use the same phone,
date, and second publisher columns, with a longer software token.

| Cols | Entries / rosters | Results |
|---|---|---|
| 3 | `1` | `1` |
| 4–5 | `V3` | `V3` |
| 12–13 | File code `20` | File code `02` |
| 14–43 | `Meet Entries` or `Swimmers Only` | `Meet Results` |
| 44–69 | Publisher, 26 characters. Team Manager writes `Hy-Tek, Ltd`. Lane4 writes `Lane4 HQ, Ltd` on a new file. | columns 44–63, padded to 20 |
| 70–73 | Software, 4 characters. Team Manager writes `8.0G` or `8.0D`. Lane4 writes `L4` on a new file. | columns 64–73. Team Manager writes `WMM 8.0Fd `. Lane4 writes `Lane4 1.0`. |
| 74–93 | Second publisher, 20 characters. Same values as the first. | same |
| 94–105 | Vendor phone. Team Manager entry files use `252-633-5177`. Lane4 leaves this blank on a new file. | preserved from the file |
| 106–113 | File date `MMDDYYYY` | same |
| 150–153 | `TM41` entries, `TM43` rosters | `MM40` |

Lane4 writes this banner. The label in columns 12–43 is what file-kind
detection reads. A new file uses Lane4's publisher and software, a blank
phone, and tail `TM41` (entries), `TM43` (rosters), or `MM40` (results).
Re-export keeps the file's publisher, software, phone, date, and tail.

## Records these files actually contain

`A0`, `B1` (entries only), `C1`, `D0`, `D3`, `E0`, `F0`, `Z0`.
The roster file has no `B1`, `E0`, or `F0`. It is a Swimmers Only export.

### `B1` meet

| Cols | Field | Confirmed |
|---|---|---|
| 3 | `1` | yes |
| 12–85 | Meet name | yes |
| 86–121 | Facility | yes (`Copper Sky` starts at column 86) |
| 122–129 | Start `MMDDYYYY` | yes |
| 130–137 | End `MMDDYYYY` | yes |
| 138–141 | Altitude, 4 digits | yes on Sonoran (`1100`); blank when the file has none |
| 150 | Course letter | yes |

### `C1` team

| Cols | Field | Confirmed on MARI |
|---|---|---|
| 3 | Org code `1` | yes |
| 4–5 | LSC `AZ` | yes |
| 12–17 | Team id, 6 characters, right-justified. `AZMARI` fills the field. A 4-character code uses columns 14–17. | yes |
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
| 8–9 | Class year `FR`/`SO`/`JR`/`SR`, or a numeric grade `09`–`12` | yes |
| 12–51 | `Last, First`, including a middle initial when the file has one (`Last, First Q`). Lane4 writes this field back as stored. | yes |
| 66–67 | `FF` / `MM` | yes |
| 69–72 | Stroke code (`1001` = 100 free, …) | yes |
| 73–76 | Meet event number | yes |
| 77–80 | `UNOV` | yes |
| 90–96 | Seed time | yes |
| 97 | Seed course letter | yes |
| 98–105 | Prelim time | yes, on `azsi-results.cl2` |
| 106 | Prelim course | yes, same file |
| 107–114 | Swim-off time | same width as prelim and finals; blank in `azsi-results.cl2`, CTCC, and the Maricopa entry files |
| 115 | Swim-off course | blank in those files |
| 116–123 | Finals time | yes, on `azsi-results.cl2`. `ctcc-meet-results-2005.cl2` stores its only time here and has no `G0` |
| 124 | Finals course | yes, `Y` on those results files |

When the file also has `G0` split lines, the official round time is the `D0` column above. `G0` repeats that time as the last split and carries the round code in column 144 (`P` / `F` / `S`).

USS# is blank on these entry files. A Team Manager entry file stores the birth date in columns 56–63 (`MMDDYYYY`), the age in columns 64–65, and `FF`/`MM` in columns 66–67. Maricopa leaves columns 56–65 blank. Lane4 writes the date and age only when a birth date is present.

`F0` stores the birth date in columns 66–73, the age in 74–75, sex in column 76, and `000` in 77–79. Lane4 writes columns 66–79 back as stored when the file had them. A new leg writes the date and age only when a birth date is known. Some relay legs in a Team Manager file carry a birth date that does not match the athlete's `D0` line, so recomputing those columns changes the file.

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
| 13–18 | `E0` | Team id, 6 characters, right-justified | yes |
| 21 | `E0` | Sex `M`/`F` | yes |
| 23–26 | `E0` | Distance + stroke digit | yes |
| 27–30 | `E0` | Event number | yes |
| 47–53 | `E0` | Seed time | yes |
| 54 | `E0` | Seed course | yes |
| 16–21 | `F0` | Team id, 6 characters, right-justified | yes |
| 23–62 | `F0` | `Last, First`, including a middle initial. Lane4 writes this field back as stored. | yes |
| 66–79 | `F0` | Birth date, age, sex, and `000`. Lane4 writes this field back as stored. | yes |
| 93–112 | `F0` | Registration text on some entry files. Meaning **unconfirmed**. Lane4 writes it back when the file had it. | present |

`E0` columns 63 and 72 (prelim and swim-off courses) are blank on the
Maricopa entry files and on `azsi-results.cl2`. AZSI finals time is
columns 73–80 with course `Y` in column 81. Maricopa entry relays have
a seed in columns 47–53 and nothing in the later round columns.

## EV3 / HYV checksum

Not a CL2 checksum. See [ev3-hyv.md](./ev3-hyv.md). The trailing token on
those files was **not** recomputed after the street was scrubbed.
