import { eventLengths } from "@lane4hq/meet-engine/labels";
import type { Meet } from "@lane4hq/meet-engine/model";
import {
  seededRandom,
  simulateSwim,
  type TimerSimulator,
} from "@lane4hq/timing-cts/simulator";

/**
 * Have the simulated console swim a seeded heat: times near each entry's
 * seed, one occasional missed touchpad, and relay exchanges for relays.
 * Returns the console's race number.
 */
export function simulateHeat(
  sim: TimerSimulator,
  meet: Meet,
  target: { eventId: string; heat: number },
  seed = Date.now(),
  options: { titled?: boolean } = {},
): number {
  const event = meet.events.find((e) => e.id === target.eventId);
  const heat = meet.heats.find(
    (h) => h.eventId === target.eventId && h.number === target.heat,
  );
  if (!event || !heat) throw new Error("That heat isn't seeded.");
  const entries = new Map(meet.entries.map((e) => [e.id, e]));
  const lengths = eventLengths(event, meet.course);
  const random = seededRandom(seed);
  const fallback = event.distance * (event.isRelay ? 150 : 700);
  const lanes = heat.lanes.map(({ lane, entryId }) => {
    const swim = simulateSwim(
      lane,
      entries.get(entryId)?.seedTimeMs ?? fallback,
      lengths,
      random,
      event.isRelay ? 4 : 1,
    );
    // Roughly one lane in twenty misses the pad and needs its backup.
    return random() < 0.05 ? { ...swim, finalMs: null } : swim;
  });
  return sim.runRace({
    event: options.titled === false ? 0 : event.number,
    heat: options.titled === false ? 0 : heat.number,
    lengths,
    lanes,
  });
}
