import {
  staff,
  staffAccount,
  staffAccountRelations,
  staffRateLimit,
  staffRelations,
  staffSession,
  staffSessionRelations,
  staffVerification,
} from "./schema/staff";

/**
 * Schema for the staff Better Auth client.
 *
 * Keys must not include `user`. Better Auth asks Drizzle for `db.query.user`
 * before it maps its user model onto `staff`. The shared client already has
 * `query.user` for coaches, so staff sign-in has to use this schema alone.
 */
export const staffAuthSchema = {
  staff,
  staffAccount,
  staffSession,
  staffVerification,
  staffRateLimit,
  staffRelations,
  staffAccountRelations,
  staffSessionRelations,
};
