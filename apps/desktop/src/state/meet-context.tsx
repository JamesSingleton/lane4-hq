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

type MeetContextValue = {
  state: { meet: Meet; saveState: SaveState };
  actions: {
    /** Apply a pure meet-engine update and persist it. */
    update: (fn: (meet: Meet) => Meet) => Meet;
    /** Resolves once every change so far is on disk. */
    flush: () => Promise<void>;
    close: () => void;
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
      close() {
        void queue.flush().then(onClose);
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
