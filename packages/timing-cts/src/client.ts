import {
  meetTimeAndDate,
  nextMeet,
  previousMeet,
  type RaceSelector,
  readSetups,
  type SwimOptions,
  swimData,
  whoAreYou,
} from "./commands";
import { replyErrorCode, TimerResponseError } from "./errors";
import {
  DEFAULT_MAX_NUM_LANES,
  type DecodeOptions,
  decodeHeader,
  decodeRace,
  maxLanesFromHeader,
  type TimerDate,
  type TimerRace,
} from "./race";
import {
  decodePoolSetup,
  decodeSplitsSetup,
  type PoolSetup,
  type SplitsSetup,
} from "./setups";

/**
 * Sends one command's DATA and resolves with the verified DATA of the reply.
 * Framing, checksums, timeouts, and retries are the transport's job (Rust
 * serial transport in the desktop app, or the simulator).
 */
export interface TimerTransport {
  request(data: Uint8Array): Promise<Uint8Array>;
}

/** Everything v1 asks for when pulling a race for review. */
export const FULL_RACE_OPTIONS: SwimOptions = {
  backup: true,
  splits: true,
  individualButtons: true,
  relayJudging: true,
};

export type RaceResponse = {
  race: TimerRace;
  raw: Uint8Array;
  /** The header width `raw` was decoded with, to decode it again later. */
  maxNumLanes: number;
};

/** The NULL-terminated string a `W` reply carries. */
export function decodeVersion(reply: Uint8Array): string {
  const end = reply.indexOf(0);
  const text = reply.subarray(0, end === -1 ? reply.length : end);
  return String.fromCharCode(...text).trim();
}

/** Read-only client for the CTS meet management interface. */
export class CtsTimer {
  constructor(
    private readonly transport: TimerTransport,
    private decode: DecodeOptions = {},
  ) {}

  private async send(data: Uint8Array): Promise<Uint8Array> {
    const reply = await this.transport.request(data);
    const code = replyErrorCode(data, reply);
    if (code !== null) throw new TimerResponseError(code);
    return reply;
  }

  /** `W`: the firmware version string, e.g. "SWIM 3.25". */
  async whoAreYou(): Promise<string> {
    return decodeVersion(await this.send(whoAreYou()));
  }

  /**
   * `T`: the date of the meet at the meet pointer, or `null` if the timer has
   * none to report (it only returns meets that have races stored). The reply
   * is a bare header, so its length also sets `MAX_NUM_LANES` unless the
   * caller fixed it.
   */
  async meetDate(): Promise<TimerDate | null> {
    let reply: Uint8Array;
    try {
      reply = await this.send(meetTimeAndDate());
    } catch (error) {
      if (error instanceof TimerResponseError) return null;
      throw error;
    }
    const maxNumLanes = maxLanesFromHeader(reply.length);
    if (maxNumLanes !== null && this.decode.maxNumLanes === undefined) {
      this.decode = { ...this.decode, maxNumLanes };
    }
    return decodeHeader(reply, this.decode).date;
  }

  async nextMeet(): Promise<TimerDate | null> {
    return decodeHeader(await this.send(nextMeet()), this.decode).date;
  }

  async previousMeet(): Promise<TimerDate | null> {
    return decodeHeader(await this.send(previousMeet()), this.decode).date;
  }

  async race(
    selector: RaceSelector,
    options: SwimOptions = FULL_RACE_OPTIONS,
  ): Promise<RaceResponse> {
    const raw = await this.send(swimData(selector, options));
    return {
      race: decodeRace(raw, this.decode),
      raw,
      maxNumLanes: this.decode.maxNumLanes ?? DEFAULT_MAX_NUM_LANES,
    };
  }

  /** Like `race`, but resolves `null` instead of throwing when there's no such race. */
  async raceIfPresent(
    selector: RaceSelector,
    options: SwimOptions = FULL_RACE_OPTIONS,
  ): Promise<RaceResponse | null> {
    try {
      return await this.race(selector, options);
    } catch (error) {
      if (error instanceof TimerResponseError && error.isNoRace) return null;
      throw error;
    }
  }

  /** Place and final time only, or `null` for no race or a refused command. */
  private async peek(selector: RaceSelector): Promise<TimerRace | null> {
    try {
      return (await this.race(selector, {})).race;
    } catch (error) {
      if (error instanceof TimerResponseError) return null;
      throw error;
    }
  }

  /**
   * The lowest race number above `after`, found by walking the race pointer.
   * F397 doesn't say where numbering starts or that it has no gaps, and the
   * timer discards its oldest races, so `after + 1` may never exist. Resolves
   * `null` when there is no later race, or when `maxSteps` runs out; the
   * pointer stays where it stopped, so the next call carries on from there.
   */
  async nextRaceAfter(after: number, maxSteps = 40): Promise<number | null> {
    let at = await this.peek({ kind: "pointer" });
    let lowest: number | null = null;
    for (let step = 0; step < maxSteps; step++) {
      if (at && at.raceNumber <= after) {
        if (lowest !== null) return lowest;
        at = await this.peek({ kind: "next" });
        if (!at) return null;
      } else if (at) {
        lowest = at.raceNumber;
        const previous = await this.peek({ kind: "last" });
        // Stopped at the oldest race, or the pointer wrapped around.
        if (!previous || previous.raceNumber >= at.raceNumber) return lowest;
        at = previous;
      } else {
        at = await this.peek({ kind: "next" });
        if (!at) return null;
      }
    }
    return null;
  }

  /**
   * The newest race, found by walking the race pointer to the end. F397
   * doesn't say the pointer rests on the newest race.
   */
  async newestRace(maxSteps = 600): Promise<TimerRace | null> {
    let newest = await this.peek({ kind: "pointer" });
    for (let step = 0; step < maxSteps; step++) {
      const next = await this.peek({ kind: "next" });
      if (!next) break;
      newest = next;
    }
    return newest;
  }

  async poolSetup(): Promise<PoolSetup> {
    return decodePoolSetup(await this.send(readSetups("i")));
  }

  async splitsSetup(): Promise<SplitsSetup> {
    return decodeSplitsSetup(await this.send(readSetups("g")));
  }

  async selectedEventSequence(): Promise<number> {
    return (await this.send(readSetups("r")))[0]!;
  }
}
