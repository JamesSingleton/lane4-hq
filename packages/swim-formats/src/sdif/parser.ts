import {
  buildEventKey,
  parseEventGender,
  type RelayStroke,
  type Stroke,
} from "@lane4hq/swim-core/events";
import { parseTime } from "@lane4hq/swim-core/times";
import { parseResultRoundType, parseSdifHeatLane } from "../g0-meta";
import type {
  ParsedEntry,
  ParsedEvent,
  ParsedMeet,
  ParsedRelayEntry,
  ParsedResult,
} from "../types";
import { isUssSdifV3, parseUssSdif } from "./uss";

const STROKE_MAP: Record<string, string> = {
  FR: "free",
  FREE: "free",
  BK: "back",
  BACK: "back",
  BR: "breast",
  BREAST: "breast",
  FL: "fly",
  FLY: "fly",
  IM: "im",
  FRR: "free_relay",
  MR: "medley_relay",
  MEDLEY: "medley_relay",
};

function parseStroke(code: string): string {
  return STROKE_MAP[code.toUpperCase()] ?? code.toLowerCase();
}

function parseSdifDate(raw: string): string | undefined {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 8) {
    return `${digits.slice(4, 8)}-${digits.slice(0, 2)}-${digits.slice(2, 4)}`;
  }
  return undefined;
}

function swimmerNameFromLine(line: string): string {
  return (
    `${line.substring(48, 68).trim()} ${line.substring(68, 88).trim()}`.trim() ||
    `${line.substring(31, 51).trim()} ${line.substring(11, 31).trim()}`.trim()
  );
}

function usaIdFromLine(line: string): string | undefined {
  const a =
    line.substring(16, 28).trim() || line.substring(51, 65).trim() || undefined;
  return a || undefined;
}

function eventNumberFromLine(line: string): number | undefined {
  return (
    Number.parseInt(line.substring(9, 13).trim(), 10) ||
    Number.parseInt(line.substring(2, 6).trim(), 10) ||
    undefined
  );
}

/** Parse SDIF/SD3 file content into structured meet data */
export function parseSdif(content: string): ParsedMeet {
  // SwimTopia and TeamUnify write USA Swimming SDIF v3. Lane4's own
  // export and the older loose layout stay on the path below.
  if (isUssSdifV3(content)) return parseUssSdif(content);
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  const meet: ParsedMeet = {
    name: "Imported Meet",
    course: "SCY",
    events: [],
    entries: [],
    results: [],
  };
  const relays: ParsedRelayEntry[] = [];

  for (const line of lines) {
    const recordType = line.substring(0, 2);

    switch (recordType) {
      case "A0": {
        const title = line.substring(43, 73).trim();
        if (title) meet.name = title;
        break;
      }
      case "B1": {
        const name = line.substring(11, 41).trim();
        if (name) meet.name = name;
        const loc = line.substring(41, 71).trim();
        if (loc) meet.location = loc;
        const start = parseSdifDate(line.substring(71, 79));
        if (start) meet.startDate = start;
        const end = parseSdifDate(line.substring(79, 87));
        if (end) meet.endDate = end;
        const sanction = line.substring(87, 102)?.trim();
        if (sanction && /[A-Z0-9]/i.test(sanction)) {
          meet.sanctionNumber = sanction;
        }
        if (line.includes("LCM")) meet.course = "LCM";
        else if (line.includes("SCM")) meet.course = "SCM";
        else meet.course = "SCY";
        break;
      }
      case "E1": {
        const gender = parseEventGender(
          line.substring(25, 26).trim() || line.substring(16, 17).trim(),
        );
        const distance =
          Number.parseInt(line.substring(26, 30).trim(), 10) ||
          Number.parseInt(line.substring(17, 21).trim(), 10) ||
          0;
        const stroke = parseStroke(
          line.substring(30, 33).trim() || line.substring(21, 24).trim(),
        );
        const event: ParsedEvent = {
          eventNumber: eventNumberFromLine(line),
          distance,
          stroke,
          gender,
          eventKey: buildEventKey(
            distance,
            stroke as Stroke | RelayStroke,
            meet.course,
            gender,
          ),
        };
        meet.events.push(event);
        break;
      }
      case "D0": {
        const entry: ParsedEntry = {
          eventNumber: eventNumberFromLine(line),
          swimmerName: swimmerNameFromLine(line),
          seedTime:
            line.substring(99, 107).trim() ||
            line.substring(72, 82).trim() ||
            undefined,
          usaMemberId: usaIdFromLine(line),
        };
        meet.entries.push(entry);
        break;
      }
      case "F0": {
        // Relay entry / result — team name region varies by vendor
        const teamCode =
          line.substring(11, 16).trim() ||
          line.substring(2, 8).trim() ||
          undefined;
        const seedTime =
          line.substring(99, 107).trim() ||
          line.substring(72, 82).trim() ||
          undefined;
        relays.push({
          eventNumber: eventNumberFromLine(line),
          swimmerNames: [],
          seedTime: seedTime || undefined,
          teamCode,
        });
        break;
      }
      case "G0": {
        const time =
          line.substring(99, 107).trim() || line.substring(72, 82).trim();
        if (!time) break;
        const dqFlag = line.substring(117, 118).trim();
        const { heat, lane } = parseSdifHeatLane(line);
        const resultType = parseResultRoundType(line);
        const result: ParsedResult = {
          eventNumber: eventNumberFromLine(line),
          swimmerName: swimmerNameFromLine(line),
          time,
          place:
            Number.parseInt(line.substring(113, 117).trim(), 10) ||
            Number.parseInt(line.substring(82, 86).trim(), 10) ||
            undefined,
          isDq: dqFlag === "D" || /DQ|NS|SCR/i.test(line),
          usaMemberId: usaIdFromLine(line),
          dqCode: dqFlag && dqFlag !== "" ? dqFlag : undefined,
          ...(resultType ? { resultType } : {}),
          ...(heat != null ? { heat } : {}),
          ...(lane != null ? { lane } : {}),
        };
        meet.results.push(result);
        break;
      }
    }
  }

  if (relays.length > 0) meet.relays = relays;
  return meet;
}

export { exportSdif } from "../export/meet";
export { exportUssSdif } from "./uss-export";
export { parseTime };
