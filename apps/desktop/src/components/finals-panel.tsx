import {
  createFinals,
  finalsEventFor,
  finalsPlan,
} from "@lane4hq/meet-engine/finals";
import { displayTime, indexMeet } from "@lane4hq/meet-engine/labels";
import type { MeetEvent } from "@lane4hq/meet-engine/model";
import { eventHasResults } from "@lane4hq/meet-engine/seeding";
import { eventProgress } from "@lane4hq/meet-engine/standings";
import { Button } from "@lane4hq/ui/components/button";
import { Trophy } from "lucide-react";
import { useState } from "react";
import { errorMessage } from "../lib/native";
import { useMeet } from "../state/meet-context";
import { NativeSelect } from "./native-select";

/** Build (or refill) the finals for a prelim event from its results. */
export function FinalsPanel({
  prelim,
  onBuilt,
}: {
  prelim: MeetEvent;
  onBuilt: (finalEventId: string) => void;
}) {
  const {
    state: { meet },
    actions: { update },
  } = useMeet();
  const existing = finalsEventFor(meet, prelim.id);
  const [finalHeats, setFinalHeats] = useState(existing?.finalHeats ?? 1);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const progress = eventProgress(meet, prelim.id);
  const index = indexMeet(meet);

  if (progress.heats === 0) return null;
  if (progress.state !== "complete") {
    return (
      <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
        Finals can be built once every prelim heat is verified (
        {progress.verified} of {progress.heats} so far).
      </p>
    );
  }

  const plan = finalsPlan(meet, prelim.id, { finalHeats, exclude: excluded });
  const locked = existing ? eventHasResults(meet, existing.id) : false;
  const openSpots = plan.capacity - plan.qualifiers.length;

  return (
    <section className="flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Trophy className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Finals</h2>
        <NativeSelect
          aria-label="Finals to swim"
          className="w-40"
          value={String(finalHeats)}
          disabled={locked}
          onChange={(e) => setFinalHeats(Number(e.currentTarget.value))}
        >
          <option value="1">A final</option>
          <option value="2">A and B finals</option>
          <option value="3">A, B, and C finals</option>
        </NativeSelect>
        <span className="text-sm text-muted-foreground">
          {plan.qualifiers.length} qualify
          {plan.alternates.length > 0
            ? ` · alternates ${plan.alternates
                .map((r) => index.entryLabel(r.entry))
                .join(", ")}`
            : ""}
        </span>
        <Button
          size="sm"
          className="ml-auto"
          disabled={locked || plan.swimOff.length > 0}
          onClick={() => {
            try {
              setError(null);
              const next = update(
                (m) =>
                  createFinals(m, prelim.id, {
                    finalHeats,
                    exclude: excluded,
                  }).meet,
              );
              onBuilt(finalsEventFor(next, prelim.id)!.id);
            } catch (e) {
              setError(errorMessage(e));
            }
          }}
        >
          {existing ? "Rebuild finals" : "Build finals"}
        </Button>
      </div>
      {existing && !locked ? (
        <p className="text-xs text-muted-foreground">
          Scratch a finalist in the finals heat sheet, then rebuild to move the
          next alternate up.
        </p>
      ) : null}
      {locked ? (
        <p className="text-xs text-muted-foreground">
          Finals have results, so the lineup is fixed.
        </p>
      ) : null}
      {plan.swimOff.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-lg bg-amber-500/10 p-3 text-sm">
          <p className="font-medium">
            Swim-off needed: {plan.swimOff.length} tied for {openSpots}{" "}
            {openSpots === 1 ? "spot" : "spots"} at{" "}
            {displayTime(plan.swimOff[0]!.result.timeMs)}.
          </p>
          <p className="text-muted-foreground">
            Run the swim-off, then mark who's out.
          </p>
          <ul className="flex flex-wrap gap-2">
            {plan.swimOff.map((row) => (
              <li key={row.entry.id}>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => setExcluded((x) => [...x, row.entry.id])}
                >
                  {index.entryLabel(row.entry)} is out
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {excluded.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Out after swim-off:{" "}
          {excluded
            .map((id) => {
              const entry = index.entry(id);
              return entry ? index.entryLabel(entry) : id;
            })
            .join(", ")}{" "}
          <button
            type="button"
            className="underline underline-offset-2"
            onClick={() => setExcluded([])}
          >
            Reset
          </button>
        </p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </section>
  );
}
