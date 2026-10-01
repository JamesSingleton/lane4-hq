import { describe, expect, it } from "vitest";
import {
  deviceClient,
  deviceClientName,
  isDeviceClient,
} from "../src/device-clients";

describe("device clients", () => {
  it("allows only known apps", () => {
    expect(isDeviceClient("lane4-desktop")).toBe(true);
    expect(isDeviceClient("toString")).toBe(false);
    expect(isDeviceClient("someone-else")).toBe(false);
  });

  it("names the app asking to sign in", () => {
    expect(deviceClientName("lane4-desktop")).toBe("Lane4 Meet Manager");
    expect(deviceClientName("someone-else")).toBe("An app");
    expect(deviceClientName(null)).toBe("An app");
  });

  it("hands approval back only to apps with a return link", () => {
    expect(deviceClient("lane4-desktop").returnUrl).toBe(
      "lane4://sign-in/approved",
    );
    expect(deviceClient("someone-else").returnUrl).toBeNull();
  });
});
