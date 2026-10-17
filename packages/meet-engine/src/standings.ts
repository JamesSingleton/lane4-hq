import { toHundredths } from "./labels";
import { type Entry, heatKey, type LaneResult, type Meet } from "./model";
export type StandingRow = {
  entry: Entry;
  result: LaneResult;
  /** Overall place in the event; null for DQ/NS/DNF and exhibition swims. */
  place: number | null;
  points: number;
};

const STATUS_ORDER: Record<LaneResult["status"], number> = {
  ok: 0,
  dq: 1,
  dnf: 2,
  ns: 3,
};

/**
 * Overall results for an event. Timed finals and prelims rank every heat
 * together; places use hundredths, so equal swims tie and split the points.
 * Finals place by final: the A final takes places 1…lanes, the B final the
 * next block, whatever the times. Prelims place but don't score. Diving
 * ranks by total points, highest first.
 */
export function eventStandings(meet: Meet, eventId: string): StandingRow[] {
  const event = meet.events.find((e) => e.id === eventId);
  const table =
    event?.round === "prelim"
      ? []
      : event?.isRelay
        ? meet.scoring.relay
        : meet.scoring.individual;
  const isDive = event?.kind === "dive";
  const isFinal = event?.round === "final";
  const entries = new Map(meet.entries.map((e) => [e.id, e]));
  const results = meet.results.filter(
    (r) => r.eventId === eventId && entries.has(r.entryId),
  );
  const topHeat = Math.max(
    event?.finalHeats ?? 1,
    ...results.map((r) => r.heat),
  );
  /** Finals: 0 for the A final, 1 for B, …; one group otherwise. */
  const group = (r: LaneResult) => (isFinal ? topHeat - r.heat : 0);
  /** Lower is better; equal marks tie. */
  const mark = (r: LaneResult) =>
    isDive ? -Math.round((r.dive?.total ?? 0) * 100) : toHundredths(r.timeMs!);
  const placed = (row: { result: LaneResult; entry: Entry }) =>
    row.result.status === "ok" && !row.entry.exhibition;

  const rows = results
    .map((result) => ({ result, entry: entries.get(result.entryId)! }))
    .sort((a, b) => {
      const status =
        STATUS_ORDER[a.result.status] - STATUS_ORDER[b.result.status];
      if (status !== 0) return status;
      if (a.result.status !== "ok")
        return a.result.heat - b.result.heat || a.result.lane - b.result.lane;
      const byGroup = group(a.result) - group(b.result);
      if (byGroup !== 0) return byGroup;
      if (a.entry.exhibition !== b.entry.exhibition)
        return a.entry.exhibition ? 1 : -1;
      return (
        mark(a.result) - mark(b.result) ||
        (isDive ? 0 : a.result.timeMs! - b.result.timeMs!)
      );
    });

  const out: StandingRow[] = [];
  let place = 0;
  let currentGroup = -1;
  let i = 0;
  while (i < rows.length) {
    const row = rows[i]!;
    if (!placed(row)) {
      out.push({ ...row, place: null, points: 0 });
      i++;
      continue;
    }
    const g = group(row.result);
    if (g !== currentGroup) {
      currentGroup = g;
      place = Math.max(place, g * meet.poolLanes);
    }
    const value = mark(row.result);
    let j = i;
    while (
      j < rows.length &&
      placed(rows[j]!) &&
      group(rows[j]!.result) === g &&
      mark(rows[j]!.result) === value
    ) {
      j++;
    }
    const tied = j - i;
    const first = place + 1;
    let pool = 0;
    for (let p = first; p < first + tied; p++) pool += table[p - 1] ?? 0;
    const points = Math.round((pool / tied) * 100) / 100;
    for (let k = i; k < j; k++) out.push({ ...rows[k]!, place: first, points });
    place += tied;
    i = j;
  }
  return out;
}

export type TeamScore = { teamCode: string; points: number };

export function teamScores(meet: Meet): TeamScore[] {
  const totals = new Map<string, number>(meet.teams.map((t) => [t.code, 0]));
  for (const event of meet.events) {
    for (const row of eventStandings(meet, event.id)) {
      if (!row.points) continue;
      totals.set(
        row.entry.teamCode,
        (totals.get(row.entry.teamCode) ?? 0) + row.points,
      );
    }
  }
  return [...totals]
    .map(([teamCode, points]) => ({
      teamCode,
      points: Math.round(points * 100) / 100,
    }))
    .sort(
      (a, b) => b.points - a.points || a.teamCode.localeCompare(b.teamCode),
    );
}

export type EventProgress = {
  heats: number;
  verified: number;
  state: "unseeded" | "seeded" | "in-progress" | "complete";
};

export function eventProgress(meet: Meet, eventId: string): EventProgress {
  const heats = meet.heats.filter(
    (h) => h.eventId === eventId && h.lanes.length > 0,
  );
  const verified = heats.filter(
    (h) => meet.heatRecords[heatKey(eventId, h.number)],
  ).length;
  const state =
    heats.length === 0
      ? "unseeded"
      : verified === 0
        ? "seeded"
        : verified < heats.length
          ? "in-progress"
          : "complete";
  return { heats: heats.length, verified, state };
}
