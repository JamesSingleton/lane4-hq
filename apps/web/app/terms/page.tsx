import { PageIntro, Section } from "@/components/section";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata(
  "Terms",
  "Terms for using the Lane4 HQ coach workspace for club and high school teams.",
);

export default function TermsPage() {
  return (
    <>
      <PageIntro
        title="Terms"
        description="The product is a coach workspace for roster, entries, and results. You stay responsible for the accuracy of entries you send to a meet."
      />
      <Section className="flex max-w-2xl flex-col gap-6 pt-0 text-muted-foreground">
        <p>
          By creating an account you may use Lane4 HQ to manage roster, meets,
          workouts, calendar, and times for teams you belong to. Team owners
          control seats, billing, and who can import or export meet files.
        </p>
        <p>
          You own the data you enter. You grant us a license to host and process
          it so the product can run. Entry files you export are your submissions
          to whoever is putting the meet on. We do not accept entries on a
          host&apos;s behalf. Lane4 HQ is not certified or approved by USA
          Swimming, and storing a USA Swimming ID does not make an entry
          official with USA Swimming.
        </p>
        <p>
          Free, Pro, and Enterprise limits are described on the pricing page and
          in the app. We may change the product, including retiring features,
          with notice when a change removes a paid capability.
        </p>
        <p>
          The software is provided as-is. We are not liable for a meet rejecting
          a file, a missed entry deadline, or meet results you import. Do not
          use the service if you need a parent portal, dues collection, or a
          timing console. Those are out of scope.
        </p>
      </Section>
    </>
  );
}
