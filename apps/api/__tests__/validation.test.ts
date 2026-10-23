import { describe, expect, it } from "vitest";
import { z } from "zod";
import { validationHook } from "../src/utils/validation";

describe("validationHook", () => {
  it("names a field when the issue has a path, and uses the message alone when it does not", () => {
    const withPath = z.object({ heat: z.number() }).safeParse({ heat: "a" });
    const atRoot = z.string().min(1).safeParse("");
    const json = (body: unknown, status: number) => ({ body, status });

    const field = validationHook(withPath as never, { json } as never);
    expect(field).toMatchObject({
      status: 400,
      body: { error: { code: "invalid_request" } },
    });
    expect(
      (field as { body: { error: { message: string } } }).body.error.message,
    ).toContain("heat");

    const root = validationHook(atRoot as never, { json } as never) as {
      body: { error: { message: string } };
    };
    if (atRoot.success) throw new Error("expected a validation failure");
    expect(root.body.error.message).toBe(atRoot.error.issues[0]?.message);
    expect(
      validationHook({ success: true } as never, { json } as never),
    ).toBeUndefined();
  });
});
