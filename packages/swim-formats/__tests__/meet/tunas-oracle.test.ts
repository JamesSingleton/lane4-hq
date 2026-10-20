import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseCl2Meet } from "../../src/cl2/parser";
import { parseHy3 } from "../../src/hy3/parser";
import type {
  ParsedMeet,
  ParsedRelayEntry,
  ParsedResult,
} from "../../src/types";

const dir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/third-party/tunas",
);

interface TunasSwimmer {
  id_short?: string | null;
  id_long?: string | null;
  first_name: string;
  last_name: string;
  preferred_first_name?: string | null;
  swims: TunasSwim[];
}

interface TunasSwim {
  session?: string;
  status?: string;
  time?: string | null;
  event?: string;
  is_relay_leg?: boolean;
}

interface TunasRelayLeg {
  swimmer_id?: string | null;
  swimmer_id_short?: string | null;
}

interface TunasRelay {
  relay_letter?: string;
  time?: string | null;
  session?: string;
  status?: string;
  legs?: TunasRelayLeg[];
}

interface TunasFile {
  swimmers: TunasSwimmer[];
  relays?: TunasRelay[];
}

function load(name: string): { text: string; expected: TunasFile } {
  return {
    text: readFileSync(join(dir, name), "latin1"),
    expected: JSON.parse(
      readFileSync(
        join(dir, name.replace(/\.(cl2|hy3)$/, ".expected.json")),
        "utf8",
      ),
    ) as TunasFile,
  };
}

function timeKey(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  return value.trim().replace(/[YSL]$/i, "");
}

function roundOf(session: string | undefined): ParsedResult["resultType"] {
  if (session === "PRELIMS") return "prelim";
  if (session === "FINALS") return "finals";
  return undefined;
}

function nameHits(swimmerName: string, swimmer: TunasSwimmer): boolean {
  const hay = swimmerName.toLowerCase();
  if (!hay.includes(swimmer.last_name.toLowerCase())) return false;
  const preferred = swimmer.preferred_first_name?.toLowerCase();
  return (
    hay.includes(swimmer.first_name.toLowerCase()) ||
    (preferred != null && preferred.length > 0 && hay.includes(preferred))
  );
}

function assertRounds(meet: ParsedMeet, expected: TunasFile): void {
  const results = meet.results;
  let checked = 0;
  for (const swimmer of expected.swimmers) {
    for (const swim of swimmer.swims) {
      if (swim.is_relay_leg) continue;
      if (swim.status && swim.status !== "OK") continue;
      const time = timeKey(swim.time);
      const resultType = roundOf(swim.session);
      if (!time || !resultType) continue;
      checked += 1;
      const found = results.some(
        (result) =>
          result.resultType === resultType &&
          timeKey(result.time) === time &&
          nameHits(result.swimmerName, swimmer),
      );
      expect(found, `${resultType} ${time} ${swimmer.last_name}`).toBe(true);
    }
  }
  expect(checked).toBeGreaterThan(0);
}

function relayLegNames(
  relay: TunasRelay,
  byId: Map<string, TunasSwimmer>,
): string[] {
  return (relay.legs ?? []).map((leg) => {
    const id = leg.swimmer_id_short ?? leg.swimmer_id ?? "";
    const swimmer = byId.get(id);
    return swimmer ? `${swimmer.first_name} ${swimmer.last_name}` : id;
  });
}

function assertRelays(meet: ParsedMeet, expected: TunasFile): void {
  const relays = meet.relays ?? [];
  // tunas drops an F2 whose course letter is blank, so the parsed list can
  // be longer. Every relay tunas kept, including a squad with no F3 legs,
  // must still be present.
  expect(relays.length).toBeGreaterThanOrEqual(expected.relays?.length ?? 0);
  const byId = new Map<string, TunasSwimmer>();
  for (const swimmer of expected.swimmers) {
    if (swimmer.id_short) byId.set(swimmer.id_short, swimmer);
    if (swimmer.id_long) byId.set(swimmer.id_long, swimmer);
  }
  for (const relay of expected.relays ?? []) {
    const legs = relayLegNames(relay, byId);
    const time = timeKey(relay.time);
    const found = relays.some((parsed) =>
      relayMatches(parsed, relay, legs, time),
    );
    expect(found, `relay ${relay.relay_letter ?? ""} ${time ?? ""}`).toBe(true);
  }
}

function relayMatches(
  parsed: ParsedRelayEntry,
  relay: TunasRelay,
  legs: string[],
  time: string | undefined,
): boolean {
  if (relay.relay_letter && parsed.relayLetter !== relay.relay_letter) {
    return false;
  }
  if (parsed.swimmerNames.length < legs.length) return false;
  for (let i = 0; i < legs.length; i++) {
    const expectedName = legs[i] ?? "";
    const actual = parsed.swimmerNames[i] ?? "";
    const [first, ...rest] = expectedName.split(" ");
    const last = rest[rest.length - 1] ?? "";
    if (!actual.toLowerCase().includes(last.toLowerCase())) return false;
    if (first && !actual.toLowerCase().includes(first.toLowerCase()))
      return false;
  }
  if (!time) return true;
  const candidates = [
    parsed.seedTime,
    ...(parsed.results ?? []).map((result) => result.time),
  ];
  return candidates.some((candidate) => timeKey(candidate) === time);
}

function assertD3(meet: ParsedMeet, expected: TunasFile): void {
  let checked = 0;
  for (const swimmer of expected.swimmers) {
    if (!swimmer.id_long && !swimmer.preferred_first_name) continue;
    const entry = meet.entries.find((row) =>
      nameHits(row.swimmerName, swimmer),
    );
    expect(entry, swimmer.last_name).toBeTruthy();
    if (swimmer.id_long) {
      expect(entry?.usaMemberId).toBe(swimmer.id_long);
    }
    if (swimmer.preferred_first_name) {
      expect(entry?.preferredName).toBe(swimmer.preferred_first_name);
    }
    checked += 1;
  }
  expect(checked).toBeGreaterThan(0);
}

describe("tunas field oracles", () => {
  it("reads Reno walk-on finals and D3 identity", () => {
    const { text, expected } = load("reno_walk_on_meet.cl2");
    const meet = parseCl2Meet(text);
    assertRounds(meet, expected);
    assertD3(meet, expected);
  });

  it("reads AAA prelims, finals, relays, and D3 identity", () => {
    const { text, expected } = load("aaa_league_championship.cl2");
    const meet = parseCl2Meet(text);
    assertRounds(meet, expected);
    assertRelays(meet, expected);
    assertD3(meet, expected);
  });

  it("reads Palo Alto distance finals, relays, and D1 identity", () => {
    const { text, expected } = load("pasa_distance_intersquad.hy3");
    const meet = parseHy3(text);
    assertRounds(meet, expected);
    assertRelays(meet, expected);
    let identity = 0;
    for (const swimmer of expected.swimmers) {
      const athlete = meet.athletes?.find((row) => nameHits(row.name, swimmer));
      expect(athlete, swimmer.last_name).toBeTruthy();
      if (swimmer.id_long) {
        expect(athlete?.usaMemberId).toBe(swimmer.id_long);
      } else if (swimmer.id_short) {
        // HY3 cols 70–83 are the 14-character id; tunas id_short is the first 12.
        expect(athlete?.usaMemberId?.startsWith(swimmer.id_short)).toBe(true);
      }
      if (swimmer.preferred_first_name) {
        expect(athlete?.preferredName).toBe(swimmer.preferred_first_name);
      }
      identity += 1;
    }
    expect(identity).toBe(expected.swimmers.length);
  });
});
