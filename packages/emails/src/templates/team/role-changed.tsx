import { B, Details, EmailLayout, P, roleLabel } from "../_layout";

export interface RoleChangedProps {
  name: string;
  teamName: string;
  newRole: string;
}

export default function RoleChanged({
  name,
  teamName,
  newRole,
}: RoleChangedProps) {
  return (
    <EmailLayout
      preview={`You're now ${roleLabel(newRole).toLowerCase()} on ${teamName}.`}
      eyebrow="Team"
      heading="Your role changed"
      reason={`You're getting this because your access to ${teamName} on Lane4 HQ changed.`}
    >
      <P>
        Hi {name}, your role on <B>{teamName}</B> was updated.
      </P>
      <Details
        items={[
          { label: "Team", value: teamName },
          { label: "New role", value: roleLabel(newRole) },
        ]}
      />
      <P>If this looks wrong, ask your team&apos;s owner or head coach.</P>
    </EmailLayout>
  );
}

RoleChanged.PreviewProps = {
  name: "Alex",
  teamName: "FAST Swim Club",
  newRole: "head_coach",
} satisfies RoleChangedProps;
