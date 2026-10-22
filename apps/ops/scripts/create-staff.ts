import { createStaffMember } from "@lane4hq/auth/staff-account";

async function main() {
  const name = process.env.STAFF_NAME?.trim() ?? "";
  const email = process.env.STAFF_EMAIL?.trim() ?? "";
  const password = process.env.STAFF_PASSWORD ?? "";
  if (!name || !email || !password) {
    console.error("Set STAFF_NAME, STAFF_EMAIL, and STAFF_PASSWORD.");
    process.exit(1);
  }
  const created = await createStaffMember({ name, email, password });
  console.log(`Staff account ready: ${created.email}`);
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Could not create staff",
  );
  process.exit(1);
});
