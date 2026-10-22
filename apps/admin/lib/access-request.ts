import { z } from "zod";

const accessRequestSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Enter your name.")
    .max(80, "Name is too long."),
  email: z
    .string()
    .trim()
    .email("Enter a valid email address.")
    .max(200, "Email is too long."),
  team: z
    .string()
    .trim()
    .min(2, "Enter your team or school.")
    .max(120, "Team name is too long."),
  reason: z
    .string()
    .trim()
    .min(20, "Tell us a bit more about why you want to use Lane4.")
    .max(2000, "That note is too long."),
});

export type AccessRequestInput = z.infer<typeof accessRequestSchema>;

export function parseAccessRequest(input: {
  name: unknown;
  email: unknown;
  team: unknown;
  reason: unknown;
  website?: unknown;
}):
  | { ok: true; honeypot: true }
  | { ok: true; honeypot: false; value: AccessRequestInput }
  | { ok: false; error: string } {
  const website = typeof input.website === "string" ? input.website.trim() : "";
  if (website) return { ok: true, honeypot: true };

  const parsed = accessRequestSchema.safeParse({
    name: input.name,
    email: input.email,
    team: input.team,
    reason: input.reason,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check the form and try again.",
    };
  }

  return {
    ok: true,
    honeypot: false,
    value: {
      ...parsed.data,
      email: parsed.data.email.toLowerCase(),
    },
  };
}
