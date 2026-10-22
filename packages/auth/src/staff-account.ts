import { db } from "@lane4hq/db/client";
import { staff } from "@lane4hq/db/schema";
import { sql } from "drizzle-orm";
import { staffAuth } from "./staff-server";

export async function createStaffMember(input: {
  name: string;
  email: string;
  password: string;
}) {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const password = input.password;
  if (!name || name.length > 200) {
    throw new Error("Enter a name.");
  }
  if (!email.includes("@")) {
    throw new Error("Enter a valid email address.");
  }
  if (password.length < 8 || password.length > 128) {
    throw new Error("Use a password between 8 and 128 characters.");
  }

  const [existing] = await db
    .select({ id: staff.id })
    .from(staff)
    .where(sql`lower(${staff.email}) = ${email}`)
    .limit(1);
  if (existing) {
    throw new Error("That email already has a staff account.");
  }
  const ctx = await staffAuth.$context;
  const hash = await ctx.password.hash(password);
  const created = await ctx.internalAdapter.createUser(
    {
      email,
      name,
      emailVerified: true,
    },
    { method: "email-password" },
  );
  if (!created) {
    throw new Error("Could not create that staff account.");
  }
  await ctx.internalAdapter.linkAccount({
    userId: created.id,
    providerId: "credential",
    accountId: created.id,
    password: hash,
  });
  return { id: created.id, email: created.email, name: created.name };
}
