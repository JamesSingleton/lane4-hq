import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { staff } from "./staff";

/** Single-use ticket that lets admin open a support session for an operator. */
export const supportHandoff = pgTable(
  "support_handoff",
  {
    id: text("id").primaryKey(),
    tokenHash: text("token_hash").notNull(),
    staffId: text("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    targetUserId: text("target_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    usedAt: timestamp("used_at"),
  },
  (table) => [
    uniqueIndex("support_handoff_token_hash_idx").on(table.tokenHash),
    index("support_handoff_expires_idx").on(table.expiresAt),
  ],
);
