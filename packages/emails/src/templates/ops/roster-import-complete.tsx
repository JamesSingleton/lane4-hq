import { B, EmailLayout, P, Stats } from "../_layout";

export interface RosterImportCompleteProps {
  teamName: string;
  added: number;
  updated: number;
}

export default function RosterImportComplete({
  teamName,
  added,
  updated,
}: RosterImportCompleteProps) {
  return (
    <EmailLayout
      preview={`Roster import for ${teamName}: ${added} added, ${updated} updated.`}
      eyebrow="Roster import"
      status={{ tone: "ok", label: "Complete" }}
      heading="Your roster is in"
      reason={`You're getting this because you imported a roster file for ${teamName}.`}
    >
      <P>
        The roster file for <B>{teamName}</B> finished importing.
      </P>
      <Stats
        items={[
          { label: "Swimmers added", value: added },
          { label: "Updated", value: updated },
        ]}
      />
    </EmailLayout>
  );
}

RosterImportComplete.PreviewProps = {
  teamName: "FAST Swim Club",
  added: 42,
  updated: 7,
} satisfies RosterImportCompleteProps;
