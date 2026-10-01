/** Error codes the timer returns as a 6-byte packet (two DATA bytes). */

export const ACK = 0x0006;

export const TIMER_ERRORS: Readonly<Record<number, string>> = {
  0: "No matching race, or already at the newest meet (pre-v3.1 firmware)",
  50: "The timer has no race matching that request",
  51: "Already at the newest meet",
  100: "The timer is in the SETUPS screen",
  101: "Remote setups are disabled on the timer (SETUPS | Hardware)",
  102: "The timer is not reset",
  200: "Invalid start state",
  201: "Invalid button-early setting",
  202: "Invalid compare setting",
  203: "Invalid number of buttons",
  204: "Invalid finish setting",
  205: "Invalid voltage setting",
  206: "Invalid volume setting",
  207: "Invalid lap splits setting",
  208: "Invalid cumulative splits setting",
  209: "Invalid screen count setting",
  210: "Invalid scoreboard count setting",
  211: "Invalid warning messages setting",
  212: "Invalid start delay",
  213: "Invalid far split delay",
  214: "Invalid near split delay",
  215: "Invalid thousandths accuracy setting",
  216: "Invalid units",
  217: "Invalid pool length",
  218: "Invalid far splits setting",
  219: "Invalid number of pool lanes",
  220: "Invalid reversed lanes setting",
  221: "Invalid scoreboard order",
  222: "Invalid half scoreboard setting",
  223: "Invalid scoreboard speed",
  224: "Invalid new value",
  225: "Invalid blank value",
  226: "Invalid module",
  227: "Must define or blank a module",
  228: "Invalid one-line sequence",
  229: "Invalid sequence time",
  230: "Invalid number of sequences",
  231: "Invalid print-store setting",
  232: "Invalid eight-lines setting",
  233: "Invalid character size",
  234: "Invalid page length",
  235: "Invalid printer",
  236: "Invalid event sequence",
  237: "Invalid entry number",
  238: "Invalid swimmer type",
  239: "Invalid race length",
  240: "Invalid event number",
  241: "Invalid seconds",
  242: "Invalid minutes",
  243: "Invalid hours",
  244: "Invalid year",
  245: "Invalid month",
  246: "Invalid day of month",
  247: "Invalid day of week",
  248: "Invalid 24-hour mode",
  300: "Invalid write-setups sub-command",
  301: "Invalid read-setups sub-command",
};

export function describeTimerError(code: number): string {
  return TIMER_ERRORS[code] ?? `Unknown timer error ${code}`;
}

export class TimerResponseError extends Error {
  constructor(readonly code: number) {
    super(describeTimerError(code));
    this.name = "TimerResponseError";
  }

  /** The request was valid but there is no such race (50, or 0 on old firmware). */
  get isNoRace(): boolean {
    return this.code === 50 || this.code === 0;
  }
}

export function decodeErrorCode(data: Uint8Array): number {
  return data[0]! | (data[1]! << 8);
}

export function encodeErrorCode(code: number): Uint8Array {
  return Uint8Array.of(code & 0xff, code >> 8);
}
