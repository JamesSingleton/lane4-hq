import { relations } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";

/**
 * A meet a team hosts and runs on the desktop meet manager. The id is the
 * desktop meet's id, so every deck machine publishing the same meet lands
 * here. Visiting teams' own meets stay in `meets`.
 */
export const hostedMeets = pgTable(
  "hosted_meets",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Local calendar date, `YYYY-MM-DD`, as the deck machine has it. */
    startDate: text("start_date"),
    course: text("course").notNull(),
    location: text("location"),
    lastPublishedAt: timestamp("last_published_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("hosted_meets_org_idx").on(table.organizationId)],
);

/**
 * The latest verified revision of one heat (`lane4.heat-results/v1`). A
 * corrected heat replaces the row; an older revision arriving late is ignored.
 */
export const publishedHeats = pgTable(
  "published_heats",
  {
    id: text("id").primaryKey(),
    hostedMeetId: text("hosted_meet_id")
      .notNull()
      .references(() => hostedMeets.id, { onDelete: "cascade" }),
    eventNumber: integer("event_number").notNull(),
    /** `timed_final`, `prelim`, or `final`. */
    round: text("round").notNull(),
    heat: integer("heat").notNull(),
    revision: integer("revision").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    event: jsonb("event").$type<Record<string, unknown>>().notNull(),
    lanes: jsonb("lanes").$type<Record<string, unknown>[]>().notNull(),
    verifiedAt: timestamp("verified_at").notNull(),
    publishedByUserId: text("published_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    receivedAt: timestamp("received_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("published_heats_heat_idx").on(
      table.hostedMeetId,
      table.eventNumber,
      table.round,
      table.heat,
    ),
  ],
);

export const hostedMeetsRelations = relations(hostedMeets, ({ one, many }) => ({
  organization: one(organization, {
    fields: [hostedMeets.organizationId],
    references: [organization.id],
  }),
  heats: many(publishedHeats),
}));

export const publishedHeatsRelations = relations(publishedHeats, ({ one }) => ({
  meet: one(hostedMeets, {
    fields: [publishedHeats.hostedMeetId],
    references: [hostedMeets.id],
  }),
}));
