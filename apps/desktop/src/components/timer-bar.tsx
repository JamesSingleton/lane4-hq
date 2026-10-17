import { Button } from "@lane4hq/ui/components/button";
import { Input } from "@lane4hq/ui/components/input";
import {
  Pause,
  Play,
  Plug,
  RefreshCw,
  SkipForward,
  Unplug,
} from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import {
  errorMessage,
  isTauri,
  type SerialPortInfo,
  serial,
} from "../lib/native";
import { useMeet } from "../state/meet-context";
import { lastPort, useTiming } from "../state/timing-context";
import { NativeSelect } from "./native-select";

const SIMULATOR = "__simulator__";

export function TimerBar() {
  const {
    state: { meet },
  } = useMeet();
  const {
    state: { status, source },
    actions,
  } = useTiming();
  const [ports, setPorts] = useState<SerialPortInfo[]>([]);
  const [choice, setChoice] = useState<string>(() => lastPort() ?? SIMULATOR);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function refreshPorts() {
    if (!isTauri()) return;
    serial.listPorts().then(
      (list) => {
        setPorts(list);
        setChoice((c) =>
          c === SIMULATOR || list.some((p) => p.name === c)
            ? c
            : (list[0]?.name ?? SIMULATOR),
        );
      },
      (e) => setError(errorMessage(e)),
    );
  }
  useEffect(refreshPorts, []);

  function connect() {
    setError(null);
    startTransition(async () => {
      try {
        await actions.connect(
          choice === SIMULATOR
            ? { kind: "simulator" }
            : { kind: "serial", port: choice },
        );
      } catch (e) {
        setError(errorMessage(e));
      }
    });
  }

  const connected = status.state === "connected";
  const pool = connected ? status.identity.pool : null;
  const laneMismatch = pool && pool.lanesInPool !== meet.poolLanes;

  return (
    <div className="flex flex-col gap-2 border-b px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        {connected || status.state === "connecting" ? (
          <>
            <span className="text-sm font-medium">
              {source?.kind === "simulator"
                ? "Simulated console"
                : source?.kind === "serial"
                  ? source.port
                  : ""}
            </span>
            {connected ? (
              <span className="text-sm text-muted-foreground">
                {status.identity.version}
                {status.identity.meetDate
                  ? ` · timer meet ${status.identity.meetDate.year}-${String(status.identity.meetDate.month).padStart(2, "0")}-${String(status.identity.meetDate.day).padStart(2, "0")}`
                  : ""}
                {pool ? ` · ${pool.lanesInPool} lanes` : ""}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">Connecting…</span>
            )}
            <div className="ml-auto flex items-center gap-1.5">
              {connected ? (
                <>
                  <CursorInput
                    cursor={status.cursor}
                    onChange={actions.setCursor}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void actions.skipToLatest()}
                    title="Ignore races already on the console"
                  >
                    <SkipForward />
                    Only new races
                  </Button>
                  {status.polling ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={actions.stopPolling}
                    >
                      <Pause />
                      Pause
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={actions.startPolling}
                    >
                      <Play />
                      Resume
                    </Button>
                  )}
                </>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                onClick={() => void actions.disconnect()}
              >
                <Unplug />
                Disconnect
              </Button>
            </div>
          </>
        ) : (
          <>
            <NativeSelect
              aria-label="Timing console"
              className="w-80"
              value={choice}
              onChange={(e) => setChoice(e.currentTarget.value)}
            >
              {ports.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.label}
                </option>
              ))}
              <option value={SIMULATOR}>
                Simulated CTS console (no hardware)
              </option>
            </NativeSelect>
            {isTauri() ? (
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Refresh ports"
                onClick={refreshPorts}
              >
                <RefreshCw />
              </Button>
            ) : null}
            <Button size="sm" onClick={connect} disabled={isPending}>
              <Plug />
              {isPending ? "Connecting…" : "Connect"}
            </Button>
            <span className="text-xs text-muted-foreground">
              Colorado Time Systems System 6, System 5, 4000A, or Gen7 · top
              RS232 port (COM 1) · 9600 baud
            </span>
          </>
        )}
      </div>
      {laneMismatch ? (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          The console is set for {pool.lanesInPool} lanes but this meet seeds{" "}
          {meet.poolLanes}.
        </p>
      ) : null}
      {connected && status.error ? (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Last poll failed: {status.error} Retrying…
        </p>
      ) : null}
      {status.state === "error" || error ? (
        <p className="text-xs text-destructive">
          {status.state === "error" ? status.message : error}
        </p>
      ) : null}
    </div>
  );
}

function CursorInput({
  cursor,
  onChange,
}: {
  cursor: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <label htmlFor="timer-cursor">Last race pulled</label>
      <Input
        id="timer-cursor"
        key={cursor}
        type="number"
        min={0}
        defaultValue={cursor}
        className="h-7 w-20 font-mono"
        onBlur={(e) => {
          const n = Number(e.currentTarget.value);
          if (Number.isInteger(n) && n >= 0 && n !== cursor) onChange(n);
        }}
      />
    </div>
  );
}
