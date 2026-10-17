import {
  createContext,
  type ReactNode,
  use,
  useEffect,
  useEffectEvent,
  useState,
} from "react";
import {
  account,
  errorMessage,
  isTauri,
  type LaneMe,
  onSignInReturned,
  type PublishSettings,
  publishing,
} from "../lib/native";

export type SignInFlow =
  | { status: "waiting"; userCode: string; verificationUri: string }
  | { status: "denied" | "expired" };

export type HostTeam = LaneMe["teams"][number];

type AccountContextValue = {
  state: {
    /** Null until loaded, and always null outside the desktop app. */
    settings: PublishSettings | null;
    signIn: SignInFlow | null;
    /** Teams the signed-in user belongs to; null until loaded. */
    teams: HostTeam[] | null;
    error: string | null;
  };
  actions: {
    saveSettings: (patch: Partial<PublishSettings>) => Promise<void>;
    startSignIn: () => Promise<void>;
    reopenSignIn: () => Promise<void>;
    cancelSignIn: () => void;
    signOut: () => Promise<void>;
    refreshTeams: () => Promise<void>;
    openSignUp: () => Promise<void>;
  };
};

const AccountContext = createContext<AccountContextValue | null>(null);

/**
 * The Lane4 account for this computer: sign-in and teams. It lives above every
 * meet, because one sign-in serves all of them.
 */
export function AccountProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<PublishSettings | null>(null);
  const [signIn, setSignIn] = useState<SignInFlow | null>(null);
  const [pollMs, setPollMs] = useState(5_000);
  const [teams, setTeams] = useState<HostTeam[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setSettings(await publishing.getSettings());
  }

  async function refreshTeams() {
    try {
      setTeams((await account.me()).teams);
      setError(null);
    } catch (e) {
      setTeams(null);
      setError(errorMessage(e));
      await reload();
    }
  }

  async function saveSettings(patch: Partial<PublishSettings>) {
    const current = settings ?? (await publishing.getSettings());
    const next = { ...current, ...patch };
    await publishing.setSettings({
      teamId: next.teamId,
      teamName: next.teamName,
      enabled: next.enabled,
    });
    await reload();
  }

  useEffect(() => {
    if (!isTauri()) return;
    (async () => {
      const s = await publishing.getSettings();
      setSettings(s);
      if (s.account) await refreshTeams();
    })().catch((e) => setError(errorMessage(e)));
  }, []);

  const onPoll = useEffectEvent(async () => {
    try {
      const result = await account.pollSignIn();
      if (result.state === "approved") {
        setSignIn(null);
        setTeams(result.me.teams);
        await reload();
      } else if (result.state === "slowDown") {
        setPollMs((ms) => ms + 5_000);
      } else if (result.state !== "pending") {
        setSignIn({ status: result.state });
      }
    } catch (e) {
      // Offline for a moment: keep polling until the code expires.
      if ((e as { kind?: string })?.kind === "offline") return;
      setSignIn(null);
      setError(errorMessage(e));
    }
  });

  const waiting = signIn?.status === "waiting";
  useEffect(() => {
    if (!waiting) return;
    const id = setInterval(() => void onPoll(), pollMs);
    return () => clearInterval(id);
  }, [waiting, pollMs]);

  // The browser handed back: finish now instead of on the next tick.
  useEffect(() => {
    if (!waiting) return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    void onSignInReturned(() => void onPoll()).then((unlisten) => {
      if (cancelled) unlisten();
      else stop = unlisten;
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [waiting]);

  const value: AccountContextValue = {
    state: { settings, signIn, teams, error },
    actions: {
      saveSettings,
      async startSignIn() {
        setError(null);
        const start = await account.startSignIn();
        setPollMs(Math.max(1, start.intervalSecs) * 1000);
        setSignIn({
          status: "waiting",
          userCode: start.userCode,
          verificationUri: start.verificationUri,
        });
      },
      reopenSignIn: account.reopenSignIn,
      cancelSignIn() {
        setSignIn(null);
        void account.cancelSignIn();
      },
      async signOut() {
        await account.signOut();
        setTeams(null);
        await reload();
      },
      refreshTeams,
      openSignUp: account.openSignUp,
    },
  };
  return <AccountContext value={value}>{children}</AccountContext>;
}

export function useAccount(): AccountContextValue {
  const value = use(AccountContext);
  if (!value)
    throw new Error("useAccount must be used inside <AccountProvider>.");
  return value;
}
