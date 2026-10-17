import { PageIntro, Section } from "@/components/section";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata(
  "Privacy",
  "How Lane4 HQ handles account, roster, and meet data for club and high school teams.",
);

export default function PrivacyPage() {
  return (
    <>
      <PageIntro
        title="Privacy"
        description="Lane4 HQ stores the account and team data the coach workspace needs. We do not sell roster data."
      />
      <Section className="flex max-w-2xl flex-col gap-6 pt-0 text-muted-foreground">
        <p>
          Account data includes name, email, authentication credentials, and
          team membership. Team data includes roster fields, meet lineups,
          results, workouts, attendance, and files you import or export.
        </p>
        <p>
          Club teams may store USA Swimming IDs. Where SafeSport applies,
          training records gate access to minor contact and medical fields.
          Those fields are not shown to coaches who have not completed the
          required check. Storing a USA Swimming ID does not mean Lane4 HQ is
          certified or approved by USA Swimming.
        </p>
        <p>
          Processors include our database, object storage, email, calendar sync,
          and billing providers. We keep data for as long as the team account
          exists, then delete or anonymize it when the account is closed, except
          where we must retain records for law or billing disputes.
        </p>
        <p>
          Contact support if you need a copy of your team’s data or want an
          account deleted.
        </p>
      </Section>
    </>
  );
}
