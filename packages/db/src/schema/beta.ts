import { sql } from "drizzle-orm";
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { staff } from "./staff";

/** Platform invite to create an account during the private beta. */
export const betaInvite = pgTable(
  "beta_invite",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    token: text("token").notNull(),
    status: text("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at").notNull(),
    invitedByUserId: text("invited_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    invitedByStaffId: text("invited_by_staff_id").references(() => staff.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    acceptedAt: timestamp("accepted_at"),
  },
  (table) => [
    uniqueIndex("beta_invite_token_idx").on(table.token),
    index("beta_invite_email_status_idx").on(table.email, table.status),
  ],
);

/** A coach asking to join the private beta. Approve sends a beta invite. */
export const betaAccessRequest = pgTable(
  "beta_access_request",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    team: text("team").notNull(),
    reason: text("reason").notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    reviewedAt: timestamp("reviewed_at"),
    reviewedByUserId: text("reviewed_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    reviewedByStaffId: text("reviewed_by_staff_id").references(() => staff.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("beta_access_request_email_status_idx").on(table.email, table.status),
    index("beta_access_request_status_created_idx").on(
      table.status,
      table.createdAt,
    ),
    uniqueIndex("beta_access_request_pending_email_idx")
      .on(sql`lower(${table.email})`)
      .where(sql`${table.status} = 'pending'`),
  ],
);
