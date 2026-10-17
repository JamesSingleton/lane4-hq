import { polarClient } from "@polar-sh/better-auth/client";
import {
  deviceAuthorizationClient,
  inferAdditionalFields,
  organizationClient,
  twoFactorClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { orgAc, orgRoles } from "./organization-ac";
import type { auth } from "./server";

function resolveAuthBaseURL() {
  // Same-origin in the browser so sign-in works on LAN IPs, not only localhost.
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return process.env.NEXT_PUBLIC_BETTER_AUTH_URL;
}

const authBaseURL = resolveAuthBaseURL();

export const authClient = createAuthClient({
  ...(authBaseURL ? { baseURL: authBaseURL } : {}),
  plugins: [
    inferAdditionalFields<typeof auth>(),
    organizationClient({
      ac: orgAc,
      roles: orgRoles,
      schema: {
        organization: {
          additionalFields: {
            teamCode: { type: "string", required: false, input: true },
            lscCode: { type: "string", required: false, input: true },
            teamType: { type: "string", required: false, input: true },
            addressLine1: { type: "string", required: false, input: true },
            addressLine2: { type: "string", required: false, input: true },
            city: { type: "string", required: false, input: true },
            region: { type: "string", required: false, input: true },
            postalCode: { type: "string", required: false, input: true },
            country: { type: "string", required: false, input: true },
          },
        },
      },
    }),
    polarClient(),
    deviceAuthorizationClient(),
    twoFactorClient({
      onTwoFactorRedirect() {
        window.location.href = "/2fa";
      },
    }),
  ],
});

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  organization,
  twoFactor,
  device,
  changePassword,
  updateUser,
  requestPasswordReset,
  resetPassword,
  sendVerificationEmail,
  revokeSession,
  revokeSessions,
} = authClient;
