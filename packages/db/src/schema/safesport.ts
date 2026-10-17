import { relations } from "drizzle-orm";
import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { member, organization } from "./auth";
import { teamSeasons } from "./seasons";
import { teamSwimmerMemberships } from "./swimmers";

export const credentialTypeEnum = pgEnum("credential_type", [
  "safesport_core",
  "safesport_refresher_1",
  "safesport_refresher_2",
  "safesport_refresher_3",
  "background_check",
  "cpr_aed",
  "stsc",
]);

export const credentialStatusEnum = pgEnum("credential_status", [
  "current",
  "expired",
  "pending",
  "not_started",
]);

export const credentialVerifiedByEnum = pgEnum("credential_verified_by", [
  "manual_upload",
  "usa_swimming_sync",
  "safesport_lms_webhook",
]);

export const acknowledgmentByEnum = pgEnum("acknowledgment_by", [
  "parent_guardian",
  "athlete",
  "adult_athlete",
]);

export const reportCategoryEnum = pgEnum("report_category", [
  "emotional_misconduct",
  "physical_misconduct",
  "sexual_misconduct",
  "maapp_violation",
  "other",
]);

export const reportStatusEnum = pgEnum("report_status", [
  "submitted",
  "under_review",
  "resolved",
  "referred_to_center",
]);

export const staffCredentials = pgTable(
  "staff_credentials",
  {
    id: text("id").primaryKey(),
    memberId: text("member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    credentialType: credentialTypeEnum("credential_type").notNull(),
    status: credentialStatusEnum("status").notNull().default("not_started"),
    completedAt: timestamp("completed_at"),
    expiresAt: timestamp("expires_at"),
    externalId: text("external_id"),
    verifiedBy: credentialVerifiedByEnum("verified_by")
      .notNull()
      .default("manual_upload"),
    documentUrl: text("document_url"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_staff_credentials_member").on(
      table.memberId,
      table.credentialType,
    ),
  ],
);

export const maappAcknowledgments = pgTable(
  "maapp_acknowledgments",
  {
    id: text("id").primaryKey(),
    membershipId: text("membership_id")
      .notNull()
      .references(() => teamSwimmerMemberships.id, { onDelete: "cascade" }),
    seasonId: text("season_id")
      .notNull()
      .references(() => teamSeasons.id, { onDelete: "restrict" }),
    acknowledgedBy: acknowledgmentByEnum("acknowledged_by").notNull(),
    signerName: text("signer_name").notNull(),
    signerEmail: text("signer_email").notNull(),
    acknowledgedAt: timestamp("acknowledged_at").notNull().defaultNow(),
    documentVersion: text("document_version").notNull().default("2025"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_maapp_ack_membership_season").on(
      table.membershipId,
      table.seasonId,
    ),
    index("maapp_acknowledgments_season_id_idx").on(table.seasonId),
  ],
);

export const safesportReports = pgTable(
  "safesport_reports",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    reportedByUserId: text("reported_by_user_id").notNull(),
    subjectDescription: text("subject_description").notNull(),
    category: reportCategoryEnum("category").notNull(),
    status: reportStatusEnum("status").notNull().default("submitted"),
    referredToCenterAt: timestamp("referred_to_center_at"),
    resolutionNotes: text("resolution_notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at"),
  },
  (table) => [
    index("safesport_reports_organization_id_idx").on(table.organizationId),
  ],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    /** Null for account events (sign-ins, sessions) that belong to no team. */
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
    actorUserId: text("actor_user_id").notNull(),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id").notNull(),
    metadata: jsonb("metadata"),
    ipAddress: text("ip_address"),
    /** `admin`, `api`, or `auth`. */
    source: text("source").notNull().default("admin"),
    userAgent: text("user_agent"),
    requestId: text("request_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_audit_log_org_created").on(
      table.organizationId,
      table.createdAt.desc().nullsFirst(),
    ),
    index("idx_audit_log_actor_created").on(
      table.actorUserId,
      table.createdAt.desc(),
    ),
  ],
);

export const staffCredentialsRelations = relations(
  staffCredentials,
  ({ one }) => ({
    member: one(member, {
      fields: [staffCredentials.memberId],
      references: [member.id],
    }),
  }),
);

export const maappAcknowledgmentsRelations = relations(
  maappAcknowledgments,
  ({ one }) => ({
    membership: one(teamSwimmerMemberships, {
      fields: [maappAcknowledgments.membershipId],
      references: [teamSwimmerMemberships.id],
    }),
    season: one(teamSeasons, {
      fields: [maappAcknowledgments.seasonId],
      references: [teamSeasons.id],
    }),
  }),
);

export const safesportReportsRelations = relations(
  safesportReports,
  ({ one }) => ({
    organization: one(organization, {
      fields: [safesportReports.organizationId],
      references: [organization.id],
    }),
  }),
);
