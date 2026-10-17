# 0003. CTS timing interface: Rust transport, TypeScript codec

- **Status:** Accepted (built 2026-09-29; see "Implementation notes")
- **Date:** 2026-09-28

## Context

Colorado Time Systems consoles (System 6, System 5, 4000A, and Gen7) expose stored race results as a queryable database over RS232. The protocol is summarized in the [companion spec](../specs/desktop-companion-v1.spec.md#cts-meet-management-interface), from CTS document F397 Rev. F. It has two layers with very different needs:

- **Transport:** 9600 baud, odd parity, 8N1, framed packets with a 2-byte checksum. There are hard timing windows:
  - at most 50 ms between bytes;
  - a response starts within 500 ms, otherwise resend;
  - once the first byte arrives, the rest of the packet follows within 500 ms.

  JavaScript timers in a webview can't guarantee these windows, and the webview can't open serial ports.
- **Payload:** a race header struct, then per-lane places, splits, button times, backups, and relay judging. This is pure data decoding, the same kind of work `@lane4hq/swim-formats` already does with golden tests.

## Decision

- **Rust (`apps/desktop/src-tauri`) owns transport:**
  - port discovery (`COMx` on Windows, `/dev/cu.*` on macOS);
  - opening the port at 9600/odd/8/1;
  - framing (`NUM | DATA | DIC`);
  - DIC verification;
  - inter-byte and response timeouts, with retry.

  It exposes Tauri commands that take a command payload and return verified `DATA` bytes, or a typed transport error. It uses the `serialport` crate, with Rust unit tests for framing and DIC.
- **A TypeScript package, `@lane4hq/timing-cts`, owns the codec:**
  - building command payloads (`W`, `T`, `M+`/`M-`, `S` with sub-commands);
  - decoding the race header and lane records;
  - mapping the 6-byte error codes;
  - converting to a neutral `TimerRace` model.

  It has no DOM or Tauri dependency. It needs 100% Vitest coverage, with golden vectors taken from the vendor document's hex examples (for example `05 00 57 A3 FF` for `W` and the ACK `06 00 06 00 F3 FF`).
- **A timer simulator** implements the same command/response behaviour in TypeScript. That lets development, UI work, and CI run with no hardware. Rust transport tests use a loopback or mock port.
- **v1 is read-only.** It only issues `W`, `T`, `M±`, and `S…`. Setups writes (`I…`) are deferred, because rewriting event-sequence labels corrupts the titles of races already stored on the timer.

## Consequences

- Timing-sensitive code stays small, in Rust, and testable without a webview. Decoding follows the repo's golden-test discipline.
- Framing logic lives in two places: Rust for the wire, TS for the simulator and tests. Shared test vectors keep them in sync.
- Field widths the vendor doc leaves implicit must be confirmed on real hardware before the codec is marked stable. Examples: `int` in `TYPE_MEETMGMT_HEADER` (assumed 2-byte little-endian) and `MAX_NUM_LANES`.

## Implementation notes

What shipped, and where it departs from the decision above:

- **Codec:** `packages/timing-cts` (`@lane4hq/timing-cts`):
  - `frame`, `commands`, `race`, `errors`, and `setups` hold the codec. `client` provides `CtsTimer` over a `TimerTransport`. `simulator` provides `TimerSimulator`.
  - Tests use the vendor golden vectors. Coverage is 100% of lines, functions, and statements.
  - Header widths are parameters (`DecodeOptions.maxNumLanes`, default 10; `int` is 2-byte little-endian). The per-lane layout comes from `num_times_for_each_lane`. If that doesn't explain the byte count, the decoder infers the layout and sets `layoutWarning`, which the review screen shows. It never guesses silently.
- **Rust transport:** `apps/desktop/src-tauri/src/timing/`:
  - Commands: `timing_list_ports`, `timing_open`, `timing_close`, `timing_connected_port`, `timing_request`. Tests run over a scripted mock link.
  - macOS lists only `/dev/cu.*`.
- **Timer errors are decoded in TypeScript, not Rust.** A 2-byte DATA reply is an error code except in reply to `Rg`, and only the codec knows which command was sent. Rust returns verified DATA, and `CtsTimer` maps error codes to `TimerResponseError`. `TransportError` is `notConnected | timeout | badChecksum | shortPacket | badCommand | io`.
- **Timeouts:**
  - The first byte must arrive within 500 ms. After that, each byte must follow within 500 ms.
  - The vendor text says the *rest of the packet* must arrive within 500 ms, but a 10-lane 1650 response is several KB. At 9600 baud that takes seconds to send, so the window is applied between bytes.
  - Up to 3 retries, with a 50 ms quiet gap and an input flush before each.
- **Polling:** the app asks for race `cursor + 1` by number (`S B I J S R##`, supported on every console including Gen7) every 2 s. On connect, the cursor resumes after the last race captured from the timer's current meet. "Only new races" jumps it to the race at the timer's pointer.
- **Setups:** read-only. `Ri` (pool setup) is read to warn about lane-count mismatches. `I…` writes are still not implemented.
- **Still to confirm on hardware:** the `int` width, `MAX_NUM_LANES`, and the split count versus `race_lengths` ([#74](https://github.com/JamesSingleton/lane4-hq/issues/74)).
