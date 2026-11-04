import { B, EmailButton, EmailLayout, P, Steps } from "../_layout";

export interface TeamWelcomeProps {
  name: string;
  teamName: string;
  teamId: string;
  baseUrl: string;
}

export default function TeamWelcome({
  name,
  teamName,
  teamId,
  baseUrl,
}: TeamWelcomeProps) {
  const teamUrl = `${baseUrl}/team/${teamId}`;
  return (
    <EmailLayout
      preview={`${teamName} is set up on Lane4 HQ. Here's what to do next.`}
      eyebrow="Team"
      heading={`${teamName} is ready`}
      reason={`You're getting this because you created ${teamName} on Lane4 HQ.`}
    >
      <P>
        Hi {name}, <B>{teamName}</B> is set up on the Free plan. Next:
      </P>
      <Steps
        items={[
          {
            title: "Add your swimmers",
            detail: "Import your roster or add swimmers one at a time.",
          },
          {
            title: "Connect USA Swimming",
            detail: "Optional. Keeps your roster matched to registrations.",
          },
          {
            title: "Invite your coaches",
            detail: "Give assistants access to attendance and lineups.",
          },
        ]}
      />
      <EmailButton href={teamUrl}>Open {teamName}</EmailButton>
    </EmailLayout>
  );
}

TeamWelcome.PreviewProps = {
  name: "Jane",
  teamName: "FAST Swim Club",
  teamId: "team_123",
  baseUrl: "https://admin.lane4hq.com",
} satisfies TeamWelcomeProps;
