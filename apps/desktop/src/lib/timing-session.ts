import {
  CtsTimer,
  FULL_RACE_OPTIONS,
  type RaceResponse,
  type TimerTransport,
} from "@lane4hq/timing-cts/client";
import {
  type DiagnosticOptions,
  type DiagnosticReport,
  diagnoseTimer,
} from "@lane4hq/timing-cts/diagnostics";
import type {
  DecodeOptions,
  TimerDate,
  TimerRace,
} from "@lane4hq/timing-cts/race";
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

/** The race the cursor sits on, as the timer reported it. */
export type RaceAnchor = Pick<TimerRace, "raceNumber" | "date">;

/**
 * One connection to a CTS console. Polls for new races by race number
 * (`S…R##`), which every console including Gen7 supports, starting after
 * `cursor`. When `cursor + 1` isn't there it checks the timer is still on the
 * same meet, then walks the race pointer in case numbering has a gap.
 */
export class TimingSession {
  private readonly timer: CtsTimer;
  private status: SessionStatus = { state: "idle" };
  private handle: unknown = null;
  private failures = 0;
  private busy: Promise<void> | null = null;
  private anchor: RaceAnchor | null = null;

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
      this.anchor = null;
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

  /** The newest race on the timer, or null when its meet has none. */
  async latestRace(): Promise<TimerRace | null> {
    await this.busy;
    return this.timer.newestRace();
  }

  /** Move the cursor. An `anchor` lets polling notice the race has gone. */
  setCursor(cursor: number, anchor: RaceAnchor | null = null) {
    this.anchor = anchor;
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
        let race = await this.pull(cursor + 1);
        if (!race) {
          if (await this.meetChanged()) cursor = 0;
          const next = await this.timer.nextRaceAfter(cursor);
          if (next === null) break;
          race = await this.pull(next);
        }
        if (!race) break;
        // Only after it's stored: a failure here pulls the same race again.
        await this.options.onRace(race, this.status.identity);
        cursor = race.race.raceNumber;
        this.anchor = race.race;
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

  private pull(raceNumber: number): Promise<RaceResponse | null> {
    return this.timer.raceIfPresent(
      { kind: "race", raceNumber },
      FULL_RACE_OPTIONS,
    );
  }

  /**
   * True when the anchor race is gone or is a different race: the timer was
   * power-cycled into a new meet, or discarded the race. Pulling the meet
   * again is safe, because captures are matched by race number and date.
   */
  private async meetChanged(): Promise<boolean> {
    const anchor = this.anchor;
    if (!anchor) return false;
    const same = await this.timer.raceIfPresent(
      { kind: "race", raceNumber: anchor.raceNumber },
      {},
    );
    if (
      same &&
      JSON.stringify(same.race.date) === JSON.stringify(anchor.date)
    ) {
      return false;
    }
    this.anchor = null;
    const meetDate = await this.timer.meetDate();
    if (this.status.state === "connected") {
      const identity = { ...this.status.identity, meetDate };
      this.set({ ...this.status, identity });
    }
    return true;
  }

  /** Test the console. Polling pauses, since the test moves the pointers. */
  async diagnose(options: DiagnosticOptions): Promise<DiagnosticReport> {
    const wasPolling = this.status.state === "connected" && this.status.polling;
    this.stop();
    await this.busy;
    try {
      return await diagnoseTimer(this.options.transport, options);
    } finally {
      if (wasPolling) this.start();
    }
  }

  /** Fetch one race on demand (e.g. re-pull a race the operator asks for). */
  fetchRace(raceNumber: number): Promise<RaceResponse | null> {
    return this.pull(raceNumber);
  }

  disconnect() {
    this.stop();
    this.set({ state: "idle" });
  }
}

function stamp(d: TimerDate): number {
  return Date.UTC(d.year, d.month - 1, d.day, d.hours, d.minutes, d.seconds);
}

/**
 * Where to resume on the timer's current meet: the highest race captured since
 * that meet began. A timer starts a new meet at every power-on, so two meets
 * can share a day, and race numbers may repeat between them.
 */
export function resumePoint(
  captures: Array<{ race: RaceAnchor }>,
  meetDate: TimerDate | null,
): { cursor: number; anchor: RaceAnchor | null } {
  let anchor: RaceAnchor | null = null;
  if (meetDate) {
    const began = stamp(meetDate);
    for (const { race } of captures) {
      if (!race.date || stamp(race.date) < began) continue;
      if (!anchor || race.raceNumber > anchor.raceNumber) anchor = race;
    }
  }
  return { cursor: anchor?.raceNumber ?? 0, anchor };
}
