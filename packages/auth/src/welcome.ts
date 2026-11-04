/**
 * When a coach gets the welcome email. Never before their address is
 * verified: a sign-up with someone else's address (or a bot's) shouldn't make
 * Lane4 email that address, which also protects the sending reputation.
 */
export type WelcomeUser = {
  email: string;
  name: string;
  emailVerified: boolean;
  firstName?: unknown;
};

export type SendWelcome = (message: {
  to: string;
  props: { name: string };
}) => Promise<unknown>;

function welcome(user: WelcomeUser, send: SendWelcome) {
  return send({
    to: user.email,
    props: {
      name: typeof user.firstName === "string" ? user.firstName : user.name,
    },
  });
}

/**
 * Account created. Email/password sign-ups start unverified and wait for
 * `welcomeOnVerify`. An account that arrives verified (Google or Microsoft
 * sign-in, if enabled) is welcomed now.
 */
export async function welcomeOnCreate(user: WelcomeUser, send: SendWelcome) {
  if (user.emailVerified) await welcome(user, send);
}

/**
 * Address just verified. Better Auth calls this once per account, since a
 * second click on the link finds the account already verified. If email
 * changes are ever enabled (`user.changeEmail`), verifying a new address
 * calls it again and this needs a sent-once check.
 */
export async function welcomeOnVerify(user: WelcomeUser, send: SendWelcome) {
  await welcome(user, send);
}
