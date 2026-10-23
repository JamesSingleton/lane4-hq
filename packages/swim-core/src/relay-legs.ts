import { canAddMeetEntry, type MeetEntryLimits } from "./entry-limits";
import { getCatalogEvent } from "./event-catalog";
import {
  buildEventKey,
  type Gender,
  parseEventKey,
  type Stroke,
} from "./events";

/** Four racing legs plus championship alternates #5–#8 (Hy-Tek F3). */
export const RELAY_PRIMARY_LEG_COUNT = 4;
export const RELAY_ALTERNATE_LEG_COUNT = 4;
export const RELAY_MAX_LEGS = 8;

export const RELAY_TEAM_LETTERS = ["A", "B", "C"] as const;

const MEDLEY_LEG_STROKES = ["back", "breast", "fly", "free"] as const;

export function isRelayAlternateSlot(legOrder: number): boolean {
  return legOrder >= 5 && legOrder <= RELAY_MAX_LEGS;
}

export function relaySlotLabel(legOrder: number): string {
  if (isRelayAlternateSlot(legOrder)) return `Alt ${legOrder}`;
  return `Leg ${legOrder}`;
}

function sentenceCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

/** Racing-leg stroke in sentence case (`Back`, `Free`), or `Alt 5` for alternates. */
export function relayLegRoleLabel(
  relayStroke: string,
  legOrder: number,
): string {
  if (isRelayAlternateSlot(legOrder)) return `Alt ${legOrder}`;
  return sentenceCase(strokeForRelayLeg(relayStroke, legOrder));
}

/** Same wording as the lane board: `2 events · 1 alt`. */
export function formatAssignmentCountLine(
  events: number,
  alts: number,
): string {
  const altPart = alts === 0 ? null : alts === 1 ? "1 alt" : `${alts} alts`;
  if (events === 0) return altPart ?? "0 events";
  const eventPart = events === 1 ? "1 event" : `${events} events`;
  return altPart ? `${eventPart} · ${altPart}` : eventPart;
}

/** Individual stroke that typically feeds this relay slot's split. */
export function strokeForRelayLeg(relayStroke: string, slot: number): string {
  const primary = ((Math.max(1, slot) - 1) % RELAY_PRIMARY_LEG_COUNT) + 1;
  if (relayStroke.includes("medley")) {
    return MEDLEY_LEG_STROKES[primary - 1]!;
  }
  return "free";
}

export function relayLetterFromIndex(teamIndex: number): string {
  return RELAY_TEAM_LETTERS[teamIndex] ?? "A";
}

/**
 * Prefer a stored team letter. Fall back to the legacy 4-leg packing
 * (1–4 → A, 5–8 → B, 9–12 → C) used before `relay_letter` existed.
 */
export function deriveRelayLetter(
  relayLetter: string | null | undefined,
  legOrder: number,
): string {
  const trimmed = relayLetter?.trim();
  if (trimmed) return trimmed.toUpperCase();
  const index = Math.floor(
    (Math.max(1, legOrder) - 1) / RELAY_PRIMARY_LEG_COUNT,
  );
  return relayLetterFromIndex(index);
}

export type RelayLegCountInput = {
  membershipId: string;
  meetEventId: string;
  relayLetter?: string | null;
  legOrder: number;
};

export function racingRelayTeamKey(
  meetEventId: string,
  relayLetter: string,
): string {
  return `${meetEventId}:${relayLetter.trim().toUpperCase() || "A"}`;
}

/** Unique named teams (event + letter) where the swimmer has a racing leg 1–4. */
export function racingRelayKeysByMember(
  legs: RelayLegCountInput[],
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const leg of legs) {
    if (leg.legOrder < 1 || isRelayAlternateSlot(leg.legOrder)) continue;
    const letter = deriveRelayLetter(leg.relayLetter, leg.legOrder);
    const key = racingRelayTeamKey(leg.meetEventId, letter);
    const set = map.get(leg.membershipId) ?? new Set();
    set.add(key);
    map.set(leg.membershipId, set);
  }
  return map;
}

export function racingRelayCount(
  legs: RelayLegCountInput[],
  membershipId: string,
): number {
  return racingRelayKeysByMember(legs).get(membershipId)?.size ?? 0;
}

export function canAssignRacingRelayLeg(args: {
  limits: MeetEntryLimits | null | undefined;
  individualCount: number;
  legs: RelayLegCountInput[];
  membershipId: string;
  meetEventId: string;
  relayLetter: string;
}): { ok: true } | { ok: false; reason: string } {
  const keys =
    racingRelayKeysByMember(args.legs).get(args.membershipId) ?? new Set();
  const teamKey = racingRelayTeamKey(args.meetEventId, args.relayLetter);
  if (keys.has(teamKey)) return { ok: true };
  return canAddMeetEntry(
    args.limits,
    { individual: args.individualCount, relay: keys.size },
    true,
  );
}

/** Lead-off (racing leg 1) on a legal, timed relay may update an individual best. */
export function shouldCreditRelayLeadOff(input: {
  legOrder: number;
  isDq: boolean;
  exhibition: boolean;
}): boolean {
  return (
    input.legOrder === 1 && !isRelayAlternateSlot(input.legOrder) && !input.isDq
  );
}

/**
 * Catalog individual event for a relay split. Uses the swimmer's gender, not
 * the relay's (mixed relays have no mixed individual keys).
 */
export function individualEventKeyForRelayLeg(input: {
  relayEventKey: string;
  legOrder: number;
  swimmerGender: Gender;
}): string | null {
  if (isRelayAlternateSlot(input.legOrder) || input.legOrder < 1) return null;
  const parsed = parseEventKey(input.relayEventKey);
  if (!parsed) return null;
  const catalog = getCatalogEvent(input.relayEventKey);
  const legs = catalog?.relayLegs ?? RELAY_PRIMARY_LEG_COUNT;
  if (parsed.distance % legs !== 0) return null;
  const legDistance = parsed.distance / legs;
  const stroke = strokeForRelayLeg(parsed.stroke, input.legOrder);
  const eventKey = buildEventKey(
    legDistance,
    stroke as Stroke,
    parsed.course,
    input.swimmerGender,
  );
  const individual = getCatalogEvent(eventKey);
  if (!individual) return null;
  return eventKey;
}

/**
 * Individual catalog key for the distance one swimmer races.
 * A 200 relay is four 50s. Alternates use the racing leg they would replace.
 */
export function relayLegTimeKey(
  relayEventKey: string,
  slot: number,
  swimmerGender: Gender,
): string | null {
  if (slot < 1 || slot > RELAY_MAX_LEGS) return null;
  const legOrder = ((slot - 1) % RELAY_PRIMARY_LEG_COUNT) + 1;
  return individualEventKeyForRelayLeg({
    relayEventKey,
    legOrder,
    swimmerGender,
  });
}

/** Individual keys to load when showing or suggesting legs for these genders. */
export function relayLegBestTimeKeys(
  relayEventKey: string,
  swimmerGenders: readonly Gender[],
): string[] {
  const keys = new Set<string>();
  for (const gender of swimmerGenders) {
    for (let leg = 1; leg <= RELAY_PRIMARY_LEG_COUNT; leg += 1) {
      const key = relayLegTimeKey(relayEventKey, leg, gender);
      if (key) keys.add(key);
    }
  }
  return [...keys];
}
