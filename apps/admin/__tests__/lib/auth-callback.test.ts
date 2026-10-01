import { describe, expect, it } from "vitest";
import { getCallbackURL } from "@/lib/auth-callback";

describe("getCallbackURL", () => {
  it("returns fallback when callbackUrl is missing", () => {
    const params = new URLSearchParams();
    expect(getCallbackURL(params)).toBe("/");
    expect(getCallbackURL(params, "/onboarding")).toBe("/onboarding");
  });

  it("allows safe in-app paths", () => {
    const params = new URLSearchParams({
      callbackUrl: "/accept-invite?id=abc",
    });
    expect(getCallbackURL(params)).toBe("/accept-invite?id=abc");
  });

  it("returns to device sign-in with its code", () => {
    const params = new URLSearchParams({
      callbackUrl: "/device?user_code=ABCD1234",
    });
    expect(getCallbackURL(params)).toBe("/device?user_code=ABCD1234");
  });

  it("rejects open redirects", () => {
    const params = new URLSearchParams({
      callbackUrl: "https://evil.example",
    });
    expect(getCallbackURL(params)).toBe("/");
  });
});
