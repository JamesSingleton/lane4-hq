import { FeatureBlock, FeaturePage } from "@/components/feature-page";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata(
  "Progression",
  "Best times by course, season charts, CSV import, and top times scoped to the current team.",
);

export default function ProgressionProductPage() {
  return (
    <FeaturePage
      title="Keep best times with the club or the high school you have open."
      description="Season charts belong to that team. An athlete who also swims for your other program keeps a separate set of times there."
      shot="progression"
    >
      <FeatureBlock title="Best times">
        <p>
          Course and event, with the meet name and date after a results import.
          Add a time trial by hand when the file has not arrived. Load history
          from CSV at the start of the season.
        </p>
      </FeatureBlock>
      <FeatureBlock title="After the meet">
        <p>
          A faster swim from a results import updates the best time here. On the
          meet, you can still turn on a time standard to see who went under.
        </p>
      </FeatureBlock>
      <FeatureBlock title="Standards and top times">
        <p>
          Compare times with a standard you entered: a JO or sectional cut, a
          high school standard, or a team record you typed in. Filter
          progression by training group when you only want one cohort. Team top
          times by event are there when you are staffing a relay.
        </p>
      </FeatureBlock>
    </FeaturePage>
  );
}
