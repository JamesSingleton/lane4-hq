# CTS F397 verification

Line-by-line check of the CTS code against *System 6, System 5 & 4000A Swimming Meet Management Interface With Gen7 Notes* (F397 Rev. F, 19 pages). The summary in the [companion spec](desktop-companion-v1.spec.md) was not used as the source.

**No part of this has run against a real console.** "Matches" means the code agrees with the document and tests prove the code, not that a timer agrees.

## Matches the document

| Area | Page | Result | Proof |
|---|---|---|---|
| Serial settings: 9600, odd, 8, 1, no handshake | 15 | Matches | `timing_open` |
| `NUM \| DATA \| DIC`, NUM counts the whole packet | 13 | Matches | Vendor vectors in TS and Rust |
| DIC: 0xFFFF minus each byte | 14 | Matches | Vendor vectors |
| Little-endian words and four-byte times | 14 | Matches | `race.test.ts` |
| Packets under 5 bytes are line errors | 14 | Matches | Rust and TS frame tests |
| 2 DATA bytes is an error code, except the `Rg` booleans (0, 1, 256, 257, which errors never use) | 12, 14 | Matches | `f397.test.ts` |
| Resend after 500 ms; 50 ms quiet after a bad packet | 14 | Matches | `frame.rs` |
| Header layout, 47 bytes when `MAX_NUM_LANES` is 10 | 6 | Matches; `date_long_year` and `ireserved1` are alternatives | Checked against the page image |
| Lane order: place, splits, buttons, backup, relay judging | 7 | Matches | `race.test.ts` |
| Place is signed; -1 is DQ, 0 is no finish | 7 | Matches | `race.test.ts` |
| All 57 error `#define`s | 12–13 | Matches | Compared by script |
| `S` option order and all selectors, including `E#$@@` | 4 | Matches | `commands.test.ts` |
| Gen7: `SC` unsupported; reads limited to `g i r s` | 4–5 | App never sends `SC`, and `Ri` is its only setups read | Code search |
| `I` writes | 3 | Not sent; v1 is read-only | Code search |

One deliberate departure: F397 says the rest of a packet must arrive within 500 ms of its first byte. The transport applies 500 ms between bytes, because a 10-lane 1650 is about 2.9 KB, which takes over 3 s at 9600 baud with 11 bits per byte.

## Fixed

| # | Problem | Page | Fix |
|---|---|---|---|
| 1 | `num_times_for_each_lane` is only said to include backups. If it leaves out individual buttons, every race with 2+ buttons and relay judging requested decoded with wrong splits and **wrong finals**, with no warning | 6–7 | Both readings are tried and ranked against `race_lengths`, relay exchange count, and rising splits. A tie sets `layoutWarning` |
| 2 | Polling asked for `cursor + 1` forever. F397 never says numbering starts at 1 or has no gaps, and old races are discarded, so polling could stall with no error | 2 | On a miss, walk the race pointer to the lowest number above the cursor |
| 3 | Setups reads sent 2 bytes. Every read example sends a zeroed structure (`52 72 00`, and full structures for `Rt`, `Ru`) | 16–18 | Reads now send the structure size. The size for `Rg` and `Ri` follows that pattern; neither has its own example |
| 4 | An error reply to `T` failed the connection. Only meets with races are returned, so a freshly powered timer may do this | 2 | Treated as no meet date |
| 5 | Resume matched by calendar day, but every power-on is a new meet | 2 | Compares against the meet's start time |
| 6 | A power cycle during a session left polling on a stale cursor | 2 | When `cursor + 1` misses, re-read the race the cursor is on; if it has gone or changed, restart on the new meet. Captures dedupe by race number and date |
| 7 | "Only new races" assumed the pointer rests on the newest race | 2, 4 | Walks forward until the documented past-the-end error |
| 8 | `M±`, `SL`, `SN` were resent after a lost reply, which would move a pointer twice | 3–4 | `isSafeToResend` turns resending off for them |
| 9 | Input wasn't cleared before a first send, so a late reply could pass as the next one's | 14 | Cleared before every send |
| 10 | Reserved bytes on pre-3.1 firmware could be read as `event_16_bit` | 6 | A non-zero `event` wins |
| 11 | `MAX_NUM_LANES` was fixed at 10 | 4, 6 | Learned from the length of the `T` reply, which is a bare header |
| 12 | Nothing said which cable to use. The timer is a DCE, so a null-modem cable swaps TX and RX | 15 | Connect screen and timeout message say straight-through |

## macOS and Windows

`serialport` 4.10.1 source was read for both platforms:

| Behaviour | macOS | Windows |
|---|---|---|
| Port names | `/dev/cu.*`; `tty.*` hidden | `COMn` |
| Read returns as soon as bytes arrive | Yes | Yes |
| Timeout surfaces as `TimedOut` | Yes | Yes |
| Unplugged adapter | `BrokenPipe`, connection dropped | Expected to return an OS error (not traced or run) |
| Bad parity byte | Read as NUL, then fails DIC | Passed through, then fails DIC |
| No handshake lines needed | `CLOCAL` set | CTS and DSR flow off |

No entitlement is needed for serial access, because the app isn't sandboxed. `desktop.yml` runs `cargo test` on `macos-latest` and `windows-latest`. `talks_through_the_real_serial_driver` runs the real driver on a pseudo-terminal on Unix only, so Windows has no real-port test. A pseudo-terminal also ignores baud and parity.

## Only hardware can answer

Each of these needs one session with a console, ideally System 5 or 6 and Gen7.

**Test this timer**, on the Run meet screen, runs what it can in about a minute and saves a JSON report with every byte exchanged (`diagnoseTimer` in `@lane4hq/timing-cts/diagnostics`). It answers items 1–10, 12, and 14 for what's stored on that console, as long as the console has races to read, including one with two or more buttons and a relay. Items 11 and 13 and a final comparison need a person. The report holds times and race numbers, not swimmer names, because the console has none.

The test sends no setups writes. It moves the race pointer, which polling doesn't rely on, and the meet pointer, which it puts back and checks. It fails loudly if it can't.

1. **Connect.** Run a Mac and a Windows PC through a USB-serial adapter. Does `W` answer? What is the exact string?
2. **Fresh power-on.** Connect before any race. Does `T` return a date or an error?
3. **`T` length.** Is it 47 bytes? Any other length means `MAX_NUM_LANES` isn't 10.
4. **`T` time.** Is it the meet's start time, or the current clock? If it's the clock, resume falls back to pulling the meet again, which is safe but slower.
5. **Setups reads.** Do padded `Ri` and `Rg` answer on each console? If `Ri` fails, the lane-count warning disappears but nothing else breaks.
6. **Buttons and `num_times`.** Run a race with 3 buttons. Does the count include them? Compare finals with the console.
7. **Splits.** Does the split count equal `race_lengths`, with near-only and far-end splits?
8. **Relay judging.** How many values are sent for a 4-leg relay, and for an individual race?
9. **Numbering.** Does each meet restart at 1? What happens after a re-run or a deleted race?
10. **Race pointer.** Where does it rest after power-on and after a new race? Does `L` at the oldest race error or wrap?
11. **Power cycle.** Run races, turn the timer off and on, run more. Does Lane4 follow without losing any?
12. **Long race.** Pull a 10-lane 1650 with everything included. Does it arrive complete and pass DIC?
13. **Reverse lanes.** With `reverseLanes` on, is lane 1 in the data the physical lane 1?
14. **Gen7.** Do `S…R##`, `SL`, `SN`, `T`, `I`, and `J` all work? F397 only lists `SC` and the setups limits.
