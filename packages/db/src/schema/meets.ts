import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization } from "./auth";
import { courseEnum, eventGenderEnum, swimEvents } from "./events";
import { teamSeasons } from "./seasons";
import { swimmers, teamSwimmerMemberships } from "./swimmers";

export type EntryLimitPackage = {
  individual: number;
  relay: number;
};

export const meetCommitmentStatusEnum = pgEnum("meet_commitment_status", [
  "pending",
  "committed",
  "declined",
  "not_going",
  "not_eligible",
]);

export const meetEntryStatusEnum = pgEnum("meet_entry_status", [
  "draft",
  "approved",
  "scratched",
]);

export const seedTimeSourceEnum = pgEnum("seed_time_source", [
  "personal_best",
  "manual",
  "no_time",
]);

export type SeedTimeSource = (typeof seedTimeSourceEnum.enumValues)[number];

export const meetResultRoundEnum = pgEnum("meet_result_round", [
  "prelim",
  "swimoff",
  "finals",
]);

export type MeetResultRound = (typeof meetResultRoundEnum.enumValues)[number];

export const meetEventKindEnum = pgEnum("meet_event_kind", ["swim", "dive"]);

export type MeetEventKind = (typeof meetEventKindEnum.enumValues)[number];

export const meets = pgTable(
  "meets",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    seasonId: text("season_id")
      .notNull()
      .references(() => teamSeasons.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    startDate: timestamp("start_date").notNull(),
    endDate: timestamp("end_date"),
    /** Deadline for entries to the meet host (from EV3 when imported). */
    entryDeadline: timestamp("entry_deadline"),
    course: courseEnum("course").notNull().default("SCY"),
    location: text("location"),
    address: text("address"),
    /** Coach-owned opponents line; not overwritten by meet-file import. */
    opponents: text("opponents"),
    importSource: text("import_source"),
    rawFilePath: text("raw_file_path"),
    maxIndividualEntries: integer("max_individual_entries"),
    maxRelayEntries: integer("max_relay_entries"),
    maxCombinedEntries: integer("max_combined_entries"),
    entryLimitPackages: jsonb("entry_limit_packages").$type<
      EntryLimitPackage[] | null
    >(),
    entryLimitsSource: text("entry_limits_source"),
    /** Meet override for association scoring cap; null inherits the team default. */
    maxScoringEntriesPerIndividualEvent: integer(
      "max_scoring_entries_per_individual_event",
    ),
    /** Meet override for association relay-team cap; null inherits the team default. */
    maxRelayTeamsPerEvent: integer("max_relay_teams_per_event"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("meets_org_start_date_idx").on(
      table.organizationId,
      table.startDate.desc().nullsFirst(),
    ),
    index("meets_season_id_idx").on(table.seasonId),
  ],
);

export const meetEvents = pgTable(
  "meet_events",
  {
    id: text("id").primaryKey(),
    meetId: text("meet_id")
      .notNull()
      .references(() => meets.id, { onDelete: "cascade" }),
    eventNumber: integer("event_number"),
    /** SwimTopia multi-age letter, such as `A` on event 42A. */
    eventSuffix: text("event_suffix"),
    stroke: text("stroke").notNull(),
    distance: integer("distance").notNull(),
    gender: eventGenderEnum("gender").notNull(),
    ageGroup: text("age_group"),
    eventKey: text("event_key")
      .notNull()
      .references(() => swimEvents.eventKey),
    /** Meet-specific entry qualifying cut (from EV3/HYV), milliseconds. */
    qualifyingTimeMs: integer("qualifying_time_ms"),
    /** Diving events (Hy-Tek EV3 `F` / HYV `6`) are unscored, distance-0 rows. */
    eventKind: meetEventKindEnum("event_kind").notNull().default("swim"),
    /** Number of dives (EV3/HYV dive-count field), diving events only. */
    diveCount: integer("dive_count"),
    /** True when this row came from a meet file, not Add event. */
    importedFromFile: boolean("imported_from_file").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("meet_events_meet_id_idx").on(table.meetId)],
);

export const meetCommitments = pgTable(
  "meet_commitments",
  {
    id: text("id").primaryKey(),
    meetId: text("meet_id")
      .notNull()
      .references(() => meets.id, { onDelete: "cascade" }),
    membershipId: text("membership_id")
      .notNull()
      .references(() => teamSwimmerMemberships.id, { onDelete: "cascade" }),
    status: meetCommitmentStatusEnum("status").notNull().default("pending"),
    /** Coach-declared relay-only roster (no individual events). */
    relayOnly: boolean("relay_only").notNull().default(false),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("meet_commitments_meet_membership_idx").on(
      table.meetId,
      table.membershipId,
    ),
    index("meet_commitments_membership_id_idx").on(table.membershipId),
  ],
);

export const meetEntries = pgTable(
  "meet_entries",
  {
    id: text("id").primaryKey(),
    meetId: text("meet_id")
      .notNull()
      .references(() => meets.id, { onDelete: "cascade" }),
    meetEventId: text("meet_event_id")
      .notNull()
      .references(() => meetEvents.id, { onDelete: "cascade" }),
    membershipId: text("membership_id")
      .notNull()
      .references(() => teamSwimmerMemberships.id, { onDelete: "cascade" }),
    seedTimeMs: integer("seed_time_ms"),
    seedTimeSource: seedTimeSourceEnum("seed_time_source")
      .notNull()
      .default("no_time"),
    entryNotes: text("entry_notes"),
    status: meetEntryStatusEnum("status").notNull().default("draft"),
    /** Swum outside the scored field (Hy-Tek E1 col 84 `X`). */
    exhibition: boolean("exhibition").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("meet_entries_meet_id_idx").on(table.meetId),
    index("meet_entries_membership_id_idx").on(table.membershipId),
    index("meet_entries_meet_event_id_idx").on(table.meetEventId),
  ],
);

export const meetResults = pgTable(
  "meet_results",
  {
    id: text("id").primaryKey(),
    meetId: text("meet_id")
      .notNull()
      .references(() => meets.id, { onDelete: "cascade" }),
    meetEventId: text("meet_event_id")
      .notNull()
      .references(() => meetEvents.id, { onDelete: "cascade" }),
    swimmerId: text("swimmer_id")
      .notNull()
      .references(() => swimmers.id, { onDelete: "cascade" }),
    timeMs: integer("time_ms").notNull(),
    previousBestTimeMs: integer("previous_best_time_ms"),
    place: integer("place"),
    isDq: boolean("is_dq").notNull().default(false),
    splitTimes: jsonb("split_times"),
    /** Championship round when known (Hy-Tek E2/HYV): prelim/swimoff/finals. */
    round: meetResultRoundEnum("round"),
    heat: integer("heat"),
    lane: integer("lane"),
    /** Swum outside the scored field (Hy-Tek E1 col 84 `X`). */
    exhibition: boolean("exhibition").notNull().default(false),
    /** Hy-Tek DQ reason code (E2/H1), e.g. "1F" false start, "2K" kick. */
    dqCode: text("dq_code"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("meet_results_meet_id_idx").on(table.meetId),
    index("meet_results_swimmer_id_idx").on(table.swimmerId),
    index("meet_results_meet_event_id_idx").on(table.meetEventId),
  ],
);

export const swimmerBestTimes = pgTable(
  "swimmer_best_times",
  {
    id: text("id").primaryKey(),
    swimmerId: text("swimmer_id")
      .notNull()
      .references(() => swimmers.id, { onDelete: "cascade" }),
    eventKey: text("event_key")
      .notNull()
      .references(() => swimEvents.eventKey),
    course: courseEnum("course").notNull(),
    timeMs: integer("time_ms").notNull(),
    achievedAt: timestamp("achieved_at").notNull(),
    meetId: text("meet_id").references(() => meets.id, {
      onDelete: "set null",
    }),
    /** Snapshot keeps the recorded venue stable when the source meet changes. */
    meetName: text("meet_name"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_swimmer_best_times_swimmer").on(
      table.swimmerId,
      table.eventKey,
      table.course,
    ),
  ],
);

/** Coach-entered dated swims (club / mock / practice) for progression charts. */
export const swimmerTimeEntrySourceEnum = pgEnum("swimmer_time_entry_source", [
  "manual",
]);

export type SwimmerTimeEntrySource =
  (typeof swimmerTimeEntrySourceEnum.enumValues)[number];

export const swimmerTimeEntries = pgTable(
  "swimmer_time_entries",
  {
    id: text("id").primaryKey(),
    swimmerId: text("swimmer_id")
      .notNull()
      .references(() => swimmers.id, { onDelete: "cascade" }),
    membershipId: text("membership_id")
      .notNull()
      .references(() => teamSwimmerMemberships.id, { onDelete: "cascade" }),
    eventKey: text("event_key")
      .notNull()
      .references(() => swimEvents.eventKey),
    course: courseEnum("course").notNull(),
    timeMs: integer("time_ms").notNull(),
    achievedAt: timestamp("achieved_at").notNull(),
    source: swimmerTimeEntrySourceEnum("source").notNull().default("manual"),
    label: text("label"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("swimmer_time_entries_membership_id_idx").on(table.membershipId),
    index("idx_swimmer_time_entries_swimmer_achieved").on(
      table.swimmerId,
      table.achievedAt,
    ),
    index("idx_swimmer_time_entries_swimmer_event").on(
      table.swimmerId,
      table.eventKey,
      table.course,
    ),
  ],
);

export const meetRelayLegs = pgTable(
  "meet_relay_legs",
  {
    id: text("id").primaryKey(),
    meetId: text("meet_id")
      .notNull()
      .references(() => meets.id, { onDelete: "cascade" }),
    meetEventId: text("meet_event_id")
      .notNull()
      .references(() => meetEvents.id, { onDelete: "cascade" }),
    /** A / B / C — one Hy-Tek F1 relay; legs 1–4 primary, 5–8 alternates. */
    relayLetter: text("relay_letter").notNull().default("A"),
    legOrder: integer("leg_order").notNull(),
    membershipId: text("membership_id")
      .notNull()
      .references(() => teamSwimmerMemberships.id, { onDelete: "cascade" }),
    stroke: text("stroke"),
    reasoning: text("reasoning"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("meet_relay_legs_meet_idx").on(table.meetId),
    index("meet_relay_legs_membership_id_idx").on(table.membershipId),
    index("meet_relay_legs_meet_event_id_idx").on(table.meetEventId),
  ],
);

/** One named relay (event + A/B/C) — team seed for Hy-Tek F1. */
export const meetRelayTeams = pgTable(
  "meet_relay_teams",
  {
    id: text("id").primaryKey(),
    meetId: text("meet_id")
      .notNull()
      .references(() => meets.id, { onDelete: "cascade" }),
    meetEventId: text("meet_event_id")
      .notNull()
      .references(() => meetEvents.id, { onDelete: "cascade" }),
    relayLetter: text("relay_letter").notNull().default("A"),
    seedTimeMs: integer("seed_time_ms"),
    seedTimeSource: seedTimeSourceEnum("seed_time_source")
      .notNull()
      .default("no_time"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("meet_relay_teams_event_letter_idx").on(
      table.meetId,
      table.meetEventId,
      table.relayLetter,
    ),
    index("meet_relay_teams_meet_idx").on(table.meetId),
    index("meet_relay_teams_meet_event_id_idx").on(table.meetEventId),
  ],
);

/** Recorded team result for a named relay; independent of lineup replace. */
export const meetRelayResults = pgTable(
  "meet_relay_results",
  {
    id: text("id").primaryKey(),
    meetId: text("meet_id")
      .notNull()
      .references(() => meets.id, { onDelete: "cascade" }),
    meetEventId: text("meet_event_id")
      .notNull()
      .references(() => meetEvents.id, { onDelete: "cascade" }),
    relayLetter: text("relay_letter").notNull().default("A"),
    round: meetResultRoundEnum("round"),
    timeMs: integer("time_ms").notNull(),
    heat: integer("heat"),
    lane: integer("lane"),
    exhibition: boolean("exhibition").notNull().default(false),
    isDq: boolean("is_dq").notNull().default(false),
    dqCode: text("dq_code"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    unique("meet_relay_results_attempt_idx")
      .on(table.meetId, table.meetEventId, table.relayLetter, table.round)
      .nullsNotDistinct(),
    index("meet_relay_results_meet_idx").on(table.meetId),
    index("meet_relay_results_meet_event_id_idx").on(table.meetEventId),
  ],
);

/** Immutable racing-lineup snapshot captured when a relay result is recorded. */
export const meetRelayResultMembers = pgTable(
  "meet_relay_result_members",
  {
    id: text("id").primaryKey(),
    resultId: text("result_id")
      .notNull()
      .references(() => meetRelayResults.id, { onDelete: "cascade" }),
    membershipId: text("membership_id")
      .notNull()
      .references(() => teamSwimmerMemberships.id, { onDelete: "cascade" }),
    legOrder: integer("leg_order").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("meet_relay_result_members_leg_idx").on(
      table.resultId,
      table.legOrder,
    ),
    index("meet_relay_result_members_membership_id_idx").on(table.membershipId),
  ],
);

export const meetRelayResultSplits = pgTable(
  "meet_relay_result_splits",
  {
    id: text("id").primaryKey(),
    resultId: text("result_id")
      .notNull()
      .references(() => meetRelayResults.id, { onDelete: "cascade" }),
    membershipId: text("membership_id")
      .notNull()
      .references(() => teamSwimmerMemberships.id, { onDelete: "cascade" }),
    legOrder: integer("leg_order").notNull(),
    timeMs: integer("time_ms").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("meet_relay_result_splits_leg_idx").on(
      table.resultId,
      table.legOrder,
    ),
    index("meet_relay_result_splits_membership_id_idx").on(table.membershipId),
  ],
);

export type MeetEventTemplateRow = {
  eventNumber: number;
  distance: number;
  stroke: string;
  gender: "male" | "female" | "mixed";
  ageGroup?: string;
  qualifyingTimeMs?: number | null;
};

export const meetEventTemplates = pgTable(
  "meet_event_templates",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    course: courseEnum("course").notNull().default("SCY"),
    events: jsonb("events").$type<MeetEventTemplateRow[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("meet_event_templates_org_idx").on(table.organizationId)],
);

export const timeStandardSets = pgTable(
  "time_standard_sets",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    course: courseEnum("course").notNull().default("SCY"),
    seasonLabel: text("season_label"),
    sourceFilePath: text("source_file_path"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("time_standard_sets_organization_id_idx").on(table.organizationId),
  ],
);

export const timeStandardCuts = pgTable(
  "time_standard_cuts",
  {
    id: text("id").primaryKey(),
    setId: text("set_id")
      .notNull()
      .references(() => timeStandardSets.id, { onDelete: "cascade" }),
    eventKey: text("event_key")
      .notNull()
      .references(() => swimEvents.eventKey),
    gender: eventGenderEnum("gender").notNull(),
    ageGroup: text("age_group").notNull(),
    timeMs: integer("time_ms").notNull(),
  },
  (table) => [
    index("time_standard_cuts_set_id_idx").on(table.setId),
    index("time_standard_cuts_lookup_idx").on(
      table.setId,
      table.eventKey,
      table.gender,
      table.ageGroup,
    ),
  ],
);

export const meetsRelations = relations(meets, ({ many, one }) => ({
  organization: one(organization, {
    fields: [meets.organizationId],
    references: [organization.id],
  }),
  season: one(teamSeasons, {
    fields: [meets.seasonId],
    references: [teamSeasons.id],
  }),
  events: many(meetEvents),
  entries: many(meetEntries),
  commitments: many(meetCommitments),
  results: many(meetResults),
  relayLegs: many(meetRelayLegs),
  relayTeams: many(meetRelayTeams),
  relayResults: many(meetRelayResults),
}));

export const meetCommitmentsRelations = relations(
  meetCommitments,
  ({ one }) => ({
    meet: one(meets, {
      fields: [meetCommitments.meetId],
      references: [meets.id],
    }),
    membership: one(teamSwimmerMemberships, {
      fields: [meetCommitments.membershipId],
      references: [teamSwimmerMemberships.id],
    }),
  }),
);

export const meetEventsRelations = relations(meetEvents, ({ one, many }) => ({
  meet: one(meets, {
    fields: [meetEvents.meetId],
    references: [meets.id],
  }),
  entries: many(meetEntries),
  results: many(meetResults),
  relayLegs: many(meetRelayLegs),
  relayTeams: many(meetRelayTeams),
  relayResults: many(meetRelayResults),
}));

export const meetEntriesRelations = relations(meetEntries, ({ one }) => ({
  meet: one(meets, {
    fields: [meetEntries.meetId],
    references: [meets.id],
  }),
  meetEvent: one(meetEvents, {
    fields: [meetEntries.meetEventId],
    references: [meetEvents.id],
  }),
  membership: one(teamSwimmerMemberships, {
    fields: [meetEntries.membershipId],
    references: [teamSwimmerMemberships.id],
  }),
}));

export const meetResultsRelations = relations(meetResults, ({ one }) => ({
  meet: one(meets, {
    fields: [meetResults.meetId],
    references: [meets.id],
  }),
  meetEvent: one(meetEvents, {
    fields: [meetResults.meetEventId],
    references: [meetEvents.id],
  }),
  swimmer: one(swimmers, {
    fields: [meetResults.swimmerId],
    references: [swimmers.id],
  }),
}));

export const swimmerTimeEntriesRelations = relations(
  swimmerTimeEntries,
  ({ one }) => ({
    swimmer: one(swimmers, {
      fields: [swimmerTimeEntries.swimmerId],
      references: [swimmers.id],
    }),
    membership: one(teamSwimmerMemberships, {
      fields: [swimmerTimeEntries.membershipId],
      references: [teamSwimmerMemberships.id],
    }),
    event: one(swimEvents, {
      fields: [swimmerTimeEntries.eventKey],
      references: [swimEvents.eventKey],
    }),
  }),
);

export const meetRelayLegsRelations = relations(meetRelayLegs, ({ one }) => ({
  meet: one(meets, {
    fields: [meetRelayLegs.meetId],
    references: [meets.id],
  }),
  meetEvent: one(meetEvents, {
    fields: [meetRelayLegs.meetEventId],
    references: [meetEvents.id],
  }),
  membership: one(teamSwimmerMemberships, {
    fields: [meetRelayLegs.membershipId],
    references: [teamSwimmerMemberships.id],
  }),
}));

export const meetRelayTeamsRelations = relations(meetRelayTeams, ({ one }) => ({
  meet: one(meets, {
    fields: [meetRelayTeams.meetId],
    references: [meets.id],
  }),
  meetEvent: one(meetEvents, {
    fields: [meetRelayTeams.meetEventId],
    references: [meetEvents.id],
  }),
}));

export const meetRelayResultsRelations = relations(
  meetRelayResults,
  ({ one, many }) => ({
    meet: one(meets, {
      fields: [meetRelayResults.meetId],
      references: [meets.id],
    }),
    meetEvent: one(meetEvents, {
      fields: [meetRelayResults.meetEventId],
      references: [meetEvents.id],
    }),
    members: many(meetRelayResultMembers),
    splits: many(meetRelayResultSplits),
  }),
);

export const meetRelayResultMembersRelations = relations(
  meetRelayResultMembers,
  ({ one }) => ({
    result: one(meetRelayResults, {
      fields: [meetRelayResultMembers.resultId],
      references: [meetRelayResults.id],
    }),
    membership: one(teamSwimmerMemberships, {
      fields: [meetRelayResultMembers.membershipId],
      references: [teamSwimmerMemberships.id],
    }),
  }),
);

export const meetRelayResultSplitsRelations = relations(
  meetRelayResultSplits,
  ({ one }) => ({
    result: one(meetRelayResults, {
      fields: [meetRelayResultSplits.resultId],
      references: [meetRelayResults.id],
    }),
    membership: one(teamSwimmerMemberships, {
      fields: [meetRelayResultSplits.membershipId],
      references: [teamSwimmerMemberships.id],
    }),
  }),
);

export const meetEventTemplatesRelations = relations(
  meetEventTemplates,
  ({ one }) => ({
    organization: one(organization, {
      fields: [meetEventTemplates.organizationId],
      references: [organization.id],
    }),
  }),
);

export const timeStandardSetsRelations = relations(
  timeStandardSets,
  ({ many, one }) => ({
    organization: one(organization, {
      fields: [timeStandardSets.organizationId],
      references: [organization.id],
    }),
    cuts: many(timeStandardCuts),
  }),
);

export const timeStandardCutsRelations = relations(
  timeStandardCuts,
  ({ one }) => ({
    set: one(timeStandardSets, {
      fields: [timeStandardCuts.setId],
      references: [timeStandardSets.id],
    }),
  }),
);
