import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.hoisted(() => vi.fn());
const getMember = vi.hoisted(() => vi.fn());
const getTeamCapabilities = vi.hoisted(() =>
  vi.fn((role: string | null | undefined) => ({ role: role ?? null })),
);

vi.mock("@lane4hq/auth/session", () => ({ getSession }));
vi.mock("@lane4hq/db/authz", () => ({ getMember, getTeamCapabilities }));

import { getTeamCapabilitiesForCurrentMember } from "@/lib/team-member-capabilities";

describe("getTeamCapabilitiesForCurrentMember", () => {
  beforeEach(() => {
    getSession.mockReset();
    getMember.mockReset();
    getTeamCapabilities.mockClear();
  });

  it("returns guest capabilities when nobody is signed in", async () => {
    getSession.mockResolvedValueOnce(null);
    await expect(
      getTeamCapabilitiesForCurrentMember("team-1"),
    ).resolves.toEqual({ role: null });
    expect(getMember).not.toHaveBeenCalled();

    getSession.mockResolvedValueOnce({ user: {} });
    await getTeamCapabilitiesForCurrentMember("team-1");
    expect(getTeamCapabilities).toHaveBeenLastCalledWith(null);
  });

  it("uses the current member's role", async () => {
    getSession.mockResolvedValue({ user: { id: "user-1" } });
    getMember.mockResolvedValueOnce({ role: "head_coach" });
    await expect(
      getTeamCapabilitiesForCurrentMember("team-1"),
    ).resolves.toEqual({ role: "head_coach" });
    expect(getMember).toHaveBeenCalledWith("user-1", "team-1");

    getMember.mockResolvedValueOnce(null);
    await getTeamCapabilitiesForCurrentMember("team-1");
    expect(getTeamCapabilities).toHaveBeenLastCalledWith(undefined);
  });
});
