import { EmailButton, EmailLayout, P, Steps } from "../_layout";

export interface CoachWelcomeProps {
  name: string;
  dashboardUrl: string;
}

export default function CoachWelcome({
  name,
  dashboardUrl,
}: CoachWelcomeProps) {
  return (
    <EmailLayout
      preview="Your Lane4 HQ account is ready. Here's how to get your team set up."
      eyebrow="Welcome"
      heading={`Welcome to Lane4, ${name}`}
      reason="You're getting this because you just confirmed your Lane4 HQ account."
    >
      <P>Your account is ready. Three steps to get your team going:</P>
      <Steps
        items={[
          {
            title: "Create your team",
            detail: "Or accept an invitation from your head coach.",
          },
          {
            title: "Bring in your roster",
            detail:
              "Import a Team Manager, SDIF, or CSV file, or add swimmers by hand.",
          },
          {
            title: "Add your first meet",
            detail:
              "Load the host's meet file, enter your swimmers, and send the entries back.",
          },
        ]}
      />
      <EmailButton href={dashboardUrl}>Set up your team</EmailButton>
    </EmailLayout>
  );
}

CoachWelcome.PreviewProps = {
  name: "Jane",
  dashboardUrl: "https://admin.lane4hq.com/onboarding",
} satisfies CoachWelcomeProps;
