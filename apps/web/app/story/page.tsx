import { cn } from "@lane4hq/ui/lib/utils";
import { MarketingCta } from "@/components/marketing-cta";
import { siteContainer } from "@/components/section";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata(
  "Story",
  "Why Lane4 HQ exists: the meet-week work of retyping seeds, chasing entries, and pasting results into a spreadsheet.",
);

export default function StoryPage() {
  return (
    <>
      <section
        className={cn(
          siteContainer,
          "grid gap-8 pt-12 pb-16 md:pt-16 lg:grid-cols-[minmax(0,22rem)_minmax(0,40rem)] lg:gap-16",
        )}
      >
        <div className="flex flex-col gap-4">
          <h1 className="font-display text-5xl font-semibold tracking-[-0.035em] text-pretty md:text-6xl md:leading-[0.98]">
            The swim team software I wish I had 10 years ago.
          </h1>
          <p className="text-lg leading-relaxed text-muted-foreground text-pretty">
            I coached a club team and a high school team. Seeds lived on a
            printout. Best times lived in a spreadsheet.
          </p>
        </div>
        <div className="flex flex-col gap-6 text-lg leading-relaxed">
          <p>
            The night before entries were due, I retyped seed times off a
            printout. Hy-Tek Team Manager had the roster. A spreadsheet had the
            best times. A whiteboard had who was actually going. None of them
            matched by the time I exported the HY3.
          </p>
          <p>
            Sunday I pasted the results into Excel so I could see who dropped.
            JO and sectionals lived in my head until I had time to look them up.
            Then I did the week again for the other program: the Saturday
            invitational, or the Tuesday dual, with class year and a different
            set of event limits.
          </p>
          <p>
            Lane4 HQ is where I wanted that work to live. Best times fill the
            seeds. The lineup is the meet, in the order it is swum. You export
            the file the host asked for, and Sunday&apos;s results come back
            next to previous best and a cut you entered. One login when the club
            and the high school are both yours. Each team keeps its own times.
          </p>
        </div>
      </section>
      <MarketingCta />
    </>
  );
}
