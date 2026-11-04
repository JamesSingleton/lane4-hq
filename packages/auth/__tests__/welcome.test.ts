import { describe, expect, it, vi } from "vitest";
import { welcomeOnCreate, welcomeOnVerify } from "../src/welcome";

const coach = {
  email: "coach@example.com",
  name: "Pat Coach",
  emailVerified: false,
  firstName: "Pat",
};

describe("welcome email", () => {
  it("waits for an email/password sign-up to verify", async () => {
    const send = vi.fn(async () => undefined);
    await welcomeOnCreate(coach, send);
    expect(send).not.toHaveBeenCalled();
    await welcomeOnVerify({ ...coach, emailVerified: true }, send);
    expect(send).toHaveBeenCalledWith({
      to: "coach@example.com",
      props: { name: "Pat" },
    });
  });

  it("welcomes an account that arrives verified right away", async () => {
    const send = vi.fn(async () => undefined);
    await welcomeOnCreate(
      { ...coach, emailVerified: true, firstName: undefined },
      send,
    );
    expect(send).toHaveBeenCalledWith({
      to: "coach@example.com",
      props: { name: "Pat Coach" },
    });
  });
});
