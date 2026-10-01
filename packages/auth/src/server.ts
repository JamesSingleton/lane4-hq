import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { writeAuditLog } from "@lane4hq/db/audit";
import { db } from "@lane4hq/db/client";
import {
  createDefaultSubscription,
  getTeamPlan,
  updateSubscription,
} from "@lane4hq/db/queries/billing";
import { ensureCurrentSeason } from "@lane4hq/db/queries/seasons";
import * as schema from "@lane4hq/db/schema";
import {
  sendCoachInvitation,
  sendCoachWelcome,
  sendInvitationAccepted,
  sendMemberJoined,
  sendRemovedFromTeam,
  sendResetPassword,
  sendRoleChanged,
  sendTeamWelcome,
  sendTwoFactorOtp,
  sendVerifyEmail,
} from "@lane4hq/emails";
import type { PlanTier } from "@lane4hq/swim-core/plans";
import { getPlanLimits } from "@lane4hq/swim-core/plans";
import {
  checkout,
  polar,
  portal,
  usage,
  webhooks,
} from "@polar-sh/better-auth";
import { Polar } from "@polar-sh/sdk";
import { betterAuth } from "better-auth";
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from "better-auth/api";
import { bearer } from "better-auth/plugins/bearer";
import { deviceAuthorization } from "better-auth/plugins/device-authorization";
import { organization } from "better-auth/plugins/organization";
import { twoFactor } from "better-auth/plugins/two-factor";
import { eq } from "drizzle-orm";
import {
  authAuditContext,
  authAuditEvent,
  isAuditedAuthPath,
} from "./audit-events";
import { isDeviceClient } from "./device-clients";
import { keys } from "./keys";
import { orgAc, orgRoles } from "./organization-ac";

function asPlan(value: unknown): PlanTier | null {
  if (value === "pro" || value === "enterprise" || value === "free") {
    return value;
  }
  return null;
}

const env = keys();

const polarAccessToken = env.POLAR_ACCESS_TOKEN?.trim() ?? "";
const polarConfigured = polarAccessToken.length > 0;

const polarProducts = [
  env.POLAR_PRODUCT_PRO
    ? { productId: env.POLAR_PRODUCT_PRO, slug: "pro" as const }
    : null,
  env.POLAR_PRODUCT_ENTERPRISE
    ? {
        productId: env.POLAR_PRODUCT_ENTERPRISE,
        slug: "enterprise" as const,
      }
    : null,
].filter(Boolean) as Array<{ productId: string; slug: "pro" | "enterprise" }>;

async function syncOrgPlanFromPolar(input: {
  organizationId?: string;
  plan?: PlanTier;
  status?: "active" | "canceled" | "past_due" | "trialing";
  polarCustomerId?: string;
  polarSubscriptionId?: string;
}) {
  if (!input.organizationId) return;
  if (input.plan) {
    await updateSubscription(input.organizationId, {
      plan: input.plan,
      status: input.status ?? "active",
      polarCustomerId: input.polarCustomerId,
      polarSubscriptionId: input.polarSubscriptionId,
    });
  } else if (input.status) {
    await updateSubscription(input.organizationId, {
      status: input.status,
      polarCustomerId: input.polarCustomerId,
      polarSubscriptionId: input.polarSubscriptionId,
    });
  }
}

const globalForAuth = globalThis as unknown as {
  polarClient: Polar | undefined;
  auth: ReturnType<typeof createAuth> | undefined;
};

function createPolarClient() {
  return new Polar({
    accessToken: polarAccessToken,
    server: env.POLAR_SERVER === "production" ? "production" : "sandbox",
  });
}

async function membershipLimitForOrg(
  organizationId: string | undefined,
): Promise<number> {
  const plan = organizationId ? await getTeamPlan(organizationId) : "free";
  const limit = getPlanLimits(plan).maxCoaches;
  if (limit === Number.POSITIVE_INFINITY) return 10_000;
  return limit;
}

const authSchema = {
  user: schema.user,
  session: schema.session,
  account: schema.account,
  verification: schema.verification,
  rateLimit: schema.rateLimit,
  twoFactor: schema.twoFactor,
  organization: schema.organization,
  member: schema.member,
  invitation: schema.invitation,
  deviceCode: schema.deviceCode,
  userRelations: schema.userRelations,
  sessionRelations: schema.sessionRelations,
  accountRelations: schema.accountRelations,
  twoFactorRelations: schema.twoFactorRelations,
  organizationRelations: schema.organizationRelations,
  memberRelations: schema.memberRelations,
  invitationRelations: schema.invitationRelations,
};

function createAuth(polarClient: Polar) {
  const trustedOriginsFromEnv = env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: authSchema,
    }),
    appName: "Lane4 HQ",
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    ...(trustedOriginsFromEnv?.length
      ? { trustedOrigins: trustedOriginsFromEnv }
      : process.env.NODE_ENV === "development"
        ? {
            trustedOrigins: async (request) => {
              const origin = request?.headers.get("origin");
              return origin ? [origin] : [];
            },
          }
        : {}),
    advanced: {
      database: {
        joins: true,
      },
      ipAddress: {
        ipAddressHeaders: ["x-forwarded-for", "x-real-ip"],
      },
    },
    user: {
      additionalFields: {
        firstName: { type: "string", required: false, input: true },
        lastName: { type: "string", required: false, input: true },
      },
    },
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
      },
      // Password, 2FA, and revoke-session still require a recent login.
      // Listing sessions on Account uses the DB, not listSessions (freshAge).
      freshAge: 60 * 60 * 24,
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendResetPassword({ user, url });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await sendVerifyEmail({ user, url });
      },
    },
    rateLimit: {
      // Neon-backed counters so limits hold across Vercel instances.
      storage: "database",
      customRules: {
        "/sign-up/email": { window: 60, max: 5 },
        "/sign-in/email": { window: 60, max: 10 },
        "/request-password-reset": { window: 60, max: 5 },
      },
    },
    socialProviders: {
      ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: env.GOOGLE_CLIENT_ID,
              clientSecret: env.GOOGLE_CLIENT_SECRET,
              accessType: "offline" as const,
              prompt: "select_account consent" as const,
              scope: ["openid", "email", "profile"],
            },
          }
        : {}),
      ...(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET
        ? {
            microsoft: {
              clientId: env.MICROSOFT_CLIENT_ID,
              clientSecret: env.MICROSOFT_CLIENT_SECRET,
              tenantId: env.MICROSOFT_TENANT_ID ?? "common",
              scope: ["openid", "email", "profile", "offline_access"],
            },
          }
        : {}),
    },
    hooks: {
      after: createAuthMiddleware(async (ctx) => {
        if (!isAuditedAuthPath(ctx.path)) return;
        if (ctx.context.returned instanceof APIError) return;
        const session =
          ctx.context.session ??
          (await getSessionFromCtx(ctx).catch(() => null));
        const event = authAuditEvent({
          path: ctx.path,
          userId: session?.user.id,
          body: ctx.body,
        });
        if (!event) return;
        try {
          await writeAuditLog({
            ...event,
            context: authAuditContext(ctx.headers),
          });
        } catch (error) {
          // A failed audit write must not undo a sign-in the user already saw succeed.
          console.error("Audit log write failed", error);
        }
      }),
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await sendCoachWelcome({
              to: user.email,
              props: {
                name:
                  typeof user.firstName === "string"
                    ? user.firstName
                    : user.name,
              },
            });
          },
        },
      },
    },
    plugins: [
      // Desktop and mobile apps send the session token as a bearer header.
      bearer(),
      // Desktop sign-in: the app shows a code, the user approves it at /device
      // in admin, and the app receives a session token.
      deviceAuthorization({
        verificationUri: "/device",
        expiresIn: "15m",
        interval: "5s",
        validateClient: isDeviceClient,
      }),
      twoFactor({
        issuer: "Lane4 HQ",
        otpOptions: {
          async sendOTP({ user, otp }) {
            await sendTwoFactorOtp({
              to: user.email,
              name: user.name,
              otp,
            });
          },
        },
      }),
      organization({
        ac: orgAc,
        roles: orgRoles,
        allowUserToCreateOrganization: async (user) => {
          return user.emailVerified === true;
        },
        creatorRole: "owner",
        invitationExpiresIn: 60 * 60 * 24 * 7,
        invitationLimit: 50,
        cancelPendingInvitationsOnReInvite: true,
        requireEmailVerificationOnInvitation: true,
        disableOrganizationDeletion: true,
        membershipLimit: async (_user, org) => membershipLimitForOrg(org?.id),
        sendInvitationEmail: async (data) => {
          await sendCoachInvitation({
            email: data.email,
            organization: data.organization,
            inviter: data.inviter,
            invitation: data.invitation,
            role: data.role ?? "assistant_coach",
          });
        },
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
          member: {
            additionalFields: {
              title: { type: "string", required: false },
            },
          },
        },
        organizationHooks: {
          afterCreateOrganization: async ({ organization, user }) => {
            await createDefaultSubscription(organization.id);
            await ensureCurrentSeason(organization.id);
            await sendTeamWelcome({
              to: user.email,
              props: {
                teamName: organization.name,
                teamId: organization.id,
                name: user.name,
              },
            });
          },
          afterAcceptInvitation: async ({ invitation, user, organization }) => {
            if (!invitation.inviterId) return;
            const [inviter] = await db
              .select({ email: schema.user.email })
              .from(schema.user)
              .where(eq(schema.user.id, invitation.inviterId))
              .limit(1);
            if (inviter?.email) {
              await sendInvitationAccepted(
                inviter.email,
                user.name,
                organization.name,
              );
            }
          },
          afterAddMember: async ({ member, user, organization }) => {
            if (member.role === "owner") return;
            const owners = await db
              .select({ email: schema.user.email })
              .from(schema.member)
              .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
              .where(eq(schema.member.organizationId, organization.id));
            for (const owner of owners.filter((o) => o.email !== user.email)) {
              await sendMemberJoined(owner.email, user.name, organization.name);
            }
          },
          afterUpdateMemberRole: async ({ member, user, organization }) => {
            await sendRoleChanged(
              user.email,
              user.name,
              organization.name,
              member.role,
            );
          },
          afterRemoveMember: async ({ user, organization }) => {
            await sendRemovedFromTeam(user.email, user.name, organization.name);
          },
        },
      }),
      polar({
        client: polarClient,
        // Requires a valid POLAR_ACCESS_TOKEN; otherwise signup fails with 401.
        createCustomerOnSignUp: polarConfigured,
        use: [
          checkout({
            products: polarProducts,
            successUrl: "/onboarding?checkout=success",
            authenticatedUsersOnly: true,
          }),
          portal(),
          usage(),
          webhooks({
            secret: env.POLAR_WEBHOOK_SECRET ?? "",
            onOrderPaid: async (payload) => {
              const data = payload.data as Record<string, unknown>;
              const metadata = (data.metadata ?? {}) as Record<string, string>;
              const organizationId =
                metadata.organizationId ??
                metadata.referenceId ??
                (data.externalCustomerId as string | undefined);
              const plan =
                asPlan(metadata.plan) ??
                (metadata.slug === "enterprise" ? "enterprise" : "pro");
              await syncOrgPlanFromPolar({
                organizationId,
                plan,
                status: "active",
                polarCustomerId: data.customerId as string | undefined,
                polarSubscriptionId: data.id as string | undefined,
              });
            },
            onSubscriptionActive: async (payload) => {
              const data = payload.data as Record<string, unknown>;
              const metadata = (data.metadata ?? {}) as Record<string, string>;
              const organizationId =
                metadata.organizationId ??
                metadata.referenceId ??
                (data.externalCustomerId as string | undefined);
              await syncOrgPlanFromPolar({
                organizationId,
                plan: asPlan(metadata.plan) ?? "pro",
                status: "active",
                polarCustomerId: data.customerId as string | undefined,
                polarSubscriptionId: data.id as string | undefined,
              });
            },
            onSubscriptionCanceled: async (payload) => {
              const data = payload.data as Record<string, unknown>;
              const metadata = (data.metadata ?? {}) as Record<string, string>;
              const organizationId =
                metadata.organizationId ??
                metadata.referenceId ??
                (data.externalCustomerId as string | undefined);
              await syncOrgPlanFromPolar({
                organizationId,
                plan: "free",
                status: "canceled",
              });
            },
          }),
        ],
      }),
    ],
  });
}

const polarClient = globalForAuth.polarClient ?? createPolarClient();
export const auth = globalForAuth.auth ?? createAuth(polarClient);

if (process.env.NODE_ENV !== "production") {
  globalForAuth.polarClient = polarClient;
  globalForAuth.auth = auth;
}

export type Session = typeof auth.$Infer.Session;
