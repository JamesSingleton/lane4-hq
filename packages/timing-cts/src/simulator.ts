/**
 * In-memory CTS console that answers the same DATA-level commands as real
 * hardware. Drives development, UI work, and CI without a timer attached.
 */
import type { TimerTransport } from "./client";
import { encodeErrorCode } from "./errors";
import { encodeRace, type TimerDate } from "./race";
import { encodePoolSetup, encodeSplitsSetup, type PoolSetup } from "./setups";

export type SimulatorModel = "system6" | "system5" | "4000a" | "gen7";

export type SimulatorOptions = {
  model?: SimulatorModel;
  version?: string;
  pool?: Partial<PoolSetup>;
  numberOfButtons?: number;
  /** Races kept before the oldest is discarded (System 5 ≈ 500, 4000A ≈ 150). */
  capacity?: number;
  /** Clock for new meets and races. */
  now?: () => Date;
  /** Artificial latency per request, in ms. */
  latencyMs?: number;
};

export type SimLaneInput = {
  lane: number;
  /** Final (touchpad) time. `null` = no finish recorded on the pad. */
  finalMs: number | null;
  /** Cumulative splits, *excluding* the final. */
  splitsMs?: number[];
  backupMs?: number | null;
  buttonsMs?: number[];
  dq?: boolean;
  relayExchangesMs?: number[];
};

export type SimRaceInput = {
  event?: number;
  heat?: number;
  lengths: number;
  lanes: SimLaneInput[];
};

type StoredLane = {
  place: number;
  splitsMs: Array<number | null>;
  buttonsMs: Array<number | null>;
  backupMs: number | null;
  relayExchangesMs: number[];
};

type StoredRace = {
  event: number;
  heat: number;
  raceNumber: number;
  date: TimerDate;
  lengths: number;
  lanes: StoredLane[];
};

type StoredMeet = { date: TimerDate; races: StoredRace[]; nextRace: number };

const DEFAULT_VERSIONS: Record<SimulatorModel, string> = {
  system6: "SYS6 SWIM 1.110",
  system5: "SWIM 3.25",
  "4000a": "4000A SWIM 3.10",
  gen7: "GEN7 SWIM 2026",
};

function toTimerDate(d: Date): TimerDate {
  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
    hours: d.getHours(),
    minutes: d.getMinutes(),
    seconds: d.getSeconds(),
    weekday: d.getDay(),
  };
}

const NO_RACE = 50;
const AT_NEWEST_MEET = 51;
const REMOTE_SETUPS_DISABLED = 101;
const INVALID_WRITE = 300;
const INVALID_READ = 301;

export class TimerSimulator implements TimerTransport {
  readonly model: SimulatorModel;
  readonly version: string;
  readonly pool: PoolSetup;
  readonly numberOfButtons: number;
  private readonly capacity: number;
  private readonly now: () => Date;
  private readonly latencyMs: number;
  private meets: StoredMeet[] = [];
  private meetIndex = 0;
  private raceIndex = -1;
  /** Every DATA payload received, for assertions and the dev console. */
  readonly log: Uint8Array[] = [];

  constructor(options: SimulatorOptions = {}) {
    this.model = options.model ?? "system6";
    this.version = options.version ?? DEFAULT_VERSIONS[this.model];
    this.pool = {
      reverseLanes: false,
      lanesInPool: 8,
      farEndSplits: false,
      course: "short",
      units: "yards",
      ...options.pool,
    };
    this.numberOfButtons = options.numberOfButtons ?? 3;
    this.capacity = options.capacity ?? 500;
    this.now = options.now ?? (() => new Date());
    this.latencyMs = options.latencyMs ?? 0;
    this.powerOn();
  }

  /** The timer starts a new meet every time it's turned on. */
  powerOn(): void {
    this.meets = this.meets.filter((m) => m.races.length > 0);
    this.meets.push({ date: toTimerDate(this.now()), races: [], nextRace: 1 });
    this.meetIndex = this.meets.length - 1;
    this.raceIndex = -1;
  }

  get raceCount(): number {
    return this.meets.reduce((n, m) => n + m.races.length, 0);
  }

  /** Finish a race on the console. Returns its race number. */
  runRace(input: SimRaceInput): number {
    const meet = this.meets[this.meets.length - 1]!;
    const finals = new Map<number, SimLaneInput>();
    for (const lane of input.lanes) finals.set(lane.lane, lane);
    const ranked = input.lanes
      .filter((l) => !l.dq && l.finalMs != null)
      .sort((a, b) => a.finalMs! - b.finalMs!);
    const places = new Map<number, number>();
    ranked.forEach((l, i) => {
      if (i < 10) places.set(l.lane, i + 1);
    });

    const exchangeCount = Math.max(
      0,
      ...input.lanes.map((l) => l.relayExchangesMs?.length ?? 0),
    );
    const lanes: StoredLane[] = [];
    for (let n = 1; n <= this.pool.lanesInPool; n++) {
      const lane = finals.get(n);
      const splits: Array<number | null> = [];
      for (let i = 0; i < input.lengths - 1; i++) {
        splits.push(lane?.splitsMs?.[i] ?? null);
      }
      splits.push(lane?.finalMs ?? null);
      const buttons: Array<number | null> = [];
      for (let i = 0; i < this.numberOfButtons; i++) {
        buttons.push(lane?.buttonsMs?.[i] ?? null);
      }
      const exchanges: number[] = [];
      for (let i = 0; i < exchangeCount; i++) {
        exchanges.push(lane?.relayExchangesMs?.[i] ?? 0);
      }
      lanes.push({
        place: lane?.dq ? -1 : (places.get(n) ?? 0),
        splitsMs: splits,
        buttonsMs: buttons,
        backupMs: lane?.backupMs ?? null,
        relayExchangesMs: exchanges,
      });
    }

    const race: StoredRace = {
      event: input.event ?? 0,
      heat: input.heat ?? 0,
      raceNumber: meet.nextRace++,
      date: toTimerDate(this.now()),
      lengths: input.lengths,
      lanes,
    };
    const atNewest =
      this.meetIndex === this.meets.length - 1 &&
      this.raceIndex === meet.races.length - 1;
    meet.races.push(race);
    if (atNewest) this.raceIndex = meet.races.length - 1;
    this.enforceCapacity();
    return race.raceNumber;
  }

  private enforceCapacity(): void {
    while (this.raceCount > this.capacity) {
      const oldest = this.meets.find((m) => m.races.length > 0)!;
      oldest.races.shift();
      if (oldest === this.meets[this.meetIndex]) {
        this.raceIndex = Math.min(
          Math.max(0, this.raceIndex - 1),
          oldest.races.length - 1,
        );
      }
      if (
        oldest.races.length === 0 &&
        oldest !== this.meets[this.meets.length - 1]
      ) {
        const at = this.meets.indexOf(oldest);
        this.meets.splice(at, 1);
        if (this.meetIndex >= at)
          this.meetIndex = Math.max(0, this.meetIndex - 1);
      }
    }
  }

  async request(data: Uint8Array): Promise<Uint8Array> {
    this.log.push(data.slice());
    if (this.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    }
    return this.respond(data);
  }

  private error(code: number): Uint8Array {
    return encodeErrorCode(code);
  }

  private meetHeader(): Uint8Array {
    return encodeRace({
      event: 0,
      heat: 0,
      raceNumber: 0,
      date: this.meets[this.meetIndex]!.date,
      raceLengths: 0,
      includes: {
        backup: false,
        splits: false,
        individualButtons: false,
        relayJudging: false,
      },
      lanes: [],
    });
  }

  private respond(data: Uint8Array): Uint8Array {
    const command = String.fromCharCode(data[0]!);
    switch (command) {
      case "W":
        return Uint8Array.from([
          ...[...this.version].map((c) => c.charCodeAt(0)),
          0,
        ]);
      case "T":
        return this.meetHeader();
      case "M":
        return this.moveMeet(data[1]);
      case "S":
        return this.swim(data.subarray(1));
      case "R":
        return this.readSetups(data[1]);
      case "I":
        return this.error(REMOTE_SETUPS_DISABLED);
      default:
        return this.error(INVALID_WRITE);
    }
  }

  private moveMeet(direction: number | undefined): Uint8Array {
    if (direction === 0x2b) {
      if (this.meetIndex >= this.meets.length - 1) {
        return this.error(AT_NEWEST_MEET);
      }
      this.meetIndex++;
    } else if (direction === 0x2d) {
      this.meetIndex =
        this.meetIndex === 0 ? this.meets.length - 1 : this.meetIndex - 1;
    } else {
      return this.error(INVALID_WRITE);
    }
    this.raceIndex = this.meets[this.meetIndex]!.races.length - 1;
    return this.meetHeader();
  }

  private readSetups(sub: number | undefined): Uint8Array {
    switch (sub) {
      case 0x69:
        return encodePoolSetup(this.pool);
      case 0x67:
        return encodeSplitsSetup({
          cumulativeSplits: true,
          byLapSplits: false,
        });
      case 0x72:
        return Uint8Array.of(0);
      default:
        return this.error(INVALID_READ);
    }
  }

  private swim(args: Uint8Array): Uint8Array {
    const include = {
      backup: false,
      splits: false,
      individualButtons: false,
      relayJudging: false,
    };
    const races = this.meets[this.meetIndex]!.races;
    let target: number = this.raceIndex;
    let move = false;
    for (let i = 0; i < args.length; i++) {
      const c = String.fromCharCode(args[i]!);
      if (c === "B") include.backup = true;
      else if (c === "S") include.splits = true;
      else if (c === "I") include.individualButtons = true;
      else if (c === "J") include.relayJudging = true;
      else if (c === "X") continue;
      else if (c === "C") {
        if (this.model === "gen7") return this.error(INVALID_WRITE);
        target = races.length - 1;
      } else if (c === "L") {
        target = this.raceIndex - 1;
        move = true;
      } else if (c === "N") {
        target = this.raceIndex + 1;
        move = true;
      } else if (c === "E") {
        const heat = args[i + 1] ?? 0;
        let event = args[i + 2] ?? 0;
        i += 2;
        if (event === 0) {
          event = (args[i + 1] ?? 0) | ((args[i + 2] ?? 0) << 8);
          i += 2;
        }
        target = -1;
        races.forEach((r, at) => {
          if (r.event === event && r.heat === heat) target = at;
        });
      } else if (c === "R") {
        const number = (args[i + 1] ?? 0) | ((args[i + 2] ?? 0) << 8);
        i += 2;
        target = races.findIndex((r) => r.raceNumber === number);
      }
    }
    const race = races[target];
    if (!race) return this.error(NO_RACE);
    if (move) this.raceIndex = target;
    return this.encodeStored(race, include);
  }

  private encodeStored(
    race: StoredRace,
    include: {
      backup: boolean;
      splits: boolean;
      individualButtons: boolean;
      relayJudging: boolean;
    },
  ): Uint8Array {
    const sendButtons = include.individualButtons && this.numberOfButtons > 1;
    const sendExchanges =
      include.relayJudging &&
      race.lanes.some((l) => l.relayExchangesMs.length > 0);
    return encodeRace({
      event: race.event,
      heat: race.heat,
      raceNumber: race.raceNumber,
      date: race.date,
      raceLengths: race.lengths,
      numberOfButtons: this.numberOfButtons,
      includes: {
        backup: include.backup,
        splits: include.splits,
        individualButtons: sendButtons,
        relayJudging: sendExchanges,
      },
      lanes: race.lanes.map((lane) => ({
        place: lane.place,
        splitsMs: include.splits
          ? lane.splitsMs
          : [lane.splitsMs[lane.splitsMs.length - 1]!],
        buttonsMs: sendButtons ? lane.buttonsMs : [],
        backupMs: lane.backupMs,
        relayExchangesMs: sendExchanges ? lane.relayExchangesMs : [],
      })),
    });
  }
}

export function createSimulator(options?: SimulatorOptions): TimerSimulator {
  return new TimerSimulator(options);
}

/** Small deterministic PRNG so simulated races are reproducible. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A plausible swim for one lane: final within ±3% of `seedMs`, even-ish
 * cumulative splits, three buttons and a backup near the pad time, and
 * relay exchanges when `legs > 1`.
 */
export function simulateSwim(
  lane: number,
  seedMs: number,
  lengths: number,
  random: () => number,
  legs = 1,
): SimLaneInput {
  const finalMs = Math.round(seedMs * (0.97 + random() * 0.06));
  const splitsMs: number[] = [];
  for (let i = 1; i < lengths; i++) {
    const share = i / lengths;
    splitsMs.push(Math.round(finalMs * share * (0.98 + random() * 0.02)));
  }
  const buttonsMs = [0, 1, 2].map(
    () => finalMs + Math.round(80 + random() * 220),
  );
  const exchanges: number[] = [];
  for (let i = 1; i < legs; i++) {
    exchanges.push(Math.round(-30 + random() * 400));
  }
  return {
    lane,
    finalMs,
    splitsMs,
    buttonsMs,
    backupMs: buttonsMs[1]!,
    ...(exchanges.length > 0 ? { relayExchangesMs: exchanges } : {}),
  };
}
