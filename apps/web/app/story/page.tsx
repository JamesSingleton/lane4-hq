import { Separator } from "@lane4hq/ui/components/separator";
import { MarketingCta } from "@/components/marketing-cta";
import { PageIntro } from "@/components/section";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata(
  "Story",
  "Why Lane4 HQ exists: the meet-week work of retyping seeds, chasing entries, and pasting results into a spreadsheet.",
);

export default function StoryPage() {
  return (
    <>
      <PageIntro
        title="The swim team software I wish I had 10 years ago."
        description="I coached a club team and a high school team. Seeds lived on a printout. Best times lived in a spreadsheet."
      />
      <section className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pb-16 text-muted-foreground md:px-6">
        <p>
          The night before entries were due, I retyped seed times off a
          printout. Hy-Tek Team Manager had the roster. A spreadsheet had the
          best times. A whiteboard had who was actually going. None of them
          matched by the time I exported the HY3.
        </p>
        <p>
          Sunday I pasted the results into Excel so I could see who dropped. JO
          and sectionals lived in my head until I had time to look them up. Then
          I did the week again for the other program: the Saturday invitational,
          or the Tuesday dual, with class year and a different set of event
          limits.
        </p>
        <p>
          Lane4 HQ is where I wanted that work to live. Best times fill the
          seeds. The lineup is the meet, in the order it is swum. You export the
          file the host asked for, and Sunday&apos;s results come back next to
          previous best and a cut you entered. One login when the club and the
          high school are both yours. Each team keeps its own times.
        </p>
      </section>
      <Separator className="mx-auto max-w-6xl" />
      <MarketingCta />
    </>
  );
}
