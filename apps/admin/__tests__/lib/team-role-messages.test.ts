import { describe, expect, it } from "vitest";
import { TEAM_MANAGE_ROLE_TOOLTIP } from "@/lib/team-role-messages";

describe("team role messages", () => {
  it("explains who can manage the team", () => {
    expect(TEAM_MANAGE_ROLE_TOOLTIP).toContain("head coaches");
  });
});
