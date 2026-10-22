import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

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
    createdAt: timestamp("created_at").notNull().defaultNow(),
    acceptedAt: timestamp("accepted_at"),
  },
  (table) => [
    uniqueIndex("beta_invite_token_idx").on(table.token),
    index("beta_invite_email_status_idx").on(table.email, table.status),
  ],
);
