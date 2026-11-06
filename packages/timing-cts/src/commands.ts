/**
 * Command payload builders (the DATA part of a packet). Only one primary
 * command is allowed per packet.
 */

const W = 0x57;
const T = 0x54;
const M = 0x4d;
const S = 0x53;
const R = 0x52;

export type SwimOptions = {
  /** `B`: include backup times. */
  backup?: boolean;
  /** `S`: include split times (otherwise only the final time is sent). */
  splits?: boolean;
  /** `I`: include every individual button time (v3.1+). */
  individualButtons?: boolean;
  /** `J`: include relay exchange judging (v3.1+). */
  relayJudging?: boolean;
  /** `X`: include start reaction times (System 6 v1.109+ only). */
  reactionTimes?: boolean;
};

export type RaceSelector =
  /** The race at the timer's race pointer. */
  | { kind: "pointer" }
  /** `C`: the current race. Not supported on Gen7. */
  | { kind: "current" }
  /** `L`: the previous race (moves the pointer back). */
  | { kind: "last" }
  /** `N`: the next race (moves the pointer forward). */
  | { kind: "next" }
  /** `E#$`: by event and heat; only stored when the timer ran titled. */
  | { kind: "event"; event: number; heat: number }
  /** `R##`: by race number. */
  | { kind: "race"; raceNumber: number };

export type SetupsSubCommand =
  /** Splits setup (`struct mm_splits_setup`). Gen7: supported. */
  | "g"
  /** Pool setup (`struct mm_pool_setup`). Gen7: supported. */
  | "i"
  /** Selected event sequence (uchar). Gen7: supported. */
  | "r";

/**
 * Size of each setups structure. Every read in F397's worked example sends
 * `R`, the sub-command, then a zeroed structure of that size (`52 72 00` for
 * the one-byte `r`), so reads here do the same.
 */
const SETUPS_BYTES: Readonly<Record<SetupsSubCommand, number>> = {
  g: 2,
  i: 5,
  r: 1,
};

export function whoAreYou(): Uint8Array {
  return Uint8Array.of(W);
}

export function meetTimeAndDate(): Uint8Array {
  return Uint8Array.of(T);
}

export function nextMeet(): Uint8Array {
  return Uint8Array.of(M, 0x2b);
}

export function previousMeet(): Uint8Array {
  return Uint8Array.of(M, 0x2d);
}

export function readSetups(sub: SetupsSubCommand): Uint8Array {
  const data = new Uint8Array(2 + SETUPS_BYTES[sub]);
  data[0] = R;
  data[1] = sub.charCodeAt(0);
  return data;
}

function assertByte(value: number, label: string, min = 0): void {
  if (!Number.isInteger(value) || value < min || value > 0xff) {
    throw new RangeError(`${label} must be an integer from ${min} to 255.`);
  }
}

function assertWord(value: number, label: string, min: number): void {
  if (!Number.isInteger(value) || value < min || value > 0xffff) {
    throw new RangeError(`${label} must be an integer from ${min} to 65535.`);
  }
}

/**
 * `S` + include options + one selector. Options must precede the selector;
 * the timer acts on the last selector and ignores the rest.
 */
export function swimData(
  selector: RaceSelector = { kind: "pointer" },
  options: SwimOptions = {},
): Uint8Array {
  const bytes: number[] = [S];
  if (options.backup) bytes.push(0x42);
  if (options.individualButtons) bytes.push(0x49);
  if (options.relayJudging) bytes.push(0x4a);
  if (options.splits) bytes.push(0x53);
  if (options.reactionTimes) bytes.push(0x58);

  switch (selector.kind) {
    case "pointer":
      break;
    case "current":
      bytes.push(0x43);
      break;
    case "last":
      bytes.push(0x4c);
      break;
    case "next":
      bytes.push(0x4e);
      break;
    case "event": {
      assertByte(selector.heat, "Heat", 1);
      if (!Number.isInteger(selector.event) || selector.event < 1) {
        throw new RangeError("Event must be a positive integer.");
      }
      if (selector.event <= 0xff) {
        bytes.push(0x45, selector.heat, selector.event);
      } else {
        assertWord(selector.event, "Event", 1);
        // v3.1+: `E # 00 @@` with a two-byte event number, LSB first.
        bytes.push(
          0x45,
          selector.heat,
          0,
          selector.event & 0xff,
          selector.event >> 8,
        );
      }
      break;
    }
    case "race":
      assertWord(selector.raceNumber, "Race number", 0);
      bytes.push(0x52, selector.raceNumber & 0xff, selector.raceNumber >> 8);
      break;
  }
  return Uint8Array.from(bytes);
}

/** True when `data` is a read-splits-setup (`Rg`) command, whose 2-byte response is not an error. */
export function isReadSplitsSetup(data: Uint8Array): boolean {
  return data[0] === R && data[1] === 0x67;
}

/**
 * False for commands that move a timer pointer (`M±`, `S…L`, `S…N`). The
 * timer may have acted on a command whose reply was lost, so re-sending one
 * would move the pointer twice.
 */
export function isSafeToResend(data: Uint8Array): boolean {
  if (data[0] === M) return false;
  if (data[0] !== S) return true;
  // Options come first. The selector's arguments are binary, so anything
  // after the selector byte can look like a command letter.
  const selector = data.find(
    (byte, at) => at > 0 && ![0x42, 0x49, 0x4a, 0x53, 0x58].includes(byte),
  );
  return selector !== 0x4c && selector !== 0x4e;
}
