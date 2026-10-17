import { FeatureBlock, FeaturePage } from "@/components/feature-page";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata(
  "Calendar",
  "Team calendar for practices, duals, and invitationals, plus attendance, a recurring schedule, and Google, Outlook, or ICS sync.",
);

export default function CalendarProductPage() {
  return (
    <FeaturePage
      title="Keep practices, duals, and invitationals on one team calendar."
      description="Attendance lives on that calendar too. Subscribe with an ICS feed, or connect Google Calendar or Outlook."
      shot="calendar"
    >
      <FeatureBlock title="Schedule">
        <p>
          Add a single session or a recurring practice. Meets you created or
          imported show on the same calendar, including the entry deadline when
          the host file had one.
        </p>
      </FeatureBlock>
      <FeatureBlock title="Attendance">
        <p>
          Take roll from the calendar or the attendance list. The history stays
          with this team, so you can see who has been on deck before you name a
          relay.
        </p>
      </FeatureBlock>
      <FeatureBlock title="Sync">
        <p>
          Connect Google Calendar or Outlook, or share a team ICS feed. The feed
          belongs to that team. Switching from the club to the high school does
          not mix the two schedules.
        </p>
      </FeatureBlock>
    </FeaturePage>
  );
}
