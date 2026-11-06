/**
 * A read-only test of a real console. It answers what F397 leaves open (see
 * `docs/specs/cts-f397-verification.md`), and logs the bytes behind each answer
 * so a report sent from a pool can be read without the console.
 *
 * It sends no setups writes. It does move two pointers: the race pointer, which
 * polling doesn't rely on, and the meet pointer, which it puts back and checks.
 */
import {
  decodeVersion,
  FULL_RACE_OPTIONS,
  type TimerTransport,
} from "./client";
import {
  meetTimeAndDate,
  nextMeet,
  previousMeet,
  type RaceSelector,
  readSetups,
  type SetupsSubCommand,
  swimData,
  whoAreYou,
} from "./commands";
import { describeTimerError, replyErrorCode } from "./errors";
import { toHex } from "./frame";
import {
  DEFAULT_MAX_NUM_LANES,
  type DecodeOptions,
  decodeHeader,
  decodeRace,
  headerBytes,
  maxLanesFromHeader,
  type TimerDate,
  type TimerRaceHeader,
} from "./race";
import {
  decodePoolSetup,
  decodeSplitsSetup,
  type PoolSetup,
  type SplitsSetup,
} from "./setups";

export type FindingStatus = "pass" | "info" | "warn" | "fail";

export type Finding = {
  id: string;
  title: string;
  status: FindingStatus;
  detail: string;
};

/** One command and what came back, in the order they were sent. */
export type Exchange = {
  label: string;
  sent: string;
  ms: number;
  bytes?: number;
  /** Omitted for the pointer walk, which only needs race numbers. */
  reply?: string;
  timerError?: { code: number; message: string };
  noAnswer?: string;
};

export type RaceSample = {
  raceNumber: number;
  event: number;
  heat: number;
  raceLengths: number;
  lanesInPool: number;
  numTimesPerLane: number;
  numberOfButtons: number;
  bytes: number;
  ms: number;
  /** What the decoder made of the first lane; `null` if it couldn't. */
  layout: {
    splits: number;
    buttons: number;
    backup: boolean;
    exchanges: number;
  } | null;
  layoutWarning?: string;
  decodeError?: string;
};

export type DiagnosticReport = {
  kind: "lane4.timer-diagnostics";
  schemaVersion: 1;
  startedAt: string;
  finishedAt: string;
  environment: Record<string, string | number | null>;
  version: string | null;
  meetDate: TimerDate | null;
  headerBytes: number | null;
  maxNumLanes: number | null;
  pool: PoolSetup | null;
  splitsSetup: SplitsSetup | null;
  raceNumbers: number[];
  status: FindingStatus;
  findings: Finding[];
  samples: RaceSample[];
  exchanges: Exchange[];
};

export type DiagnosticProgress = { stage: string; step: number; steps: number };

export type DiagnosticOptions = {
  environment?: DiagnosticReport["environment"];
  onProgress?: (progress: DiagnosticProgress) => void;
  describeError?: (error: unknown) => string;
  /** Races walked in each direction at most. */
  maxRaces?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

/** Checks that need a person at the console. */
export const MANUAL_CHECKS: readonly string[] = [
  "Turn the console off and on, run a race, and check that Lane4 picks it up.",
  "Run a 10-lane race with everything on and compare the finals with the console.",
  "With reverse lanes on, check that lane 1 in Lane4 is the physical lane 1.",
];

const STAGES = [
  "Asking who the timer is",
  "Reading the meet date",
  "Reading setups",
  "Walking stored races",
  "Checking the previous meet",
  "Reading sample races",
  "Trying other commands",
] as const;

/** Newest races read in full, on top of the longest race stored. */
const SAMPLE_RACES = 5;
/** Long enough for a clock's seconds to change between two `T` replies. */
const CLOCK_GAP_MS = 1200;
const RESTORE_ATTEMPTS = 3;
const RANK: readonly FindingStatus[] = ["pass", "info", "warn", "fail"];

type Answer =
  | { kind: "data"; data: Uint8Array }
  | { kind: "refused"; code: number }
  | { kind: "lost" };

function worst(findings: Finding[]): FindingStatus {
  const rank = Math.max(...findings.map((f) => RANK.indexOf(f.status)));
  return RANK[rank]!;
}

function sameDate(a: TimerDate | null, b: TimerDate | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function list(values: Iterable<number | string>): string {
  return [...new Set(values)].join(", ");
}

function missingNumbers(sorted: number[]): number[] {
  const present = new Set(sorted);
  const missing: number[] = [];
  const last = sorted[sorted.length - 1]!;
  for (let n = sorted[0]!; n < last; n++) {
    if (!present.has(n)) missing.push(n);
  }
  return missing;
}

export async function diagnoseTimer(
  transport: TimerTransport,
  options: DiagnosticOptions = {},
): Promise<DiagnosticReport> {
  const now = options.now ?? Date.now;
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));
  const maxRaces = options.maxRaces ?? 600;
  const startedAt = new Date(now()).toISOString();
  const exchanges: Exchange[] = [];
  const findings: Finding[] = [];
  const samples: RaceSample[] = [];
  let decode: DecodeOptions = {};

  function find(
    id: string,
    title: string,
    status: FindingStatus,
    detail: string,
  ) {
    findings.push({ id, title, status, detail });
  }

  function stage(index: number) {
    options.onProgress?.({
      stage: STAGES[index]!,
      step: index + 1,
      steps: STAGES.length,
    });
  }

  async function ask(
    label: string,
    data: Uint8Array,
    keepReply = true,
  ): Promise<Answer> {
    const started = now();
    const entry: Exchange = { label, sent: toHex(data), ms: 0 };
    exchanges.push(entry);
    try {
      const reply = await transport.request(data);
      entry.ms = now() - started;
      entry.bytes = reply.length;
      const code = replyErrorCode(data, reply);
      if (code !== null) {
        entry.timerError = { code, message: describeTimerError(code) };
        return { kind: "refused", code };
      }
      if (keepReply) entry.reply = toHex(reply);
      return { kind: "data", data: reply };
    } catch (error) {
      entry.ms = now() - started;
      entry.noAnswer =
        options.describeError?.(error) ??
        (error instanceof Error ? error.message : String(error));
      return { kind: "lost" };
    }
  }

  function header(answer: Answer): TimerRaceHeader | null {
    const size = headerBytes(decode.maxNumLanes ?? DEFAULT_MAX_NUM_LANES);
    if (answer.kind !== "data" || answer.data.length < size) return null;
    return decodeHeader(answer.data, decode);
  }

  async function peek(
    label: string,
    selector: RaceSelector,
  ): Promise<TimerRaceHeader | null> {
    return header(await ask(label, swimData(selector, {}), false));
  }

  const meetDateNow = async () =>
    header(await ask("Meet date", meetTimeAndDate()))?.date ?? null;

  function finish(fields: Partial<DiagnosticReport>): DiagnosticReport {
    return {
      kind: "lane4.timer-diagnostics",
      schemaVersion: 1,
      startedAt,
      finishedAt: new Date(now()).toISOString(),
      environment: options.environment ?? {},
      version: null,
      meetDate: null,
      headerBytes: null,
      maxNumLanes: null,
      pool: null,
      splitsSetup: null,
      raceNumbers: [],
      status: worst(findings),
      findings,
      samples,
      exchanges,
      ...fields,
    };
  }

  // --- Who is it? ------------------------------------------------------------
  stage(0);
  const who = await ask("Who are you", whoAreYou());
  if (who.kind !== "data") {
    find(
      "connection",
      "Timer connection",
      "fail",
      "The timer didn't answer. Check that it's on and connected to its top RS232 port (COM 1) with a straight-through cable, not a null-modem cable. Then try the port list again in case the adapter changed name.",
    );
    return finish({});
  }
  const version = decodeVersion(who.data);
  find("connection", "Timer connection", "pass", `Timer says "${version}".`);

  // --- Meet date -------------------------------------------------------------
  stage(1);
  const firstDate = await ask("Meet date", meetTimeAndDate());
  let meetDate: TimerDate | null = null;
  let replyBytes: number | null = null;
  let maxNumLanes: number | null = null;
  if (firstDate.kind === "data") {
    replyBytes = firstDate.data.length;
    maxNumLanes = maxLanesFromHeader(replyBytes);
    if (maxNumLanes === null) {
      find(
        "header",
        "Race header size",
        "fail",
        `The meet date reply is ${replyBytes} bytes, which can't be a race header. Race decoding is likely to fail.`,
      );
    } else {
      decode = { maxNumLanes };
      find(
        "header",
        "Race header size",
        maxNumLanes === DEFAULT_MAX_NUM_LANES ? "pass" : "warn",
        maxNumLanes === DEFAULT_MAX_NUM_LANES
          ? `${replyBytes} bytes, as expected.`
          : `${replyBytes} bytes, so MAX_NUM_LANES is ${maxNumLanes}, not ${DEFAULT_MAX_NUM_LANES}. Lane4 adjusts to this automatically.`,
      );
      meetDate = decodeHeader(firstDate.data, decode).date;
      await sleep(CLOCK_GAP_MS);
      const again = await meetDateNow();
      find(
        "meet-time",
        "Meet time",
        sameDate(meetDate, again) ? "pass" : "warn",
        sameDate(meetDate, again)
          ? "The meet time stayed the same, so it looks like the time the meet began."
          : "The meet time changed between two reads, so it's the console's clock. Lane4 will pull the meet again when it reconnects, which is safe but slower.",
      );
    }
  } else {
    find(
      "empty-meet",
      "Meet date",
      "info",
      firstDate.kind === "refused"
        ? `The timer refused: ${describeTimerError(firstDate.code)}. This is expected on a timer with no races yet, and Lane4 still connects.`
        : "The timer didn't answer this request.",
    );
  }

  // --- Setups ----------------------------------------------------------------
  stage(2);
  async function readSetup(sub: SetupsSubCommand, label: string, size: number) {
    const full = readSetups(sub);
    const padded = await ask(label, full);
    if (padded.kind === "data" && padded.data.length >= size) {
      return { form: "padded", data: padded.data };
    }
    const short = await ask(`${label}, short form`, full.subarray(0, 2));
    if (short.kind === "data" && short.data.length >= size) {
      return { form: "short", data: short.data };
    }
    return { form: "none", data: null };
  }
  const poolRead = await readSetup("i", "Pool setup", 5);
  const splitsRead = await readSetup("g", "Splits setup", 2);
  const sequenceRead = await readSetup("r", "Event sequence", 1);
  const forms = [poolRead, splitsRead, sequenceRead].map((r) => r.form);
  find(
    "setups-read",
    "Reading setups",
    forms.includes("none") ? "info" : forms.includes("short") ? "warn" : "pass",
    forms.every((form) => form === "padded")
      ? "The timer answered all three setups reads."
      : `Pool: ${forms[0]}. Splits: ${forms[1]}. Event sequence: ${forms[2]}. "padded" is the form Lane4 sends, "short" means only the 2-byte form worked, and "none" means no answer. Firmware before v3.1 can't read setups, and Lane4 only loses its lane-count warning.`,
  );
  const pool = poolRead.data ? decodePoolSetup(poolRead.data) : null;
  const splitsSetup = splitsRead.data
    ? decodeSplitsSetup(splitsRead.data)
    : null;
  if (pool) {
    find(
      "reverse-lanes",
      "Reverse lanes",
      pool.reverseLanes ? "warn" : "info",
      pool.reverseLanes
        ? "Reverse lanes is on. Check that lane 1 in Lane4 is the physical lane 1."
        : `Reverse lanes is off, with ${pool.lanesInPool} lanes set.`,
    );
  }

  // --- Race pointer ----------------------------------------------------------
  stage(3);
  const lengths = new Map<number, number>();
  const note = (race: TimerRaceHeader) =>
    lengths.set(race.raceNumber, race.raceLengths);
  const pointer = await peek("Race at pointer", { kind: "pointer" });
  if (pointer) note(pointer);
  let end = pointer;
  for (let i = 0; i < maxRaces; i++) {
    const next = await peek("Next race", { kind: "next" });
    if (!next) break;
    note(next);
    end = next;
  }
  let oldestStop = "not reached";
  for (let at = end, i = 0; at && i < maxRaces; i++) {
    const previous = await peek("Previous race", { kind: "last" });
    if (!previous) {
      oldestStop = "returns an error";
      break;
    }
    if (previous.raceNumber >= at.raceNumber) {
      oldestStop = "wraps around to the newest race";
      break;
    }
    note(previous);
    at = previous;
  }
  const raceNumbers = [...lengths.keys()].sort((a, b) => a - b);
  if (raceNumbers.length === 0) {
    find(
      "races",
      "Stored races",
      "info",
      "This meet has no races stored. Run one race and test again, so the rest of the checks can run.",
    );
  } else {
    const lowest = raceNumbers[0]!;
    const highest = raceNumbers[raceNumbers.length - 1]!;
    const missing = missingNumbers(raceNumbers);
    find(
      "numbering",
      "Race numbering",
      lowest === 1 && missing.length === 0 ? "pass" : "warn",
      `${raceNumbers.length} races, numbered ${lowest} to ${highest}.${missing.length > 0 ? ` Missing: ${list(missing)}.` : ""} Lane4 walks past gaps, so this doesn't lose races.`,
    );
    const place =
      pointer === null
        ? "on no race"
        : pointer.raceNumber === highest
          ? "on the newest race"
          : pointer.raceNumber === lowest
            ? "on the oldest race"
            : `on race ${pointer.raceNumber}`;
    find(
      "pointer",
      "Race pointer",
      "info",
      `The pointer started ${place}. Moving back past the oldest race ${oldestStop}.`,
    );
  }

  // --- Previous meet ---------------------------------------------------------
  stage(4);
  if (meetDate) {
    await ask("Previous meet", previousMeet());
    const other = await meetDateNow();
    if (sameDate(other, meetDate)) {
      find(
        "meets",
        "Other meets",
        "info",
        "No other meet with races is stored, so numbering between meets can't be checked yet.",
      );
    } else {
      const raceOne = await peek("Race 1 of that meet", {
        kind: "race",
        raceNumber: 1,
      });
      let restored = false;
      for (let i = 0; i < RESTORE_ATTEMPTS && !restored; i++) {
        await ask("Back to the current meet", nextMeet());
        restored = sameDate(await meetDateNow(), meetDate);
      }
      if (restored) {
        find(
          "meets",
          "Other meets",
          "pass",
          raceOne
            ? "The previous meet has its own race 1, so numbering restarts with each meet. The timer is back on the current meet."
            : "The previous meet has no race 1, so numbers may carry on between meets. The timer is back on the current meet.",
        );
      } else {
        find(
          "meets",
          "Other meets",
          "fail",
          "The timer didn't return to the current meet, so Lane4 may read an older one. Turn the console off and on before running races.",
        );
      }
    }
  }

  // --- Sample races ----------------------------------------------------------
  stage(5);
  const newest = raceNumbers.slice(-SAMPLE_RACES);
  const longest = raceNumbers.reduce<number | null>(
    (best, n) =>
      best === null || lengths.get(n)! > lengths.get(best)! ? n : best,
    null,
  );
  const picked = longest === null ? newest : [longest, ...newest];
  let unread = 0;
  for (const raceNumber of new Set(picked)) {
    const started = exchanges.length;
    const answer = await ask(
      `Race ${raceNumber}`,
      swimData({ kind: "race", raceNumber }, FULL_RACE_OPTIONS),
    );
    const parsed = header(answer);
    if (answer.kind !== "data" || !parsed) {
      unread += 1;
      continue;
    }
    const sample: RaceSample = {
      raceNumber,
      event: parsed.event,
      heat: parsed.heat,
      raceLengths: parsed.raceLengths,
      lanesInPool: parsed.lanesInPool,
      numTimesPerLane: parsed.numTimesPerLane,
      numberOfButtons: parsed.numberOfButtons,
      bytes: answer.data.length,
      ms: exchanges[started]!.ms,
      layout: null,
    };
    try {
      const race = decodeRace(answer.data, decode);
      const lane = race.lanes[0];
      if (lane) {
        sample.layout = {
          splits: lane.splitsMs.length,
          buttons: lane.buttonsMs.length,
          backup: parsed.includes.backup,
          exchanges: lane.relayExchangesMs.length,
        };
      }
      if (race.layoutWarning) sample.layoutWarning = race.layoutWarning;
    } catch (error) {
      sample.decodeError = String(error);
    }
    samples.push(sample);
  }

  const decoded = samples.filter((s) => s.layout !== null);
  if (raceNumbers.length > 0) {
    const undecoded = samples.length - decoded.length;
    const warned = samples.filter((s) => s.layoutWarning).length;
    find(
      "decoding",
      "Decoding races",
      unread + undecoded > 0 ? "fail" : warned > 0 ? "warn" : "pass",
      `${decoded.length} read cleanly, ${warned} with a layout warning, ${undecoded} couldn't be decoded, and ${unread} couldn't be read. Don't rely on these times until this passes.`,
    );
  }

  const withButtons = decoded.filter((s) => s.layout!.buttons > 0);
  if (withButtons.length > 0) {
    const counts = withButtons.map((s) => {
      const { splits, buttons, backup } = s.layout!;
      const base = splits + (backup ? 1 : 0);
      if (s.numTimesPerLane === base + buttons) return "included";
      return s.numTimesPerLane === base ? "left out" : "unclear";
    });
    const seen = new Set(counts);
    find(
      "buttons",
      "Button times in the count",
      seen.size === 1 && !seen.has("unclear") ? "pass" : "warn",
      `This timer's num_times_for_each_lane has buttons: ${list(counts)}. Lane4 decodes either, and F397 doesn't say which is right.`,
    );
  } else if (decoded.length > 0) {
    find(
      "buttons",
      "Button times in the count",
      "info",
      "No race here used two or more backup buttons. Run one and test again.",
    );
  }

  if (decoded.length > 0) {
    const fits = decoded.every((s) => {
      const { splits } = s.layout!;
      return (
        splits === s.raceLengths || splits === Math.ceil(s.raceLengths / 2)
      );
    });
    find(
      "splits",
      "Split count",
      fits ? "pass" : "warn",
      `Splits per lane against race lengths: ${list(decoded.map((s) => `${s.layout!.splits}/${s.raceLengths}`))}.`,
    );
    const relayCounts = decoded.map((s) => s.layout!.exchanges);
    find(
      "relay",
      "Relay judging",
      "info",
      relayCounts.some((n) => n > 0)
        ? `Relay exchanges per lane: ${list(relayCounts)}.`
        : "No relay exchanges were sent. Test again after a relay to check this.",
    );
  }

  if (samples.length > 0) {
    const biggest = samples.reduce((a, b) => (b.bytes > a.bytes ? b : a));
    find(
      "long-race",
      "Longest reply",
      "pass",
      `Race ${biggest.raceNumber} was ${biggest.bytes} bytes and took ${biggest.ms} ms, and it passed its checksum. A 10-lane 1650 is about 2,900 bytes.`,
    );
  }

  // --- Other commands --------------------------------------------------------
  stage(6);
  const sample = samples[samples.length - 1];
  if (sample) {
    const current = await ask(
      "Current race",
      swimData({ kind: "current" }, {}),
      false,
    );
    find(
      "current-race",
      "Current race command",
      "info",
      current.kind === "data"
        ? "The timer answered. Lane4 doesn't use this command, because Gen7 doesn't support it."
        : "The timer didn't return a race. That's expected on Gen7, and Lane4 doesn't use this command.",
    );

    const selector: RaceSelector = {
      kind: "race",
      raceNumber: sample.raceNumber,
    };
    const plain = await ask("Race without reaction times", swimData(selector));
    const timed = await ask(
      "Race with reaction times",
      swimData(selector, { reactionTimes: true }),
    );
    find(
      "reaction-times",
      "Reaction times",
      "info",
      plain.kind === "data" && timed.kind === "data"
        ? `The reply grew by ${timed.data.length - plain.data.length} bytes with reaction times on. Lane4 doesn't decode them yet.`
        : "Couldn't compare replies with and without reaction times.",
    );

    const titled = samples.find((s) => s.event > 0 && s.heat > 0);
    if (titled) {
      const byEvent = await peek("Race by event and heat", {
        kind: "event",
        event: titled.event,
        heat: titled.heat,
      });
      find(
        "event-lookup",
        "Finding a race by event",
        byEvent?.raceNumber === titled.raceNumber ? "pass" : "warn",
        `Event ${titled.event}, heat ${titled.heat} should be race ${titled.raceNumber}. The timer returned ${byEvent ? `race ${byEvent.raceNumber}` : "no race"}. Reruns can make these differ.`,
      );
    } else {
      find(
        "event-lookup",
        "Finding a race by event",
        "info",
        "No race here has an event and heat, so the timer probably isn't running titled.",
      );
    }
  }

  return finish({
    version,
    meetDate,
    headerBytes: replyBytes,
    maxNumLanes,
    pool,
    splitsSetup,
    raceNumbers,
  });
}

/** A file name such as `Lane4 timer test 2026-11-05.json`, in local time. */
export function diagnosticFilename(report: DiagnosticReport): string {
  const started = new Date(report.startedAt);
  const month = String(started.getMonth() + 1).padStart(2, "0");
  const day = String(started.getDate()).padStart(2, "0");
  return `Lane4 timer test ${started.getFullYear()}-${month}-${day}.json`;
}
