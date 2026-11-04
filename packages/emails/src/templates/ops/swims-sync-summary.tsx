import { B, EmailLayout, P, Stats } from "../_layout";

export interface SwimsSyncSummaryProps {
  teamName: string;
  added: number;
  updated: number;
  removed: number;
}

export default function SwimsSyncSummary({
  teamName,
  added,
  updated,
  removed,
}: SwimsSyncSummaryProps) {
  return (
    <EmailLayout
      preview={`USA Swimming sync for ${teamName}: ${added} added, ${updated} updated, ${removed} removed.`}
      eyebrow="USA Swimming"
      status={{ tone: "ok", label: "Synced" }}
      heading="Your USA Swimming sync finished"
      reason={`You're getting this because ${teamName} syncs its roster with USA Swimming.`}
    >
      <P>
        <B>{teamName}</B>&apos;s roster now matches USA Swimming.
      </P>
      <Stats
        items={[
          { label: "Added", value: added },
          { label: "Updated", value: updated },
          { label: "Removed", value: removed },
        ]}
      />
    </EmailLayout>
  );
}

SwimsSyncSummary.PreviewProps = {
  teamName: "FAST Swim Club",
  added: 3,
  updated: 12,
  removed: 1,
} satisfies SwimsSyncSummaryProps;
