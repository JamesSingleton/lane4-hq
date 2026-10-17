import { publishQueue } from "@lane4hq/meet-engine/publish";
import {
  createContext,
  type ReactNode,
  use,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import {
  errorMessage,
  isTauri,
  type PublishSettings,
  publishing,
} from "../lib/native";
import {
  applyPublishOutcomes,
  drainPublishQueue,
  OfflineError,
} from "../lib/publisher";
import { type HostTeam, useAccount } from "./account-context";
import { useMeet } from "./meet-context";

export type Connectivity = "unknown" | "online" | "offline" | "disabled";

type PublishContextValue = {
  state: {
    settings: PublishSettings | null;
    connectivity: Connectivity;
    lastError: string | null;
    draining: boolean;
  };
  actions: {
    chooseTeam: (team: HostTeam | null) => Promise<void>;
    setEnabled: (enabled: boolean) => Promise<void>;
    publishNow: () => Promise<void>;
  };
};

const PublishContext = createContext<PublishContextValue | null>(null);

/** How often to try the queue while there's something to send. */
const INTERVAL_MS = 15_000;

function ready(s: PublishSettings | null): s is PublishSettings {
  return Boolean(s?.enabled && s.account && s.teamId);
}

export function PublishProvider({ children }: { children: ReactNode }) {
  const {
    state: { meet },
    actions: { update },
    meta: { latest },
  } = useMeet();
  const {
    state: { settings },
    actions: { saveSettings: saveAccountSettings },
  } = useAccount();
  const [connectivity, setConnectivity] = useState<Connectivity>(() =>
    isTauri() ? "unknown" : "disabled",
  );
  const [lastError, setLastError] = useState<string | null>(null);
  const [draining, setDraining] = useState(false);
  const running = useRef(false);

  async function drain() {
    const current = settings;
    if (!ready(current)) {
      setConnectivity("disabled");
      return;
    }
    if (running.current) return;
    if (publishQueue(latest()).length === 0) return;
    running.current = true;
    setDraining(true);
    try {
      if (!navigator.onLine || !(await publishing.probe())) {
        setConnectivity("offline");
        return;
      }
      setConnectivity("online");
      const meetId = latest().id;
      const result = await drainPublishQueue(latest(), async (key, body) => {
        try {
          return await publishing.post(meetId, key, body);
        } catch (error) {
          const kind = (error as { kind?: string })?.kind;
          if (kind === "offline") throw new OfflineError(errorMessage(error));
          throw new Error(errorMessage(error));
        }
      });
      if (result.outcomes.length > 0)
        update((m) => applyPublishOutcomes(m, result.outcomes));
      if (result.offline) setConnectivity("offline");
      const failed = result.outcomes.find((o) => !o.ok);
      setLastError(
        failed && !failed.ok
          ? failed.error
          : result.throttled
            ? "Lane4 is pacing this machine's uploads; the rest will publish shortly."
            : (result.offline ?? result.notices[0] ?? null),
      );
    } catch (error) {
      setLastError(errorMessage(error));
    } finally {
      running.current = false;
      setDraining(false);
    }
  }

  const onTick = useEffectEvent(() => void drain());
  const pending = publishQueue(meet).length;
  const isReady = ready(settings);

  useEffect(() => {
    if (!isReady) return;
    onTick();
    const id = setInterval(onTick, INTERVAL_MS);
    window.addEventListener("online", onTick);
    return () => {
      clearInterval(id);
      window.removeEventListener("online", onTick);
    };
  }, [isReady, settings?.teamId]);

  // A newly verified heat goes out right away when we're online.
  useEffect(() => {
    if (pending > 0) onTick();
  }, [pending]);

  async function saveSettings(patch: Partial<PublishSettings>) {
    await saveAccountSettings(patch);
    setLastError(null);
    setConnectivity("unknown");
  }

  const value: PublishContextValue = {
    state: { settings, connectivity, lastError, draining },
    actions: {
      chooseTeam: (team) =>
        saveSettings({ teamId: team?.id ?? "", teamName: team?.name ?? "" }),
      setEnabled: (enabled) => saveSettings({ enabled }),
      publishNow: drain,
    },
  };
  return <PublishContext value={value}>{children}</PublishContext>;
}

export function usePublish(): PublishContextValue {
  const value = use(PublishContext);
  if (!value)
    throw new Error("usePublish must be used inside <PublishProvider>.");
  return value;
}
