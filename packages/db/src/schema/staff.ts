import { relations } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/** Lane4 employee. Not a coach, swimmer, or parent. */
export const staff = pgTable("staff", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** Better Auth session for a staff account. `user_id` points at staff, not coach users. */
export const staffSession = pgTable(
  "staff_session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
  },
  (table) => [index("staff_session_user_id_idx").on(table.userId)],
);

export const staffAccount = pgTable(
  "staff_account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    issuer: text("issuer"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("staff_account_user_id_idx").on(table.userId)],
);

export const staffVerification = pgTable(
  "staff_verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [index("staff_verification_identifier_idx").on(table.identifier)],
);

/** Better Auth rate-limit counters for the staff app. */
export const staffRateLimit = pgTable(
  "staff_rate_limit",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull().unique(),
    count: integer("count").notNull(),
    lastRequest: bigint("last_request", { mode: "number" }).notNull(),
  },
  (table) => [index("staff_rate_limit_key_idx").on(table.key)],
);

/** `accounts` matches Better Auth's join key for the account model. */
export const staffRelations = relations(staff, ({ many }) => ({
  sessions: many(staffSession),
  accounts: many(staffAccount),
}));

export const staffSessionRelations = relations(staffSession, ({ one }) => ({
  user: one(staff, {
    fields: [staffSession.userId],
    references: [staff.id],
  }),
}));

export const staffAccountRelations = relations(staffAccount, ({ one }) => ({
  user: one(staff, {
    fields: [staffAccount.userId],
    references: [staff.id],
  }),
}));
