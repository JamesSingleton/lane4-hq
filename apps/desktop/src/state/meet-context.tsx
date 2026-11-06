import type { Meet } from "@lane4hq/meet-engine/model";
import {
  createContext,
  type ReactNode,
  use,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  createSaveQueue,
  type MeetRepository,
  type SaveState,
} from "../lib/meet-repository";
import { confirmDialog } from "../lib/native";

type MeetContextValue = {
  state: { meet: Meet; saveState: SaveState };
  actions: {
    /** Apply a pure meet-engine update and persist it. */
    update: (fn: (meet: Meet) => Meet) => Meet;
    /** Resolves whether every change so far is on disk. */
    flush: () => Promise<boolean>;
    close: () => Promise<void>;
  };
  meta: {
    repository: MeetRepository;
    /** Always the newest document, for async work that outlives a render. */
    latest: () => Meet;
  };
};

const MeetContext = createContext<MeetContextValue | null>(null);

export function MeetProvider({
  initial,
  repository,
  onClose,
  children,
}: {
  initial: Meet;
  repository: MeetRepository;
  onClose: () => void;
  children: ReactNode;
}) {
  const [meet, setMeet] = useState(initial);
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const latest = useRef(initial);
  const [queue] = useState(() =>
    createSaveQueue((m) => repository.save(m), setSaveState),
  );

  useEffect(() => {
    const beforeUnload = () => void queue.flush();
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [queue]);

  const value: MeetContextValue = {
    state: { meet, saveState },
    actions: {
      update(fn) {
        const next = fn(latest.current);
        if (next !== latest.current) {
          latest.current = next;
          setMeet(next);
          void queue.push(next);
        }
        return next;
      },
      flush: () => queue.flush(),
      async close() {
        const saved = await queue.flush();
        if (!saved) {
          const leave = await confirmDialog(
            "Your latest changes couldn't be saved. If you leave now, they'll be lost. Races pulled from the timer are still in the timing journal.",
            {
              title: "Leave without saving?",
              okLabel: "Leave without saving",
              cancelLabel: "Stay on this meet",
            },
          );
          if (!leave) return;
          queue.discard();
        }
        onClose();
      },
    },
    meta: { repository, latest: () => latest.current },
  };
  return <MeetContext value={value}>{children}</MeetContext>;
}

export function useMeet(): MeetContextValue {
  const value = use(MeetContext);
  if (!value) throw new Error("useMeet must be used inside <MeetProvider>.");
  return value;
}
