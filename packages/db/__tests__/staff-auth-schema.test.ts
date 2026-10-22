import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { describe, expect, it } from "vitest";
import * as schema from "../src/schema/index";
import { staffAuthSchema } from "../src/staff-auth-schema";

describe("staff auth schema", () => {
  it("does not expose a coach user query that would shadow staff", async () => {
    const sql = postgres("postgres://lane4:lane4@127.0.0.1:1/lane4", {
      max: 1,
      connect_timeout: 1,
    });
    try {
      const coach = drizzle(sql, { schema });
      const staffOnly = drizzle(sql, { schema: staffAuthSchema });
      expect(coach.query.user).toBeTypeOf("object");
      expect("user" in staffOnly.query).toBe(false);
      expect(staffOnly.query.staff).toBeTypeOf("object");
      await expect(
        staffOnly.query.staff.findFirst({ with: { accounts: true } }),
      ).rejects.toThrow(
        /Failed query:[\s\S]*from "staff"[\s\S]*"staff_account"/,
      );
    } finally {
      await sql.end({ timeout: 1 });
    }
  });
});
