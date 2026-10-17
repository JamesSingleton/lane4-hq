import type { Meet } from "@lane4hq/meet-engine/model";
import { Badge } from "@lane4hq/ui/components/badge";
import { Button } from "@lane4hq/ui/components/button";
import { cn } from "@lane4hq/ui/lib/utils";
import {
  ArrowLeft,
  CloudOff,
  CloudUpload,
  ListOrdered,
  Settings2,
  Timer,
  Trophy,
  Upload,
} from "lucide-react";
import { useState } from "react";
import { formatDateRange } from "../lib/meet-labels";
import type { MeetRepository } from "../lib/meet-repository";
import { publishCounts } from "../lib/publisher";
import { MeetProvider, useMeet } from "../state/meet-context";
import { PublishProvider, usePublish } from "../state/publish-context";
import { TimingProvider, useTiming } from "../state/timing-context";
import { ExportScreen } from "./export-screen";
import { HeatsScreen } from "./heats-screen";
import { ResultsScreen } from "./results-screen";
import { RunScreen } from "./run-screen";
import { SetupScreen } from "./setup-screen";

type Section = "setup" | "heats" | "run" | "results" | "export";

const NAV: Array<{ id: Section; label: string; icon: React.ReactNode }> = [
  { id: "setup", label: "Setup", icon: <Settings2 /> },
  { id: "heats", label: "Heat sheet", icon: <ListOrdered /> },
  { id: "run", label: "Run meet", icon: <Timer /> },
  { id: "results", label: "Results", icon: <Trophy /> },
  { id: "export", label: "Export & publish", icon: <Upload /> },
];

export function MeetWorkspace({
  meet,
  repository,
  onClose,
}: {
  meet: Meet;
  repository: MeetRepository;
  onClose: () => void;
}) {
  return (
    <MeetProvider initial={meet} repository={repository} onClose={onClose}>
      <TimingProvider>
        <PublishProvider>
          <WorkspaceLayout
            initialSection={meet.heats.length > 0 ? "run" : "setup"}
          />
        </PublishProvider>
      </TimingProvider>
    </MeetProvider>
  );
}

function WorkspaceLayout({ initialSection }: { initialSection: Section }) {
  const [section, setSection] = useState<Section>(initialSection);
  const {
    state: { meet },
    actions: { close },
  } = useMeet();

  return (
    <div className="flex h-full">
      <nav className="flex w-52 shrink-0 flex-col gap-1 border-r bg-muted/30 p-2">
        <Button
          variant="ghost"
          size="sm"
          className="mb-1 justify-start text-muted-foreground"
          onClick={close}
        >
          <ArrowLeft />
          All meets
        </Button>
        <div className="mb-2 px-2">
          <p className="line-clamp-2 text-sm font-semibold leading-snug">
            {meet.name}
          </p>
          <p className="text-xs text-muted-foreground">
            {[
              formatDateRange(meet.startDate, meet.endDate),
              meet.course,
              `${meet.poolLanes} lanes`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-current={section === item.id ? "page" : undefined}
            onClick={() => setSection(item.id)}
            className={cn(
              "flex h-8 items-center gap-2 rounded-lg px-2 text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-4 [&_svg]:text-muted-foreground",
              section === item.id &&
                "bg-muted font-medium [&_svg]:text-foreground",
            )}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
        <div className="mt-auto flex flex-col gap-1.5 px-2 pb-1">
          <TimerPill onClick={() => setSection("run")} />
          <PublishPill onClick={() => setSection("export")} />
          <SavePill />
        </div>
      </nav>
      <main className="min-w-0 flex-1 overflow-auto">
        {section === "setup" ? (
          <SetupScreen onSeeded={() => setSection("heats")} />
        ) : null}
        {section === "heats" ? <HeatsScreen /> : null}
        {section === "run" ? <RunScreen /> : null}
        {section === "results" ? <ResultsScreen /> : null}
        {section === "export" ? <ExportScreen /> : null}
      </main>
    </div>
  );
}

function SavePill() {
  const {
    state: { saveState },
  } = useMeet();
  const text =
    saveState.status === "saving"
      ? "Saving…"
      : saveState.status === "error"
        ? `Not saved: ${saveState.message}`
        : "Saved on this computer";
  return (
    <p
      className={cn(
        "text-xs text-muted-foreground",
        saveState.status === "error" && "text-destructive",
      )}
      role="status"
    >
      {text}
    </p>
  );
}

function TimerPill({ onClick }: { onClick: () => void }) {
  const {
    state: { status, source },
  } = useTiming();
  const label =
    status.state === "connected"
      ? `${source?.kind === "simulator" ? "Simulator" : "Timer"} · race ${status.cursor}`
      : status.state === "connecting"
        ? "Connecting…"
        : status.state === "error"
          ? "Timer error"
          : "Timer not connected";
  return (
    <button type="button" onClick={onClick} className="w-fit">
      <Badge
        variant={
          status.state === "error"
            ? "destructive"
            : status.state === "connected"
              ? "secondary"
              : "outline"
        }
      >
        <span
          className={cn(
            "size-1.5 rounded-full bg-muted-foreground",
            status.state === "connected" &&
              (status.error ? "bg-amber-500" : "bg-emerald-500"),
            status.state === "error" && "bg-destructive",
          )}
        />
        {label}
      </Badge>
    </button>
  );
}

function PublishPill({ onClick }: { onClick: () => void }) {
  const {
    state: { meet },
  } = useMeet();
  const {
    state: { connectivity },
  } = usePublish();
  const counts = publishCounts(meet);
  const waiting = counts.pending + counts.failed;
  const offline = connectivity === "offline" || connectivity === "disabled";
  return (
    <button type="button" onClick={onClick} className="w-fit">
      <Badge variant="outline">
        {offline ? <CloudOff /> : <CloudUpload />}
        {connectivity === "disabled"
          ? "Publishing off"
          : waiting > 0
            ? `${waiting} heat${waiting === 1 ? "" : "s"} to publish`
            : "Results published"}
      </Badge>
    </button>
  );
}
