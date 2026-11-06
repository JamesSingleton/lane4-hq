import {
  type DiagnosticProgress,
  type DiagnosticReport,
  diagnosticFilename,
  type FindingStatus,
  MANUAL_CHECKS,
} from "@lane4hq/timing-cts/diagnostics";
import { Button } from "@lane4hq/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@lane4hq/ui/components/dialog";
import { Progress } from "@lane4hq/ui/components/progress";
import {
  CircleCheck,
  CircleX,
  Download,
  Info,
  Stethoscope,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import {
  errorMessage,
  type SerialPortInfo,
  saveExportFile,
} from "../lib/native";
import { type TimingSource, useTiming } from "../state/timing-context";

const STATUS: Record<
  FindingStatus,
  { icon: typeof Info; className: string; label: string }
> = {
  pass: {
    icon: CircleCheck,
    className: "text-emerald-600 dark:text-emerald-400",
    label: "Passed",
  },
  info: { icon: Info, className: "text-muted-foreground", label: "Note" },
  warn: {
    icon: TriangleAlert,
    className: "text-amber-600 dark:text-amber-400",
    label: "Check this",
  },
  fail: { icon: CircleX, className: "text-destructive", label: "Problem" },
};

const RELEASE =
  (import.meta as { env?: { VITE_LANE4_RELEASE?: string } }).env
    ?.VITE_LANE4_RELEASE ?? "dev";

const HEADLINE: Record<FindingStatus, string> = {
  pass: "Everything checked out.",
  info: "No problems, but some checks couldn't run.",
  warn: "It works, with some things to check.",
  fail: "Something needs fixing before you rely on this timer.",
};

export function TimerTestDialog({
  target,
  port,
}: {
  target: TimingSource;
  port: SerialPortInfo | undefined;
}) {
  const {
    actions: { testTimer },
  } = useTiming();
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState<DiagnosticProgress | null>(null);
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const running = progress !== null;

  async function run() {
    setError(null);
    setReport(null);
    setSaved(null);
    setProgress({ stage: "Starting", step: 0, steps: 1 });
    try {
      setReport(
        await testTimer(target, {
          onProgress: setProgress,
          environment: {
            app: RELEASE,
            system: navigator.userAgent,
            source: target.kind,
            port: port?.label ?? null,
            adapterVendorId: port?.vid ?? null,
            adapterProductId: port?.pid ?? null,
            adapterMaker: port?.manufacturer ?? null,
          },
        }),
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setProgress(null);
    }
  }

  async function save(finished: DiagnosticReport) {
    setError(null);
    const filename = diagnosticFilename(finished);
    try {
      const bytes = new TextEncoder().encode(JSON.stringify(finished, null, 2));
      if (await saveExportFile({ filename, bytes })) setSaved(filename);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <Stethoscope />
        Test this timer
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!running) setOpen(next);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Test this timer</DialogTitle>
            <DialogDescription>
              Checks how this console talks to Lane4 and saves a report you can
              send to support. Run it between races. It only reads from the
              console and takes about a minute, or longer with hundreds of
              stored races. Polling pauses while it runs.
            </DialogDescription>
          </DialogHeader>

          {running ? (
            <div className="flex flex-col gap-2" role="status">
              <p className="text-sm">{progress.stage}…</p>
              <Progress value={(progress.step / progress.steps) * 100} />
            </div>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          {report ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium">{HEADLINE[report.status]}</p>
              <ul className="flex flex-col gap-2.5">
                {report.findings.map((finding) => {
                  const {
                    icon: Icon,
                    className,
                    label,
                  } = STATUS[finding.status];
                  return (
                    <li key={finding.id} className="flex gap-2 text-sm">
                      <Icon
                        aria-label={label}
                        className={`mt-0.5 size-4 shrink-0 ${className}`}
                      />
                      <div>
                        <p className="font-medium">{finding.title}</p>
                        <p className="text-muted-foreground">
                          {finding.detail}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="rounded-lg border p-3 text-sm">
                <p className="font-medium">
                  Still needs a person at the console
                </p>
                <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                  {MANUAL_CHECKS.map((check) => (
                    <li key={check}>{check}</li>
                  ))}
                </ul>
              </div>
              {saved ? (
                <p className="text-sm text-muted-foreground">Saved {saved}</p>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            {report ? (
              <Button variant="outline" onClick={() => void save(report)}>
                <Download />
                Save report
              </Button>
            ) : null}
            <Button onClick={() => void run()} disabled={running}>
              {report ? "Test again" : "Start test"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
