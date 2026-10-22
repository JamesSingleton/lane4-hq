import { impersonatorId } from "@lane4hq/auth/impersonation";
import { getSession } from "@lane4hq/auth/session";
import { getMember, requireTeamMember } from "@lane4hq/db/authz";
import { db } from "@lane4hq/db/client";
import { getNotificationPreferences } from "@lane4hq/db/queries/notifications";
import { getUserPreferences } from "@lane4hq/db/queries/preferences";
import { listActiveSessionsForUser } from "@lane4hq/db/queries/sessions";
import { user } from "@lane4hq/db/schema";
import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { EmailVerificationBanner } from "@/components/auth/email-verification-banner";
import { SettingsSection } from "../settings-section";
import { AccountAppearanceForm } from "./account-appearance-form";
import { AccountNotificationsForm } from "./account-notifications-form";
import { AccountProfileForm } from "./account-profile-form";
import { AccountSecurityForm } from "./account-security-form";
import {
  AccountSessionsForm,
  type ActiveSession,
} from "./account-sessions-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ teamId: string }>;
}): Promise<Metadata> {
  const { teamId } = await params;
  return {
    title: "Account",
    description: "Profile, security, notifications, and appearance.",
    alternates: { canonical: `/team/${teamId}/settings/account` },
  };
}

export default async function AccountSettingsPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const session = await getSession();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  await requireTeamMember(session.user.id, teamId);
  const viewingAsUser = impersonatorId(session.session) !== null;

  const [profile, membership, prefs, userPrefs, activeSessions] =
    await Promise.all([
      db
        .select({
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          image: user.image,
          emailVerified: user.emailVerified,
          twoFactorEnabled: user.twoFactorEnabled,
        })
        .from(user)
        .where(eq(user.id, session.user.id))
        .limit(1)
        .then((rows) => rows[0]),
      getMember(session.user.id, teamId),
      getNotificationPreferences(session.user.id),
      getUserPreferences(session.user.id),
      listActiveSessionsForUser(session.user.id),
    ]);

  const serializedSessions: ActiveSession[] = activeSessions.map((s) => ({
    id: s.id,
    token: s.token,
    userAgent: s.userAgent ?? null,
    ipAddress: s.ipAddress ?? null,
    createdAt: s.createdAt.toISOString(),
    expiresAt: s.expiresAt.toISOString(),
  }));

  return (
    <div className="flex flex-col">
      {profile?.email && profile.emailVerified === false ? (
        <div className="mb-6 px-1">
          <EmailVerificationBanner
            email={profile.email}
            emailVerified={profile.emailVerified}
          />
        </div>
      ) : null}

      <SettingsSection
        title="Profile"
        description="Your name, photo, and title on this team."
      >
        <AccountProfileForm
          teamId={teamId}
          firstName={profile?.firstName ?? ""}
          lastName={profile?.lastName ?? ""}
          email={profile?.email ?? session.user.email}
          title={membership?.title ?? ""}
          image={profile?.image ?? null}
        />
      </SettingsSection>

      <SettingsSection
        title="Security"
        description={
          viewingAsUser
            ? "Password and two-factor changes stay on the real sign-in. Stop from the banner first."
            : "Password and two-factor authentication."
        }
        showSeparator
      >
        <div
          className={
            viewingAsUser ? "pointer-events-none opacity-60" : undefined
          }
        >
          <AccountSecurityForm
            twoFactorEnabled={profile?.twoFactorEnabled ?? false}
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title="Sessions"
        description={
          viewingAsUser
            ? "Ending sessions stays on the real sign-in. Stop from the banner first."
            : "Manage where you're signed in."
        }
        showSeparator
      >
        <div
          className={
            viewingAsUser ? "pointer-events-none opacity-60" : undefined
          }
        >
          <AccountSessionsForm
            sessions={serializedSessions}
            currentSessionId={session.session.id}
            currentSessionToken={session.session.token}
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title="Appearance"
        description="Choose how Lane4 HQ looks across your devices."
        showSeparator
      >
        <AccountAppearanceForm teamId={teamId} initialTheme={userPrefs.theme} />
      </SettingsSection>

      <SettingsSection
        title="Notifications"
        description="Choose which email notices you want to receive. Email senders will respect these preferences as they are wired up."
        showSeparator
      >
        <AccountNotificationsForm
          teamId={teamId}
          initial={{
            meetReminders: prefs.meetReminders,
            inviteEmails: prefs.inviteEmails,
            safesportReminders: prefs.safesportReminders,
            billingEmails: prefs.billingEmails,
            productUpdates: prefs.productUpdates,
          }}
        />
      </SettingsSection>
    </div>
  );
}
