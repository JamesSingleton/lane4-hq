import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@lane4hq/ui/components/alert";
import { Button } from "@lane4hq/ui/components/button";
import { PageIntro, Section } from "@/components/section";
import { SupportForm } from "@/components/support-form";
import { pageMetadata } from "@/lib/metadata";
import { GITHUB_ISSUES_URL } from "@/lib/site";

export const metadata = pageMetadata(
  "Support",
  "Questions about club or high school meet files, billing, or an import that failed. Bugs can also go to GitHub.",
);

export default function SupportPage() {
  return (
    <>
      <PageIntro
        title="If a meet file will not import, send it here."
        description="Questions about entries, billing, and imports that failed belong here. Feature ideas and bugs can also go on GitHub."
      />
      <Section className="grid gap-10 pt-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <SupportForm />
        <div className="flex flex-col gap-4">
          <Alert>
            <AlertTitle>GitHub issues</AlertTitle>
            <AlertDescription>
              Public bugs and format fixtures are easier to track in the
              repository.
            </AlertDescription>
          </Alert>
          <Button
            variant="outline"
            className="press-scale w-fit"
            render={
              <a href={GITHUB_ISSUES_URL} target="_blank" rel="noreferrer" />
            }
            nativeButton={false}
          >
            Open an issue
          </Button>
        </div>
      </Section>
    </>
  );
}
