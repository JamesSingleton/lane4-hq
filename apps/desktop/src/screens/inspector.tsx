import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@lane4hq/ui/components/alert";
import { Button } from "@lane4hq/ui/components/button";
import { cn } from "@lane4hq/ui/lib/utils";
import { ArrowLeft, FileUp, FolderOpen, TriangleAlert } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { MeetView } from "../components/meet-view";
import { RosterView } from "../components/roster-view";
import { Welcome } from "../components/welcome";
import { pickMeetFiles } from "../hooks/pick-files";
import {
  hasMeetFileExtension,
  type InspectedFiles,
  inspectFiles,
  type SourceFile,
} from "../lib/meet-file";
import {
  type DropState,
  isTauri,
  onFileDrop,
  readMeetFiles,
} from "../lib/native";

type ViewState =
  | { status: "empty" }
  | { status: "error"; message: string; filenames: string[] }
  | { status: "loaded"; inspected: InspectedFiles };

/** Milestone 1: open any Hy-Tek / SDIF file and see what Lane4 parses. */
export function Inspector({ onBack }: { onBack: () => void }) {
  const [view, setView] = useState<ViewState>({ status: "empty" });
  const [dropState, setDropState] = useState<DropState>("idle");
  const [isPending, startTransition] = useTransition();

  function load(readFiles: () => Promise<SourceFile[]>, filenames: string[]) {
    startTransition(async () => {
      try {
        const files = await readFiles();
        if (files.length === 0) return;
        const inspected = inspectFiles(files);
        startTransition(() => setView({ status: "loaded", inspected }));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        startTransition(() => setView({ status: "error", message, filenames }));
      }
    });
  }

  function loadPaths(paths: string[]) {
    const supported = paths.filter(hasMeetFileExtension);
    const targets = supported.length > 0 ? supported : paths;
    load(() => readMeetFiles(targets), targets);
  }

  function handleOpen() {
    load(() => pickMeetFiles("Open meet files"), []);
  }

  useEffect(() => {
    if (!isTauri()) return;
    return onFileDrop({ onDrop: loadPaths, onStateChange: setDropState });
  }, []);

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b px-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={onBack}
            aria-label="Back to meets"
          >
            <ArrowLeft />
          </Button>
          Meet file inspector
        </div>
        <Button size="sm" onClick={handleOpen} disabled={isPending}>
          <FolderOpen />
          {isPending ? "Opening…" : "Open files"}
        </Button>
      </header>

      <main
        className={cn(
          "relative min-h-0 flex-1 overflow-auto transition-opacity",
          isPending && "opacity-60",
        )}
      >
        {view.status === "empty" ? <Welcome onOpen={handleOpen} /> : null}
        {view.status === "error" ? (
          <div className="mx-auto max-w-2xl p-8">
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertTitle>
                Couldn’t read {view.filenames.join(", ") || "those files"}
              </AlertTitle>
              <AlertDescription>{view.message}</AlertDescription>
            </Alert>
          </div>
        ) : null}
        {view.status === "loaded" && view.inspected.kind === "meet" ? (
          <MeetView inspected={view.inspected} />
        ) : null}
        {view.status === "loaded" && view.inspected.kind === "roster" ? (
          <RosterView inspected={view.inspected} />
        ) : null}

        {dropState === "over" ? (
          <div className="pointer-events-none fixed inset-0 top-12 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-primary/40 px-16 py-12 text-center">
              <FileUp className="size-8 text-muted-foreground" />
              <p className="text-sm font-medium">Drop to inspect</p>
              <p className="text-xs text-muted-foreground">
                One ZIP pack, or companion files like EV3 + CL2
              </p>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
