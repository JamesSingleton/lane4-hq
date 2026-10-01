import type { Meet } from "@lane4hq/meet-engine/model";
import { useState } from "react";
import {
  createBrowserRepository,
  type MeetRepository,
} from "./lib/meet-repository";
import { isTauri } from "./lib/native";
import { tauriRepository } from "./lib/tauri-repository";
import { Inspector } from "./screens/inspector";
import { MeetWorkspace } from "./screens/meet-workspace";
import { MeetsHome } from "./screens/meets-home";
import { AccountProvider } from "./state/account-context";

type View =
  | { screen: "home" }
  | { screen: "inspector" }
  | { screen: "meet"; meet: Meet };

function defaultRepository(): MeetRepository {
  if (isTauri()) return tauriRepository;
  let storage: Storage | null = null;
  try {
    storage = window.localStorage;
  } catch {
    storage = null;
  }
  return createBrowserRepository(storage);
}

export function App() {
  return (
    <AccountProvider>
      <Screens />
    </AccountProvider>
  );
}

function Screens() {
  const [repository] = useState(defaultRepository);
  const [view, setView] = useState<View>({ screen: "home" });

  if (view.screen === "meet") {
    return (
      <MeetWorkspace
        key={view.meet.id}
        meet={view.meet}
        repository={repository}
        onClose={() => setView({ screen: "home" })}
      />
    );
  }
  if (view.screen === "inspector") {
    return <Inspector onBack={() => setView({ screen: "home" })} />;
  }
  return (
    <MeetsHome
      repository={repository}
      onOpen={(meet) => setView({ screen: "meet", meet })}
      onInspect={() => setView({ screen: "inspector" })}
    />
  );
}
