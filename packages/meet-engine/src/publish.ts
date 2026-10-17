/**
 * Publishing verified heats to the Lane4 results service. The deck machine
 * never needs a connection to run the meet: every verified heat is queued,
 * and the queue drains whenever the service is reachable. Each publication
 * carries an idempotency key so a retried POST can't double-count a heat.
 */
import { touch } from "./create";
import { indexMeet } from "./labels";
import {
  type DiveCard,
  heatKey,
  type Meet,
  type MeetEvent,
  type ResultStatus,
} from "./model";
import { eventStandings } from "./standings";

export const PUBLICATION_SCHEMA = "lane4.heat-results/v1";

/** Prelims and finals share an event number; keep their keys apart. */
const ROUND_KEY: Record<MeetEvent["round"], string> = {
  timed_final: "",
  prelim: "P",
  final: "F",
};

export type PublishedAthlete = {
  firstName: string;
  lastName: string;
  gender?: "male" | "female";
  dateOfBirth?: string;
  usaMemberId?: string;
};

export type PublishedLane = {
  lane: number;
  teamCode: string;
  athlete?: PublishedAthlete;
  relay?: { letter: string; legs: PublishedAthlete[] };
  status: ResultStatus;
  timeMs: number | null;
  splitsMs: number[];
  /** Overall event place at the time of publishing. */
  place: number | null;
  exhibition: boolean;
  dqCode?: string;
  /** Diving: the scored dive card. */
  dive?: DiveCard;
};

export type HeatPublication = {
  schema: typeof PUBLICATION_SCHEMA;
  idempotencyKey: string;
  meet: {
    id: string;
    name: string;
    startDate?: string;
    course: Meet["course"];
    location?: string;
  };
  event: {
    number: number;
    distance: number;
    stroke: string;
    gender: string;
    ageGroup?: string;
    isRelay: boolean;
    kind: MeetEvent["kind"];
    round: MeetEvent["round"];
  };
  heat: number;
  revision: number;
  verifiedAt: string;
  lanes: PublishedLane[];
};

export function buildHeatPublication(
  meet: Meet,
  eventId: string,
  heat: number,
): HeatPublication {
  const record = meet.heatRecords[heatKey(eventId, heat)];
  if (!record) throw new Error("Only verified heats can be published.");
  const index = indexMeet(meet);
  const event = index.event(eventId)!;
  const places = new Map(
    eventStandings(meet, eventId).map((r) => [r.entry.id, r.place]),
  );
  const person = (id: string): PublishedAthlete => {
    const a = index.athlete(id);
    return {
      firstName: a?.firstName ?? "",
      lastName: a?.lastName ?? "",
      gender: a?.gender,
      dateOfBirth: a?.dateOfBirth,
      usaMemberId: a?.usaMemberId,
    };
  };
  const lanes: PublishedLane[] = meet.results
    .filter((r) => r.eventId === eventId && r.heat === heat)
    .sort((a, b) => a.lane - b.lane)
    .map((r) => {
      const entry = index.entry(r.entryId)!;
      return {
        lane: r.lane,
        teamCode: entry.teamCode,
        ...(entry.relay
          ? {
              relay: {
                letter: entry.relay.letter,
                legs: entry.relay.legAthleteIds.map(person),
              },
            }
          : { athlete: person(entry.athleteId!) }),
        status: r.status,
        timeMs: r.timeMs,
        splitsMs: r.splitsMs,
        place: places.get(r.entryId) ?? null,
        exhibition: entry.exhibition,
        dqCode: r.dqCode,
        ...(r.dive ? { dive: r.dive } : {}),
      };
    });
  return {
    schema: PUBLICATION_SCHEMA,
    idempotencyKey: `${meet.id}:${event.number}${ROUND_KEY[event.round]}:${heat}:r${record.revision}`,
    meet: {
      id: meet.id,
      name: meet.name,
      startDate: meet.startDate,
      course: meet.course,
      location: meet.location,
    },
    event: {
      number: event.number,
      distance: event.distance,
      stroke: event.stroke,
      gender: event.gender,
      ageGroup: event.ageGroup,
      isRelay: event.isRelay,
      kind: event.kind,
      round: event.round,
    },
    heat,
    revision: record.revision,
    verifiedAt: record.verifiedAt,
    lanes,
  };
}

export type QueuedHeat = { eventId: string; heat: number; key: string };

/** Verified heats not yet published, in meet order. */
export function publishQueue(meet: Meet): QueuedHeat[] {
  const order = new Map(meet.events.map((e, i) => [e.id, i]));
  return Object.entries(meet.heatRecords)
    .filter(([, r]) => r.publish.state !== "published")
    .map(([key]) => {
      const at = key.lastIndexOf("#");
      return {
        key,
        eventId: key.slice(0, at),
        heat: Number(key.slice(at + 1)),
      };
    })
    .filter((q) => order.has(q.eventId))
    .sort(
      (a, b) =>
        order.get(a.eventId)! - order.get(b.eventId)! || a.heat - b.heat,
    );
}

export function markPublished(
  meet: Meet,
  key: string,
  revision: number,
  now: Date = new Date(),
): Meet {
  const record = meet.heatRecords[key];
  // A heat re-verified while its POST was in flight stays queued.
  if (!record || record.revision !== revision) return meet;
  return touch(
    {
      ...meet,
      heatRecords: {
        ...meet.heatRecords,
        [key]: {
          ...record,
          publish: {
            state: "published",
            attempts: record.publish.attempts + 1,
            lastAttemptAt: now.toISOString(),
            publishedRevision: revision,
          },
        },
      },
    },
    now,
  );
}

export function markPublishFailed(
  meet: Meet,
  key: string,
  error: string,
  now: Date = new Date(),
): Meet {
  const record = meet.heatRecords[key];
  if (!record) return meet;
  return touch(
    {
      ...meet,
      heatRecords: {
        ...meet.heatRecords,
        [key]: {
          ...record,
          publish: {
            ...record.publish,
            state: "failed",
            attempts: record.publish.attempts + 1,
            lastAttemptAt: now.toISOString(),
            lastError: error,
          },
        },
      },
    },
    now,
  );
}

/** Seconds to wait before retrying a failed heat: 5 s doubling to 5 min. */
export function retryDelayMs(attempts: number): number {
  return Math.min(5 * 60_000, 5_000 * 2 ** Math.max(0, attempts - 1));
}
