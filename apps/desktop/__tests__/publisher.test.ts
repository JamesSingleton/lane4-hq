import { verifyHeat } from "@lane4hq/meet-engine/adjudicate";
import { addEvent, createMeet } from "@lane4hq/meet-engine/create";
import { addIndividualEntry } from "@lane4hq/meet-engine/entries";
import { heatKey } from "@lane4hq/meet-engine/model";
import { seedEvent } from "@lane4hq/meet-engine/seeding";
import { describe, expect, it } from "vitest";
import {
  applyPublishOutcomes,
  drainPublishQueue,
  newerRevisionNotice,
  OfflineError,
  publishCounts,
} from "../src/lib/publisher";

const NOW = new Date("2026-10-25T16:00:00Z");

function meetWithHeats(heats: number) {
  let n = 0;
  const newId = () => `id-${++n}`;
  let meet = createMeet(
    { name: "Pub", course: "SCY", poolLanes: 6 },
    { newId, now: NOW },
  );
  meet = addEvent(
    meet,
    { number: 1, distance: 50, stroke: "free", gender: "male" },
    { newId, now: NOW },
  );
  const eventId = meet.events[0]!.id;
  for (let i = 0; i < heats * 6; i++) {
    meet = addIndividualEntry(
      meet,
      {
        eventId,
        teamCode: "T",
        firstName: `A${i}`,
        lastName: "B",
        seedTimeMs: 25_000 + i * 100,
      },
      { newId, now: NOW },
    );
  }
  meet = seedEvent(meet, eventId, {}, NOW);
  for (let h = 1; h <= heats; h++)
    meet = verifyHeat(meet, { eventId, heat: h }, [], NOW);
  return { meet, eventId };
}

describe("publisher", () => {
  it("publishes, treats 409 as done, and records failures", async () => {
    const { meet, eventId } = meetWithHeats(3);
    const seen: string[] = [];
    const statuses = [201, 409, 422];
    const result = await drainPublishQueue(
      meet,
      async (key, body) => {
        seen.push(key);
        expect(JSON.parse(body).schema).toBe("lane4.heat-results/v1");
        return { status: statuses.shift()!, body: "bad lane" };
      },
      NOW.getTime(),
    );
    expect(result.offline).toBeNull();
    expect(result.notices).toEqual([newerRevisionNotice(1)]);
    expect(seen).toHaveLength(3);
    const next = applyPublishOutcomes(meet, result.outcomes, NOW);
    expect(publishCounts(next)).toEqual({
      published: 2,
      pending: 0,
      failed: 1,
    });
    expect(next.heatRecords[heatKey(eventId, 3)]!.publish.lastError).toBe(
      "HTTP 422: bad lane",
    );

    // Failed heats wait out their backoff.
    const early = await drainPublishQueue(
      next,
      async () => ({ status: 200, body: "" }),
      NOW.getTime() + 1_000,
    );
    expect(early.outcomes).toEqual([]);
    const later = await drainPublishQueue(
      next,
      async () => ({ status: 200, body: "" }),
      NOW.getTime() + 60_000,
    );
    expect(later.outcomes).toHaveLength(1);
  });

  it("stops at a 429 and leaves the heat queued", async () => {
    const { meet } = meetWithHeats(3);
    let calls = 0;
    const result = await drainPublishQueue(meet, async () => {
      calls++;
      return calls === 1
        ? { status: 201, body: "" }
        : { status: 429, body: "" };
    });
    expect(calls).toBe(2);
    expect(result.throttled).toBe(true);
    expect(result.outcomes).toHaveLength(1);
    expect(result.outcomes[0]!.ok).toBe(true);
  });

  it("stops at the first offline error and records thrown errors", async () => {
    const { meet } = meetWithHeats(2);
    let calls = 0;
    const offline = await drainPublishQueue(meet, async () => {
      calls++;
      throw new OfflineError("No route to host");
    });
    expect(offline).toEqual({
      outcomes: [],
      offline: "No route to host",
      throttled: false,
      notices: [],
    });
    expect(calls).toBe(1);

    const thrown = await drainPublishQueue(meet, async () => {
      throw new Error("Publishing isn't set up yet.");
    });
    expect(thrown.outcomes.every((o) => !o.ok)).toBe(true);
    const odd = await drainPublishQueue(meet, async () => {
      throw "string failure";
    });
    expect(odd.outcomes[0]).toMatchObject({
      ok: false,
      error: "string failure",
    });
    const empty = await drainPublishQueue(meet, async () => ({
      status: 500,
      body: "",
    }));
    expect(empty.outcomes[0]).toMatchObject({ error: "HTTP 500" });
  });

  it("names a newer stored revision in plain language", () => {
    expect(newerRevisionNotice(1)).toBe(
      "Lane4 already has a newer revision of this heat, so this copy was not stored.",
    );
    expect(newerRevisionNotice(2)).toBe(
      "Lane4 already has a newer revision of 2 heats, so those copies were not stored.",
    );
  });

  it("uses the wall clock by default", () => {
    const { meet } = meetWithHeats(1);
    expect(
      applyPublishOutcomes(meet, [{ key: "missing", ok: false, error: "x" }]),
    ).toBe(meet);
  });
});
