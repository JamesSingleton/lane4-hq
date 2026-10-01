/**
 * `TYPE_MEETMGMT_HEADER` + per-lane data, as returned by `S`, `T`, and `M±`.
 *
 * Widths the vendor document leaves implicit are parameters here so they can
 * be corrected after hardware validation without touching callers:
 * `int` is 2-byte little-endian (16-bit firmware) and `MAX_NUM_LANES` is 10.
 */

export const DEFAULT_MAX_NUM_LANES = 10;

export type DecodeOptions = {
  /** `MAX_NUM_LANES` in the timer firmware; sizes the two reserved arrays. */
  maxNumLanes?: number;
};

export type TimerDate = {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
};

export type TimerRaceHeader = {
  /** Event 0–999 (`event_16_bit`, falling back to the 1-byte `event`). 0 = untitled. */
  event: number;
  heat: number;
  raceNumber: number;
  date: TimerDate | null;
  raceLengths: number;
  lanesInPool: number;
  numTimesPerLane: number;
  numberOfButtons: number;
  includes: {
    backup: boolean;
    splits: boolean;
    individualButtons: boolean;
    relayJudging: boolean;
  };
};

export type LaneStatus = "finished" | "no-finish" | "dq";

export type TimerLane = {
  lane: number;
  /** 1–10 for a normal finish; 0 when nothing finished; -1 when DQ. */
  place: number;
  status: LaneStatus;
  /** Last split, i.e. the final time, in thousandths. `null` when 0. */
  finalMs: number | null;
  /** Cumulative splits as sent (the last one is the final time). */
  splitsMs: Array<number | null>;
  /** Individual backup button times, when requested and more than one was used. */
  buttonsMs: Array<number | null>;
  backupMs: number | null;
  /** Relay platform-to-pad differences; negative means an early takeoff. */
  relayExchangesMs: number[];
};

export type TimerRace = TimerRaceHeader & {
  lanes: TimerLane[];
  /** Set when the lane layout had to be inferred from byte counts. */
  layoutWarning?: string;
};

export class RaceDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RaceDecodeError";
  }
}

export function headerBytes(maxNumLanes = DEFAULT_MAX_NUM_LANES): number {
  // 16 fixed bytes, two reserved[MAX_NUM_LANES+1] arrays, then 9 bytes.
  return 16 + 2 * (maxNumLanes + 1) + 9;
}

function u16(data: Uint8Array, at: number): number {
  return data[at]! | (data[at + 1]! << 8);
}

function i16(data: Uint8Array, at: number): number {
  const v = u16(data, at);
  return v & 0x8000 ? v - 0x10000 : v;
}

function u32(data: Uint8Array, at: number): number {
  return (
    (data[at]! |
      (data[at + 1]! << 8) |
      (data[at + 2]! << 16) |
      (data[at + 3]! << 24)) >>>
    0
  );
}

function time(value: number): number | null {
  return value === 0 ? null : value;
}

function decodeDate(data: Uint8Array, longYearAt: number): TimerDate | null {
  const [seconds, minutes, hours, weekday, month, day, year] = data.subarray(
    6,
    13,
  );
  if (!month || !day) return null;
  const longYear = u16(data, longYearAt);
  const fullYear =
    longYear >= 1990 && longYear <= 2089
      ? longYear
      : year! < 90
        ? 2000 + year!
        : 1900 + year!;
  return {
    year: fullYear,
    month,
    day,
    hours: hours!,
    minutes: minutes!,
    seconds: seconds!,
    weekday: weekday!,
  };
}

export function decodeHeader(
  data: Uint8Array,
  options: DecodeOptions = {},
): TimerRaceHeader {
  const maxLanes = options.maxNumLanes ?? DEFAULT_MAX_NUM_LANES;
  const size = headerBytes(maxLanes);
  if (data.length < size) {
    throw new RaceDecodeError(
      `Race header needs ${size} bytes but the response has ${data.length}.`,
    );
  }
  const tail = 16 + 2 * (maxLanes + 1);
  const event8 = data[0]!;
  const event16 = u16(data, tail + 4);
  return {
    event: event16 || event8,
    heat: data[1]!,
    raceNumber: u16(data, 4),
    date: decodeDate(data, tail),
    raceLengths: data[13]!,
    lanesInPool: data[14]!,
    numTimesPerLane: data[15]!,
    numberOfButtons: data[tail + 8]!,
    includes: {
      backup: data[2] !== 0,
      splits: data[3] !== 0,
      individualButtons: data[tail + 6] !== 0,
      relayJudging: data[tail + 7] !== 0,
    },
  };
}

type LaneLayout = {
  splits: number;
  buttons: number;
  backup: number;
  exchanges: number;
};

function layoutForTimes(
  header: TimerRaceHeader,
  perLane: number,
  times: number,
): LaneLayout | null {
  const exchangeBytes = perLane - 1 - 4 * times;
  if (times < 1 || exchangeBytes < 0 || exchangeBytes % 2 !== 0) return null;
  if (!header.includes.relayJudging && exchangeBytes !== 0) return null;
  const backup = header.includes.backup ? 1 : 0;
  let buttons = 0;
  let splits: number;
  if (header.includes.splits) {
    buttons =
      header.includes.individualButtons && header.numberOfButtons > 1
        ? header.numberOfButtons
        : 0;
    if (times - backup - buttons < 1) buttons = 0;
    splits = times - backup - buttons;
  } else {
    splits = 1;
    buttons = times - backup - 1;
    if (buttons > 0 && !header.includes.individualButtons) return null;
  }
  if (splits < 1 || buttons < 0) return null;
  return { splits, buttons, backup, exchanges: exchangeBytes / 2 };
}

function inferLayout(
  header: TimerRaceHeader,
  perLane: number,
): { layout: LaneLayout; warning?: string } {
  const declared = layoutForTimes(header, perLane, header.numTimesPerLane);
  if (declared) return { layout: declared };

  // `num_times_for_each_lane` didn't explain the byte count. Prefer the
  // usual 3 relay exchanges, then fewer, then more.
  const exchangeGuesses = header.includes.relayJudging
    ? [3, 0, 1, 2, 4, 5, 6, 7, 8, 9]
    : [0];
  for (const exchanges of exchangeGuesses) {
    const rest = perLane - 1 - 2 * exchanges;
    if (rest <= 0 || rest % 4 !== 0) continue;
    const layout = layoutForTimes(header, perLane, rest / 4);
    if (layout) {
      return {
        layout,
        warning: `Timer reported ${header.numTimesPerLane} times per lane but sent ${rest / 4}; layout inferred from byte count.`,
      };
    }
  }
  throw new RaceDecodeError(
    `Can't split ${perLane} bytes per lane into place, times, and exchanges.`,
  );
}

/** Decode a full `S` response. Lengths must account for every byte. */
export function decodeRace(
  data: Uint8Array,
  options: DecodeOptions = {},
): TimerRace {
  const header = decodeHeader(data, options);
  const size = headerBytes(options.maxNumLanes ?? DEFAULT_MAX_NUM_LANES);
  const body = data.length - size;
  if (header.lanesInPool === 0) {
    if (body !== 0) {
      throw new RaceDecodeError(
        `Header says 0 lanes but ${body} bytes follow.`,
      );
    }
    return { ...header, lanes: [] };
  }
  if (body % header.lanesInPool !== 0) {
    throw new RaceDecodeError(
      `${body} lane bytes don't divide evenly across ${header.lanesInPool} lanes.`,
    );
  }
  const perLane = body / header.lanesInPool;
  const { layout, warning } = inferLayout(header, perLane);

  const lanes: TimerLane[] = [];
  let at = size;
  for (let lane = 1; lane <= header.lanesInPool; lane++) {
    const raw = data[at]!;
    const place = raw > 127 ? raw - 256 : raw;
    at += 1;
    const splitsMs: Array<number | null> = [];
    for (let i = 0; i < layout.splits; i++, at += 4) {
      splitsMs.push(time(u32(data, at)));
    }
    const buttonsMs: Array<number | null> = [];
    for (let i = 0; i < layout.buttons; i++, at += 4) {
      buttonsMs.push(time(u32(data, at)));
    }
    let backupMs: number | null = null;
    if (layout.backup) {
      backupMs = time(u32(data, at));
      at += 4;
    }
    const relayExchangesMs: number[] = [];
    for (let i = 0; i < layout.exchanges; i++, at += 2) {
      relayExchangesMs.push(i16(data, at));
    }
    lanes.push({
      lane,
      place,
      status: place < 0 ? "dq" : place === 0 ? "no-finish" : "finished",
      finalMs: splitsMs[splitsMs.length - 1] ?? null,
      splitsMs,
      buttonsMs,
      backupMs,
      relayExchangesMs,
    });
  }
  return warning
    ? { ...header, lanes, layoutWarning: warning }
    : { ...header, lanes };
}

// ---------------------------------------------------------------------------
// Encoding (used by the simulator and golden tests)
// ---------------------------------------------------------------------------

export type EncodeLane = {
  place: number;
  splitsMs: Array<number | null>;
  buttonsMs?: Array<number | null>;
  backupMs?: number | null;
  relayExchangesMs?: number[];
};

export type EncodeRaceInput = {
  event: number;
  heat: number;
  raceNumber: number;
  date?: TimerDate | null;
  raceLengths: number;
  numberOfButtons?: number;
  includes: TimerRaceHeader["includes"];
  lanes: EncodeLane[];
};

function putU16(out: Uint8Array, at: number, value: number): void {
  out[at] = value & 0xff;
  out[at + 1] = (value >> 8) & 0xff;
}

function putU32(out: Uint8Array, at: number, value: number): void {
  out[at] = value & 0xff;
  out[at + 1] = (value >>> 8) & 0xff;
  out[at + 2] = (value >>> 16) & 0xff;
  out[at + 3] = (value >>> 24) & 0xff;
}

export function encodeRace(
  race: EncodeRaceInput,
  options: DecodeOptions = {},
): Uint8Array {
  const maxLanes = options.maxNumLanes ?? DEFAULT_MAX_NUM_LANES;
  const size = headerBytes(maxLanes);
  const tail = 16 + 2 * (maxLanes + 1);
  const first = race.lanes[0];
  const splits = first?.splitsMs.length ?? 0;
  const buttons = first?.buttonsMs?.length ?? 0;
  const backup = race.includes.backup ? 1 : 0;
  const exchanges = first?.relayExchangesMs?.length ?? 0;
  const perLane = 1 + 4 * (splits + buttons + backup) + 2 * exchanges;

  const out = new Uint8Array(size + perLane * race.lanes.length);
  out[0] = race.event <= 0xff ? race.event : 0;
  out[1] = race.heat;
  out[2] = race.includes.backup ? 1 : 0;
  out[3] = race.includes.splits ? 1 : 0;
  putU16(out, 4, race.raceNumber);
  const d = race.date;
  if (d) {
    out.set(
      [d.seconds, d.minutes, d.hours, d.weekday, d.month, d.day, d.year % 100],
      6,
    );
    putU16(out, tail, d.year);
  }
  out[13] = race.raceLengths;
  out[14] = race.lanes.length;
  out[15] = splits + buttons + backup;
  putU16(out, tail + 4, race.event);
  out[tail + 6] = race.includes.individualButtons ? 1 : 0;
  out[tail + 7] = race.includes.relayJudging ? 1 : 0;
  out[tail + 8] = race.numberOfButtons ?? 0;

  let at = size;
  for (const lane of race.lanes) {
    out[at] = lane.place & 0xff;
    at += 1;
    for (const t of lane.splitsMs) {
      putU32(out, at, t ?? 0);
      at += 4;
    }
    for (const t of lane.buttonsMs ?? []) {
      putU32(out, at, t ?? 0);
      at += 4;
    }
    if (backup) {
      putU32(out, at, lane.backupMs ?? 0);
      at += 4;
    }
    for (const x of lane.relayExchangesMs ?? []) {
      putU16(out, at, x & 0xffff);
      at += 2;
    }
  }
  return out;
}
