import { FeatureBlock, FeaturePage } from "@/components/feature-page";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata(
  "Workouts",
  "Write the practice on the same calendar as the meet, and open a saved set from the team list.",
);

export default function WorkoutsProductPage() {
  return (
    <FeaturePage
      title="Write the set on the same calendar as the meet."
      description="Workouts belong to the team you have open. A club set stays on the club calendar."
      shot="workouts"
    >
      <FeatureBlock title="Write the set">
        <p>
          Build a workout, save it, and open it later from the team list. A
          sidebar shortcut opens a blank set. If you want a starting draft,
          suggest a practice from a focus and a duration. Those drafts share a
          monthly pool with relay-order suggestions.
        </p>
      </FeatureBlock>
      <FeatureBlock title="On the calendar">
        <p>
          Workouts sit beside practices and meets, so the week is one calendar.
          Attendance for those sessions is on the same calendar.
        </p>
      </FeatureBlock>
    </FeaturePage>
  );
}
