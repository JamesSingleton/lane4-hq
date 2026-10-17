import {
  exportAllTeamResults,
  exportResultsCsv,
  exportTeamResults,
} from "@lane4hq/meet-engine/export";
import { eventTitle, indexMeet } from "@lane4hq/meet-engine/labels";
import { publishQueue } from "@lane4hq/meet-engine/publish";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@lane4hq/ui/components/alert";
import { Badge } from "@lane4hq/ui/components/badge";
import { Button } from "@lane4hq/ui/components/button";
import {
  Archive,
  CloudUpload,
  Download,
  FileSpreadsheet,
  TriangleAlert,
} from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { PublishSettingsPanel } from "../components/publish-settings";
import { Section } from "../components/section";
import {
  type ExportFile,
  errorMessage,
  isTauri,
  saveExportFile,
} from "../lib/native";
import { publishCounts } from "../lib/publisher";
import { useMeet } from "../state/meet-context";
import { usePublish } from "../state/publish-context";

export function ExportScreen() {
  const {
    state: { meet },
  } = useMeet();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();
  const verifiedHeats = Object.keys(meet.heatRecords).length;
  const teams = meet.teams.filter((t) =>
    meet.entries.some((e) => e.teamCode === t.code),
  );

  function save(build: () => ExportFile) {
    setMessage(null);
    startTransition(async () => {
      try {
        const file = build();
        if (await saveExportFile(file))
          setMessage({ ok: true, text: `Saved ${file.filename}` });
      } catch (e) {
        setMessage({ ok: false, text: errorMessage(e) });
      }
    });
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 p-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">
          Export & publish
        </h1>
        <p className="text-sm text-muted-foreground">
          {verifiedHeats} verified heat{verifiedHeats === 1 ? "" : "s"}. Only
          verified results are exported or published.
        </p>
      </header>

      {message ? (
        <Alert variant={message.ok ? "default" : "destructive"}>
          {message.ok ? <Download /> : <TriangleAlert />}
          <AlertTitle>
            {message.ok ? "Export saved" : "Export failed"}
          </AlertTitle>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      ) : null}

      <Section
        title="Results for teams"
        description="Each team gets a Hy-Tek HY3 results file in a ZIP, the format Team Manager, TeamUnify, SwimTopia, and Commit Swimming import. Send teams their own ZIP, or everything at once."
        action={
          <Button
            size="sm"
            onClick={() => save(() => exportAllTeamResults(meet))}
            disabled={isPending || teams.length === 0}
          >
            <Archive />
            All teams (ZIP)
          </Button>
        }
      >
        <div className="flex flex-col divide-y rounded-xl border">
          {teams.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              Import team entries in Setup first.
            </p>
          ) : null}
          {teams.map((team) => (
            <div
              key={team.code}
              className="flex items-center gap-3 px-4 py-2.5"
            >
              <span className="w-14 font-mono text-sm font-semibold">
                {team.code}
              </span>
              <span className="flex-1 truncate text-sm text-muted-foreground">
                {team.name}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() => save(() => exportTeamResults(meet, team.code))}
              >
                <Download />
                Results ZIP
              </Button>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => save(() => exportResultsCsv(meet))}
          >
            <FileSpreadsheet />
            All results (CSV)
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() =>
              save(() => ({
                filename: `${meet.name.replace(/[/\\?%*:|"<>]/g, " ").trim() || "Meet"}.lane4meet`,
                bytes: new TextEncoder().encode(JSON.stringify(meet)),
              }))
            }
          >
            <Archive />
            Meet backup (.lane4meet)
          </Button>
        </div>
      </Section>

      <PublishSection />
    </div>
  );
}

function PublishSection() {
  const {
    state: { meet },
  } = useMeet();
  const {
    state: { settings, connectivity, lastError, draining },
    actions,
  } = usePublish();
  const counts = publishCounts(meet);
  const queue = publishQueue(meet);
  const index = useMemo(() => indexMeet(meet), [meet]);

  if (!isTauri()) {
    return (
      <Section
        title="Publish results"
        description="Publishing runs in the desktop app only."
      >
        <span />
      </Section>
    );
  }

  return (
    <Section
      title="Publish results"
      description="Verified heats go to Lane4 automatically whenever this computer is online. Without WiFi they wait here, safely queued; nothing is lost."
      action={
        <Button
          size="sm"
          disabled={draining || !settings?.enabled || queue.length === 0}
          onClick={() => void actions.publishNow()}
        >
          <CloudUpload />
          {draining ? "Publishing…" : "Publish now"}
        </Button>
      }
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant={connectivity === "online" ? "default" : "outline"}>
          {connectivity === "online"
            ? "Online"
            : connectivity === "offline"
              ? "Offline: results queued"
              : connectivity === "disabled"
                ? "Publishing off"
                : "Checking connection…"}
        </Badge>
        <span className="text-muted-foreground">
          {counts.published} published · {counts.pending} waiting ·{" "}
          {counts.failed} failed
        </span>
      </div>
      {lastError ? (
        <p className="text-sm text-destructive">{lastError}</p>
      ) : null}

      {settings ? <PublishSettingsPanel /> : null}

      {queue.length > 0 ? (
        <ul className="flex flex-col gap-1 text-sm">
          {queue.slice(0, 12).map((q) => {
            const record = meet.heatRecords[q.key]!;
            const event = index.event(q.eventId);
            return (
              <li key={q.key} className="flex items-center gap-2">
                <Badge
                  variant={
                    record.publish.state === "failed"
                      ? "destructive"
                      : "outline"
                  }
                >
                  {record.publish.state === "failed"
                    ? `Failed ×${record.publish.attempts}`
                    : "Waiting"}
                </Badge>
                <span>
                  E{event?.number} H{q.heat} · {event ? eventTitle(event) : ""}
                </span>
                {record.publish.lastError ? (
                  <span className="truncate text-xs text-muted-foreground">
                    {record.publish.lastError}
                  </span>
                ) : null}
              </li>
            );
          })}
          {queue.length > 12 ? (
            <li className="text-xs text-muted-foreground">
              and {queue.length - 12} more
            </li>
          ) : null}
        </ul>
      ) : null}
    </Section>
  );
}
