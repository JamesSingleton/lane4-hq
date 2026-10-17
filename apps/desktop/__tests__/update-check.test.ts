import { describe, expect, it } from "vitest";
import { updateCheckFailure } from "../src/lib/update-check";

describe("update check failures", () => {
  it("turns the Rust error into one sentence", () => {
    expect(updateCheckFailure("Couldn't check for updates: dns failed")).toBe(
      "Lane4 couldn't check for updates. dns failed. You can keep running the meet.",
    );
    expect(updateCheckFailure("The update service is down.")).toBe(
      "Lane4 couldn't check for updates. The update service is down. You can keep running the meet.",
    );
  });
});
