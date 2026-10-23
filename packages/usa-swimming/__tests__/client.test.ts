import { afterEach, describe, expect, it, vi } from "vitest";

async function loadClient() {
  vi.resetModules();
  return import("../src/client");
}

function jsonResponse(
  body: unknown,
  ok = true,
  status = 200,
  statusText = "OK",
) {
  return {
    ok,
    status,
    statusText,
    json: async () => body,
  };
}

describe("SwimsClient", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("refuses to call SWIMS without a vendor thumbprint", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    delete process.env.USA_SWIMMING_VENDOR_THUMBPRINT;
    const unset = await loadClient();
    await expect(unset.createSwimsClient().getVendorClubs()).rejects.toThrow(
      "USA Swimming sync is not available right now.",
    );
    vi.stubEnv("USA_SWIMMING_VENDOR_THUMBPRINT", "");
    const blank = await loadClient();
    await expect(blank.createSwimsClient().getVendorClubs()).rejects.toThrow(
      "USA Swimming sync is not available right now.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the documented host and returns clubs, members, and a registration link", async () => {
    vi.stubEnv("USA_SWIMMING_VENDOR_THUMBPRINT", "thumb");
    delete process.env.USA_SWIMMING_API_URL;
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("generateregistrationlink")) {
        return jsonResponse({ url: "https://reg.test/join" });
      }
      if (url.includes("memberId=")) {
        return jsonResponse({ memberId: "m1", firstName: "Ada" });
      }
      if (url.includes("/club/")) return jsonResponse([{ memberId: "m1" }]);
      return jsonResponse([{ clubId: "c1" }]);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { createSwimsClient } = await loadClient();
    const client = createSwimsClient();

    await expect(client.getVendorClubs()).resolves.toEqual([{ clubId: "c1" }]);
    await expect(
      client.getMemberDetails("club 1", "member 1"),
    ).resolves.toEqual({ memberId: "m1", firstName: "Ada" });
    await expect(client.getClubMembers("club 1")).resolves.toEqual([
      { memberId: "m1" },
    ]);
    await expect(client.generateRegistrationLink("club 1")).resolves.toBe(
      "https://reg.test/join",
    );

    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls[0]).toBe(
      "https://thirdparty-api-documentation.swimsmember.org/swims/getVendorClubs/vendor",
    );
    expect(urls[1]).toContain(
      "/swims/getMemberDetails/club 1/?memberId=member 1",
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: { "X-Vendor-Thumbprint": "thumb" },
    });
  });

  it("uses a configured host and surfaces HTTP errors", async () => {
    vi.stubEnv("USA_SWIMMING_VENDOR_THUMBPRINT", "thumb");
    vi.stubEnv("USA_SWIMMING_API_URL", "https://swims.test");
    const fetchMock = vi.fn(async () =>
      jsonResponse(null, false, 503, "Unavailable"),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { createSwimsClient } = await loadClient();
    await expect(createSwimsClient().getVendorClubs()).rejects.toThrow(
      "USA Swimming could not be reached.",
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://swims.test/swims/getVendorClubs/vendor",
    );
  });
});
