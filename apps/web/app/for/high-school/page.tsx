import { FeatureBlock, FeaturePage } from "@/components/feature-page";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata(
  "For high school teams",
  "High school duals and invitationals: class year, JV and Varsity, and association event limits, with seeds filled from best times.",
);

export default function HighSchoolPage() {
  return (
    <FeaturePage
      title="Enter the dual with class year and your association's limits already on the lineup."
      description="Duals and invitationals use the same entry board. Freshman through senior, JV and Varsity from the host file, and your association's scoring caps are checked before you export."
    >
      <FeatureBlock title="Roster">
        <p>
          Freshman through senior lives on the season. You can add a swimmer
          without a USA Swimming ID. Seeds still fill from that team&apos;s best
          times.
        </p>
      </FeatureBlock>
      <FeatureBlock title="Meets">
        <p>
          Duals and invitationals keep the JV and Varsity events from the host
          file. Association caps are your scoring limits: max names in an
          individual event, and max relay teams. Entry limits from the file —
          individual, relay, and combined — are checked before you export.
        </p>
      </FeatureBlock>
      <FeatureBlock title="Beside the club team">
        <p>
          If you also coach a club, switch teams without signing out. Times and
          entries stay with each team. After a meet, you can turn on a high
          school cut you entered, the same way a club coach turns on JO or
          sectionals.
        </p>
      </FeatureBlock>
    </FeaturePage>
  );
}
