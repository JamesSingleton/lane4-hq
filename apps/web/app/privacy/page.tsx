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
        <h2 className="text-foreground text-xl font-semibold">
          Product analytics
        </h2>
        <p>
          Lane4 uses PostHog to see how coaches use the product and when an
          export or import fails. Roster data is for minors, so each event is an
          allowlist. A value that is not on the list is dropped before it is
          sent. Analytics stays off when that app has no PostHog project token.
        </p>
        <p>
          Every event is tagged with the app (web, admin, api, or desktop), the
          environment, and the release. Admin events also include internal so
          they can be filtered out of product dashboards.
        </p>
        <ul className="list-disc pl-5">
          <li>signed_up, when a coach creates an account</li>
          <li>team_created, when a coach creates a team</li>
          <li>meet_created, when a meet is created</li>
          <li>roster_imported, with the file format</li>
          <li>entries_exported, with the file format</li>
          <li>results_imported, with the file format</li>
          <li>
            export_failed and import_failed, with the format and an error code
          </li>
        </ul>
        <p>
          The format is one of hy3, cl2, sd3, sdif, csv, zip, ev3, hyv, xls,
          xlsx, pdf, or unknown. The error code is one of unauthorized,
          forbidden, not_found, validation, unsupported, or internal.
        </p>
        <p>
          Page views on this site and in the coach workspace send the path only.
          The query string and the hash are removed. Session replay on those
          sites masks every input and all text. Autocapture is off, so a button
          labeled with a swimmer&apos;s name is not sent. The desktop app does
          not record sessions. Feature flags can be read by the apps. No flag
          currently changes product behavior.
        </p>
        <p>
          The API sends a log for each request except health checks. The log has
          the request id, route, status, and duration. It does not include the
          request body. Server exceptions send the error&apos;s name, the route,
          and the status. The desktop app holds events while it is offline and
          sends them when the connection returns. A crash report sends the
          source file&apos;s base name and the line number.
        </p>
        <p>Lane4 does not send:</p>
        <ul className="list-disc pl-5">
          <li>Coach or swimmer names, email addresses, or phone numbers</li>
          <li>Birthdates, ages, or USA Swimming member IDs</li>
          <li>Seed times, result times, or places</li>
          <li>Request or response bodies</li>
          <li>File contents, file names, meet names, or team names</li>
          <li>Error messages, which often quote a swimmer</li>
          <li>The page title, or search parameters on a page view</li>
        </ul>
        <p>
          A person is identified by their Lane4 user id only. A team is grouped
          by team id only.
        </p>
      </Section>
    </>
  );
}
