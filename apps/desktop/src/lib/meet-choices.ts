import type { Course, ScoringPreset } from "@lane4hq/meet-engine/model";
import type { ProgramGenders } from "@lane4hq/meet-engine/templates";
import type { EventGender } from "@lane4hq/swim-core/events";

export const COURSES = [
  { value: "SCY", label: "SCY (25 yd)" },
  { value: "SCM", label: "SCM (25 m)" },
  { value: "LCM", label: "LCM (50 m)" },
] as const satisfies readonly { value: Course; label: string }[];

export const LANES = [
  { value: "6", label: "6 lanes" },
  { value: "8", label: "8 lanes" },
  { value: "10", label: "10 lanes" },
] as const;

export const SCORING = [
  { value: "none", label: "No team scoring" },
  { value: "dual", label: "Dual meet (6-4-3-2-1, relays 8-4-2)" },
  { value: "invitational", label: "Invitational (9-7-6-5-4-3-2-1, relays ×2)" },
  { value: "championship", label: "Championship (16 places, relays ×2)" },
] as const satisfies readonly { value: ScoringPreset; label: string }[];

export const PROGRAM_GENDERS = [
  { value: "girls_boys", label: "Girls first, then boys" },
  { value: "boys_girls", label: "Boys first, then girls" },
  { value: "girls", label: "Girls only" },
  { value: "boys", label: "Boys only" },
  { value: "mixed", label: "Mixed" },
] as const satisfies readonly { value: ProgramGenders; label: string }[];

export const GENDER_ORDERS = [
  { value: "girls_boys", label: "Girls first" },
  { value: "boys_girls", label: "Boys first" },
] as const satisfies readonly { value: ProgramGenders; label: string }[];

export const EVENT_GENDERS = [
  { value: "female", label: "Girls" },
  { value: "male", label: "Boys" },
  { value: "mixed", label: "Mixed" },
] as const satisfies readonly { value: EventGender; label: string }[];

export const DIVE_COUNTS = [
  { value: "6", label: "6 dives (dual)" },
  { value: "11", label: "11 dives (championship)" },
] as const;

export const ROUNDS = [
  { value: "timed_final", label: "Timed finals" },
  { value: "prelim", label: "Prelims, then finals" },
] as const;

export const STROKES = [
  { value: "free", label: "Freestyle" },
  { value: "back", label: "Backstroke" },
  { value: "breast", label: "Breaststroke" },
  { value: "fly", label: "Butterfly" },
  { value: "im", label: "IM" },
  { value: "free_relay", label: "Freestyle relay" },
  { value: "medley_relay", label: "Medley relay" },
  { value: "dive", label: "Diving (1 m)" },
] as const;

export type Stroke = (typeof STROKES)[number]["value"];
