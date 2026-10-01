import {
  isReadSplitsSetup,
  meetTimeAndDate,
  nextMeet,
  previousMeet,
  type RaceSelector,
  readSetups,
  type SwimOptions,
  swimData,
  whoAreYou,
} from "./commands";
import { ACK, decodeErrorCode, TimerResponseError } from "./errors";
import {
  type DecodeOptions,
  decodeHeader,
  decodeRace,
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

export type RaceResponse = { race: TimerRace; raw: Uint8Array };

/** Read-only client for the CTS meet management interface. */
export class CtsTimer {
  constructor(
    private readonly transport: TimerTransport,
    private readonly decode: DecodeOptions = {},
  ) {}

  private async send(data: Uint8Array): Promise<Uint8Array> {
    const reply = await this.transport.request(data);
    if (reply.length === 2 && !isReadSplitsSetup(data)) {
      const code = decodeErrorCode(reply);
      if (code !== ACK) throw new TimerResponseError(code);
    }
    return reply;
  }

  /** `W`: the firmware version string, e.g. "SWIM 3.25". */
  async whoAreYou(): Promise<string> {
    const reply = await this.send(whoAreYou());
    const end = reply.indexOf(0);
    const text = reply.subarray(0, end === -1 ? reply.length : end);
    return String.fromCharCode(...text).trim();
  }

  /** `T`: the date of the meet at the meet pointer. */
  async meetDate(): Promise<TimerDate | null> {
    return decodeHeader(await this.send(meetTimeAndDate()), this.decode).date;
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
    return { race: decodeRace(raw, this.decode), raw };
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
