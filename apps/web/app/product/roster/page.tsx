import { FeatureBlock, FeaturePage } from "@/components/feature-page";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata(
  "Roster",
  "Import CL2, HY3, SD3, or CSV, roll returning swimmers into the new season, and keep club and high school fields apart.",
);

export default function RosterProductPage() {
  return (
    <FeaturePage
      title="Roll returning swimmers into next season without retyping birthdays."
      description="Club and high school stay separate, on the same login. Start a new season and bring the roster forward."
      shot="roster"
    >
      <FeatureBlock title="What you record">
        <p>
          Name, date of birth, and gender are the core. A club team can store a
          USA Swimming ID on the membership. A high school team stores class
          year — freshman through senior — on the season. A college team can
          record academic standing and eligibility status on the season.
          Training groups sit on the season, so senior, age group, or varsity
          can change without rewriting the person.
        </p>
      </FeatureBlock>
      <FeatureBlock title="Import and export">
        <p>
          Bring a CSV, or a CL2, HY3, or SD3 roster pack. Row-level errors stay
          on the preview. Export CSV when staff need a snapshot.
        </p>
      </FeatureBlock>
      <FeatureBlock title="Club and high school fields">
        <p>
          A club roster can store a USA Swimming ID on the membership. SafeSport
          training gates minor contact and medical fields. When training or a
          minor&apos;s acknowledgment is missing, the dashboard says so. A high
          school roster uses class year on the season.
        </p>
      </FeatureBlock>
    </FeaturePage>
  );
}
