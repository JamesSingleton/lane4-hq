import { describe, expect, it } from "vitest";
import { parseGitHubIssues } from "@/lib/github-issues";
import { handoffIsOpen, supportHandoffUrl } from "@/lib/handoff-url";

describe("supportHandoffUrl", () => {
  it("points at the coach app handoff route", () => {
    expect(supportHandoffUrl("http://localhost:3001/", "abc")).toBe(
      "http://localhost:3001/support/handoff?token=abc",
    );
  });

  it("rejects a blank token", () => {
    expect(supportHandoffUrl("http://localhost:3001", "  ")).toBeNull();
  });
});

describe("handoffIsOpen", () => {
  const now = new Date("2026-10-21T12:00:00Z");

  it("is open before expiry when unused", () => {
    expect(
      handoffIsOpen(
        { usedAt: null, expiresAt: new Date("2026-10-21T12:00:01Z") },
        now,
      ),
    ).toBe(true);
  });

  it("is closed at the expiry instant and after use", () => {
    expect(
      handoffIsOpen(
        { usedAt: null, expiresAt: new Date("2026-10-21T12:00:00Z") },
        now,
      ),
    ).toBe(false);
    expect(
      handoffIsOpen(
        { usedAt: now, expiresAt: new Date("2026-10-21T12:01:00Z") },
        now,
      ),
    ).toBe(false);
  });
});

describe("parseGitHubIssues", () => {
  it("keeps issues and drops pull requests", () => {
    expect(
      parseGitHubIssues([
        {
          number: 12,
          title: "Seed times",
          html_url: "https://github.com/JamesSingleton/lane4-hq/issues/12",
          labels: [{ name: "bug" }, { name: 1 }, null],
        },
        {
          number: 13,
          title: "A pull request",
          html_url: "https://github.com/JamesSingleton/lane4-hq/pull/13",
          pull_request: { url: "https://api.github.com" },
        },
        { title: "missing number" },
      ]),
    ).toEqual([
      {
        number: 12,
        title: "Seed times",
        htmlUrl: "https://github.com/JamesSingleton/lane4-hq/issues/12",
        labels: ["bug"],
      },
    ]);
  });

  it("returns nothing for a non-array", () => {
    expect(parseGitHubIssues({ message: "nope" })).toEqual([]);
  });
});
