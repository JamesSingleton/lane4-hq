import { B, EmailLayout, P, Stats } from "../_layout";

export interface MeetImportCompleteProps {
  teamName: string;
  meetName: string;
  eventsCount: number;
  entriesCount: number;
}

export default function MeetImportComplete({
  teamName,
  meetName,
  eventsCount,
  entriesCount,
}: MeetImportCompleteProps) {
  return (
    <EmailLayout
      preview={`${meetName} imported: ${eventsCount} events, ${entriesCount} entries.`}
      eyebrow="Meet import"
      status={{ tone: "ok", label: "Imported" }}
      heading={`${meetName} is imported`}
      reason={`You're getting this because you imported a meet file for ${teamName}.`}
    >
      <P>
        It&apos;s on <B>{teamName}</B>&apos;s schedule and ready for entries.
      </P>
      <Stats
        items={[
          { label: "Events", value: eventsCount },
          { label: "Entries", value: entriesCount },
        ]}
      />
    </EmailLayout>
  );
}

MeetImportComplete.PreviewProps = {
  teamName: "FAST Swim Club",
  meetName: "Fall Invitational",
  eventsCount: 24,
  entriesCount: 118,
} satisfies MeetImportCompleteProps;
