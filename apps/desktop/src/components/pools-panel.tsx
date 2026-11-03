import { eventTitle } from "@lane4hq/meet-engine/labels";
import {
  assignEventToPool,
  eventPoolId,
  localPool,
  setLocalPool,
  splitByGender,
  unsplitMeet,
} from "@lane4hq/meet-engine/pools";
import { Button } from "@lane4hq/ui/components/button";
import { Label } from "@lane4hq/ui/components/label";
import { Split } from "lucide-react";
import { confirmDialog } from "../lib/native";
import { useMeet } from "../state/meet-context";
import { ChoiceSelect } from "./choice-select";
import { Section } from "./section";

/**
 * Two pools, one meet: split the meet by gender, pick which pool this
 * computer runs, and place mixed events and diving by hand. The meet is then
 * copied to the other computer with a backup file.
 */
export function PoolsPanel({
  onError,
}: {
  onError: (message: string) => void;
}) {
  const {
    state: { meet },
    actions: { update },
  } = useMeet();
  const split = meet.split;

  function act(fn: Parameters<typeof update>[0]) {
    try {
      update(fn);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }

  if (!split) {
    return (
      <Section
        title="Pools"
        description="Running girls and boys in two pools on two computers? Split the meet here once entries are in, then copy it to the other computer with a meet backup. Each computer runs its own pool's events, and you merge them at the end."
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={() => act((m) => splitByGender(m))}
          >
            <Split />
            Split into girls and boys pools
          </Button>
        }
      >
        <span />
      </Section>
    );
  }

  const pools = split.pools.map((p) => ({ value: p.id, label: p.name }));
  const movable = meet.events.filter(
    (e) => e.round !== "final" && (e.gender === "mixed" || e.kind === "dive"),
  );

  return (
    <Section
      title="Pools"
      description={`This computer runs the ${localPool(meet)?.name ?? "?"}. The other pool's events are shown but can't be seeded, timed, or changed here. Copy the meet to the other computer with a meet backup, set it to its pool, and merge its backup on Export when both pools finish.`}
      action={
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void confirmDialog(
              "Run the whole meet in one pool on this computer again? Do this only if the other computer isn't running a pool.",
              { title: "Run in one pool?", okLabel: "Run in one pool" },
            ).then((yes) => {
              if (yes) act((m) => unsplitMeet(m));
            });
          }}
        >
          Run in one pool
        </Button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-6">
        <div className="flex flex-col gap-1.5 sm:col-span-3">
          <Label htmlFor="local-pool">This computer runs</Label>
          <ChoiceSelect
            id="local-pool"
            value={split.localPoolId}
            onValueChange={(poolId) => act((m) => setLocalPool(m, poolId))}
            items={pools}
          />
        </div>
      </div>
      {movable.length > 0 ? (
        <div className="flex flex-col divide-y rounded-xl border">
          {movable.map((event) => (
            <div key={event.id} className="flex items-center gap-3 px-4 py-2">
              <span className="w-8 font-mono text-xs text-muted-foreground tabular-nums">
                {event.number}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">
                {eventTitle(event)}
              </span>
              <ChoiceSelect
                className="w-40"
                value={eventPoolId(meet, event.id) ?? pools[0]!.value}
                onValueChange={(poolId) =>
                  act((m) => assignEventToPool(m, event.id, poolId))
                }
                items={pools}
              />
            </div>
          ))}
        </div>
      ) : null}
    </Section>
  );
}
