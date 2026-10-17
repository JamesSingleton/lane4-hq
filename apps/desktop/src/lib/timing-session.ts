import {
  CtsTimer,
  FULL_RACE_OPTIONS,
  type RaceResponse,
  type TimerTransport,
} from "@lane4hq/timing-cts/client";
import type { DecodeOptions, TimerDate } from "@lane4hq/timing-cts/race";
import type { PoolSetup } from "@lane4hq/timing-cts/setups";

export type TimerIdentity = {
  version: string;
  meetDate: TimerDate | null;
  /** `null` on firmware before v3.1, which can't read setups. */
  pool: PoolSetup | null;
};

export type SessionStatus =
  | { state: "idle" }
  | { state: "connecting" }
  | {
      state: "connected";
      identity: TimerIdentity;
      polling: boolean;
      /** Highest race number pulled (or skipped) so far. */
      cursor: number;
      lastPollAt: number | null;
      error: string | null;
    }
  | { state: "error"; message: string };

export type SessionOptions = {
  transport: TimerTransport;
  decode?: DecodeOptions;
  /** Poll interval; the spec asks for 2 s. */
  intervalMs?: number;
  /** Races fetched per tick at most, so a backlog doesn't stall the UI. */
  maxPerTick?: number;
  onRace: (race: RaceResponse, identity: TimerIdentity) => void | Promise<void>;
  onStatus: (status: SessionStatus) => void;
  /** Consecutive failed polls before the session gives up. */
  maxFailures?: number;
  describeError?: (error: unknown) => string;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

/**
 * One connection to a CTS console. Polls for new races by race number
 * (`S…R##`), which every console including Gen7 supports, starting after
 * `cursor`.
 */
export class TimingSession {
  private readonly timer: CtsTimer;
  private status: SessionStatus = { state: "idle" };
  private handle: unknown = null;
  private failures = 0;
  private busy: Promise<void> | null = null;

  constructor(private readonly options: SessionOptions) {
    this.timer = new CtsTimer(options.transport, options.decode);
  }

  get current(): SessionStatus {
    return this.status;
  }

  private set(status: SessionStatus) {
    this.status = status;
    this.options.onStatus(status);
  }

  private message(error: unknown): string {
    return (
      this.options.describeError?.(error) ??
      (error instanceof Error ? error.message : String(error))
    );
  }

  async connect(cursor = 0): Promise<TimerIdentity> {
    this.set({ state: "connecting" });
    try {
      const version = await this.timer.whoAreYou();
      const meetDate = await this.timer.meetDate();
      const pool = await this.timer.poolSetup().catch(() => null);
      const identity = { version, meetDate, pool };
      this.set({
        state: "connected",
        identity,
        polling: false,
        cursor,
        lastPollAt: null,
        error: null,
      });
      return identity;
    } catch (error) {
      this.set({ state: "error", message: this.message(error) });
      throw error;
    }
  }

  /** The race at the timer's pointer (normally its newest), or null. */
  async latestRaceNumber(): Promise<number | null> {
    const race = await this.timer.raceIfPresent({ kind: "pointer" }, {});
    return race?.race.raceNumber ?? null;
  }

  setCursor(cursor: number) {
    if (this.status.state === "connected") this.set({ ...this.status, cursor });
  }

  start() {
    if (this.status.state !== "connected" || this.status.polling) return;
    this.set({ ...this.status, polling: true });
    this.schedule(0);
  }

  stop() {
    if (this.handle != null)
      (this.options.clearTimer ?? clearTimeout)(this.handle as never);
    this.handle = null;
    if (this.status.state === "connected" && this.status.polling) {
      this.set({ ...this.status, polling: false });
    }
  }

  private schedule(ms: number) {
    const set =
      this.options.setTimer ??
      ((fn: () => void, delay: number) => setTimeout(fn, delay));
    this.handle = set(() => {
      void this.pollOnce().then(() => {
        if (this.status.state === "connected" && this.status.polling) {
          this.schedule(this.options.intervalMs ?? 2000);
        }
      });
    }, ms);
  }

  /** Pull every race after the cursor that the console has now. */
  pollOnce(): Promise<void> {
    this.busy ??= this.poll().finally(() => {
      this.busy = null;
    });
    return this.busy;
  }

  private async poll(): Promise<void> {
    if (this.status.state !== "connected") return;
    const max = this.options.maxPerTick ?? 10;
    let cursor = this.status.cursor;
    try {
      for (let n = 0; n < max; n++) {
        const race = await this.timer.raceIfPresent(
          { kind: "race", raceNumber: cursor + 1 },
          FULL_RACE_OPTIONS,
        );
        if (!race) break;
        cursor = race.race.raceNumber;
        await this.options.onRace(race, this.status.identity);
      }
      this.failures = 0;
      if (this.status.state === "connected") {
        this.set({
          ...this.status,
          cursor,
          lastPollAt: Date.now(),
          error: null,
        });
      }
    } catch (error) {
      this.failures++;
      if (this.status.state !== "connected") return;
      if (this.failures >= (this.options.maxFailures ?? 5)) {
        this.stop();
        this.set({ state: "error", message: this.message(error) });
        return;
      }
      this.set({ ...this.status, cursor, error: this.message(error) });
    }
  }

  /** Fetch one race on demand (e.g. re-pull a race the operator asks for). */
  async fetchRace(raceNumber: number): Promise<RaceResponse | null> {
    return this.timer.raceIfPresent(
      { kind: "race", raceNumber },
      FULL_RACE_OPTIONS,
    );
  }

  disconnect() {
    this.stop();
    this.set({ state: "idle" });
  }
}

/** Highest captured race number from the timer's current meet (same day). */
export function resumeCursor(
  captures: Array<{ race: { raceNumber: number; date: TimerDate | null } }>,
  meetDate: TimerDate | null,
): number {
  if (!meetDate) return 0;
  let cursor = 0;
  for (const c of captures) {
    const d = c.race.date;
    if (
      d &&
      d.year === meetDate.year &&
      d.month === meetDate.month &&
      d.day === meetDate.day
    ) {
      cursor = Math.max(cursor, c.race.raceNumber);
    }
  }
  return cursor;
}
