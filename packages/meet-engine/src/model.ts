/**
 * The meet database a deck machine holds. It is a plain JSON document so it
 * can be saved atomically, backed up, and diffed; every update is a pure
 * function that returns a new document.
 */
import type { EventGender } from "@lane4hq/swim-core/events";
import type { TimerRace } from "@lane4hq/timing-cts/race";

export const MEET_SCHEMA_VERSION = 1;

export type Course = "SCY" | "SCM" | "LCM";

export type MeetEvent = {
  id: string;
  number: number;
  distance: number;
  /** `free` … `im`, `free_relay`, `medley_relay`, or `dive`. */
  stroke: string;
  gender: EventGender;
  ageGroup?: string;
  isRelay: boolean;
  kind: "swim" | "dive";
  round: "timed_final" | "prelim" | "final";
  /** Finals: the prelim event swimmers qualified from. */
  prelimEventId?: string;
  /** Finals: how many finals are swum (1 = A, 2 = A/B, 3 = A/B/C). */
  finalHeats?: number;
  /** Diving: dives on each diver's card. NFHS: 6 (dual) or 11. */
  diveCount?: number;
  /** Diving: judges on the panel (3, 5, or 7). */
  diveJudges?: DiveJudges;
};

export type DiveJudges = 3 | 5 | 7;

export type DivePosition = "A" | "B" | "C" | "D";

export type Dive = {
  /** Dive number from the dive sheet, e.g. `103` or `5231`. */
  code: string;
  position: DivePosition;
  /** Degree of difficulty. */
  dd: number;
  /** One award per judge, 0–10 in half points. */
  awards: number[];
  /** Failed dive: scores zero whatever the awards. */
  failed?: boolean;
  /** Balk: two points off every award. */
  balk?: boolean;
};

export type DiveCard = {
  dives: Dive[];
  /** Sum of dive scores, to the hundredth. */
  total: number;
};

export type Team = {
  code: string;
  name: string;
  lsc?: string;
};

export type Athlete = {
  id: string;
  teamCode: string;
  firstName: string;
  lastName: string;
  gender?: "male" | "female";
  dateOfBirth?: string;
  usaMemberId?: string;
};

export type Entry = {
  id: string;
  eventId: string;
  teamCode: string;
  seedTimeMs: number | null;
  exhibition: boolean;
  scratched: boolean;
  /** Individual entries. */
  athleteId?: string;
  /** Relay entries: the team letter and legs in swim order. */
  relay?: { letter: string; legAthleteIds: string[] };
  /** Finals: the prelim entry this qualified from. */
  sourceEntryId?: string;
};

/** For diving, `lane` is the diver's place in the dive order. */
export type HeatLane = { lane: number; entryId: string };

export type Heat = {
  eventId: string;
  number: number;
  lanes: HeatLane[];
};

export type ResultStatus = "ok" | "dq" | "ns" | "dnf";

export type TimeSource = "pad" | "backup" | "manual";

export type LaneResult = {
  entryId: string;
  eventId: string;
  heat: number;
  lane: number;
  status: ResultStatus;
  timeMs: number | null;
  source: TimeSource;
  /** Cumulative splits, the last one being the final. */
  splitsMs: number[];
  backupMs: number | null;
  buttonsMs: number[];
  relayExchangesMs: number[];
  dqCode?: string;
  /** Diving events: the scored dive card (timeMs stays null). */
  dive?: DiveCard;
  /** Capture that supplied the timing, when it came from the console. */
  captureId?: string;
};

export type CaptureState = "new" | "verified" | "ignored";

/** A race pulled from the timing console, kept verbatim for audit. */
export type TimerCapture = {
  id: string;
  capturedAt: string;
  timerVersion?: string;
  /** Exact DATA bytes the console sent, so the race can be re-decoded. */
  rawHex: string;
  race: TimerRace;
  assignment: { eventId: string; heat: number } | null;
  state: CaptureState;
};

export type PublishState = "pending" | "published" | "failed";

export type HeatRecord = {
  verifiedAt: string;
  /** Bumped every time the heat is (re)verified; part of the publish key. */
  revision: number;
  publish: {
    state: PublishState;
    attempts: number;
    lastAttemptAt?: string;
    lastError?: string;
    publishedRevision?: number;
  };
};

export type ScoringPreset = "none" | "dual" | "invitational" | "championship";

export type Scoring = {
  preset: ScoringPreset;
  /** Points for places 1…n, individual events. */
  individual: number[];
  /** Points for places 1…n, relays. */
  relay: number[];
};

export type Meet = {
  schemaVersion: typeof MEET_SCHEMA_VERSION;
  id: string;
  name: string;
  startDate?: string;
  endDate?: string;
  course: Course;
  location?: string;
  /** Lanes used for seeding (6, 8, or 10). */
  poolLanes: number;
  events: MeetEvent[];
  teams: Team[];
  athletes: Athlete[];
  entries: Entry[];
  heats: Heat[];
  results: LaneResult[];
  captures: TimerCapture[];
  /** Keyed by `heatKey(eventId, heat)`. */
  heatRecords: Record<string, HeatRecord>;
  /**
   * Diving: each diver's dive sheet by entry id, filled in with awards as
   * the rounds go. Verified scores live in `results`.
   */
  diveSheets?: Record<string, Dive[]>;
  scoring: Scoring;
  createdAt: string;
  updatedAt: string;
};

export function heatKey(eventId: string, heat: number): string {
  return `${eventId}#${heat}`;
}

export type IdFactory = () => string;

/** RFC 4122 v4 id; `crypto.randomUUID` needs Safari 15.4, so build it by hand. */
export const randomId: IdFactory = () => {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
