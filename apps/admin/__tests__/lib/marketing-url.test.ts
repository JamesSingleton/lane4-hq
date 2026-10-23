import { describe, expect, it } from "vitest";
import { getMarketingUrl } from "@/lib/marketing-url";

describe("getMarketingUrl", () => {
  it("uses NEXT_PUBLIC_MARKETING_URL when set", () => {
    const original = process.env.NEXT_PUBLIC_MARKETING_URL;
    process.env.NEXT_PUBLIC_MARKETING_URL = "https://www.lane4hq.com";
    expect(getMarketingUrl()).toBe("https://www.lane4hq.com");
    process.env.NEXT_PUBLIC_MARKETING_URL = original;
  });

  it("defaults to local web app", () => {
    const original = process.env.NEXT_PUBLIC_MARKETING_URL;
    delete process.env.NEXT_PUBLIC_MARKETING_URL;
    expect(getMarketingUrl()).toBe("http://localhost:3000");
    process.env.NEXT_PUBLIC_MARKETING_URL = original;
  });

  it("uses the production site when no marketing URL is configured", () => {
    const url = process.env.NEXT_PUBLIC_MARKETING_URL;
    const env = process.env.NODE_ENV;
    delete process.env.NEXT_PUBLIC_MARKETING_URL;
    process.env.NODE_ENV = "production";
    expect(getMarketingUrl()).toBe("https://www.lane4hq.com");
    process.env.NODE_ENV = env;
    if (url === undefined) delete process.env.NEXT_PUBLIC_MARKETING_URL;
    else process.env.NEXT_PUBLIC_MARKETING_URL = url;
  });
});
