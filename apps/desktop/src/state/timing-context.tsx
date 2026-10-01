import { addCapture, findCapture } from "@lane4hq/meet-engine/adjudicate";
import type { TimerTransport } from "@lane4hq/timing-cts/client";
import { toHex } from "@lane4hq/timing-cts/frame";
import {
  createSimulator,
  type TimerSimulator,
} from "@lane4hq/timing-cts/simulator";
import {
  createContext,
  type ReactNode,
  use,
  useEffect,
  useRef,
  useState,
} from "react";
import { errorMessage, isTauri, serial, serialTransport } from "../lib/native";
import {
  resumeCursor,
  type SessionStatus,
  TimingSession,
} from "../lib/timing-session";
import { useMeet } from "./meet-context";

export type TimingSource =
  | { kind: "serial"; port: string }
  | { kind: "simulator" };

type TimingContextValue = {
  state: {
    status: SessionStatus;
    source: TimingSource | null;
    /** Newest capture id pulled this session, for auto-selecting it. */
    lastCaptureId: string | null;
  };
  actions: {
    connect: (source: TimingSource) => Promise<void>;
    disconnect: () => Promise<void>;
    startPolling: () => void;
    stopPolling: () => void;
    pollNow: () => Promise<void>;
    setCursor: (cursor: number) => void;
    /** Skip everything already on the console; only pull races run from now on. */
    skipToLatest: () => Promise<void>;
  };
  meta: {
    /** The simulated console, when connected to it (dev, demos, training). */
    simulator: TimerSimulator | null;
  };
};

const TimingContext = createContext<TimingContextValue | null>(null);

const LAST_PORT_KEY = "lane4.timing.lastPort.v1";

export function lastPort(): string | null {
  try {
    return localStorage.getItem(LAST_PORT_KEY);
  } catch {
    return null;
  }
}

export function TimingProvider({ children }: { children: ReactNode }) {
  const {
    actions: { update },
    meta: { repository, latest },
  } = useMeet();
  const [status, setStatus] = useState<SessionStatus>({ state: "idle" });
  const [source, setSource] = useState<TimingSource | null>(null);
  const [lastCaptureId, setLastCaptureId] = useState<string | null>(null);
  const [simulator, setSimulator] = useState<TimerSimulator | null>(null);
  const session = useRef<TimingSession | null>(null);

  useEffect(
    () => () => {
      session.current?.disconnect();
      if (isTauri()) void serial.close().catch(() => {});
    },
    [],
  );

  async function connect(next: TimingSource) {
    await disconnect();
    let transport: TimerTransport;
    let sim: TimerSimulator | null = null;
    if (next.kind === "serial") {
      await serial.open(next.port);
      try {
        localStorage.setItem(LAST_PORT_KEY, next.port);
      } catch {
        // Not critical.
      }
      transport = serialTransport;
    } else {
      sim = createSimulator({
        pool: { lanesInPool: latest().poolLanes },
        latencyMs: 40,
      });
      transport = sim;
    }
    const created = new TimingSession({
      transport,
      onStatus: setStatus,
      describeError: errorMessage,
      async onRace(response, identity) {
        const meet = latest();
        if (findCapture(meet, response.race)) return;
        let captureId = "";
        update((m) => {
          const added = addCapture(m, {
            ...response,
            timerVersion: identity.version,
          });
          captureId = added.capture.id;
          return added.meet;
        });
        setLastCaptureId(captureId);
        await repository
          .appendCapture(
            meet.id,
            JSON.stringify({
              captureId,
              at: new Date().toISOString(),
              timer: identity.version,
              raceNumber: response.race.raceNumber,
              raw: toHex(response.raw),
            }),
          )
          .catch(() => {});
      },
    });
    session.current = created;
    setSimulator(sim);
    setSource(next);
    try {
      const identity = await created.connect();
      created.setCursor(resumeCursor(latest().captures, identity.meetDate));
      created.start();
    } catch (error) {
      if (next.kind === "serial") await serial.close().catch(() => {});
      throw error;
    }
  }

  async function disconnect() {
    session.current?.disconnect();
    session.current = null;
    setSimulator(null);
    setSource(null);
    setStatus({ state: "idle" });
    if (isTauri()) await serial.close().catch(() => {});
  }

  const value: TimingContextValue = {
    state: { status, source, lastCaptureId },
    actions: {
      connect,
      disconnect,
      startPolling: () => session.current?.start(),
      stopPolling: () => session.current?.stop(),
      pollNow: async () => {
        await session.current?.pollOnce();
      },
      setCursor: (cursor) => session.current?.setCursor(cursor),
      async skipToLatest() {
        const s = session.current;
        if (!s) return;
        const newest = await s.latestRaceNumber();
        if (newest != null) s.setCursor(newest);
      },
    },
    meta: { simulator },
  };
  return <TimingContext value={value}>{children}</TimingContext>;
}

export function useTiming(): TimingContextValue {
  const value = use(TimingContext);
  if (!value)
    throw new Error("useTiming must be used inside <TimingProvider>.");
  return value;
}
