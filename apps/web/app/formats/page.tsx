import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@lane4hq/ui/components/alert";
import { cn } from "@lane4hq/ui/lib/utils";
import { MarketingCta } from "@/components/marketing-cta";
import { PageIntro, siteContainer } from "@/components/section";
import { pageMetadata } from "@/lib/metadata";
import { formats } from "@/lib/site";

export const metadata = pageMetadata(
  "File formats",
  "HY3, CL2, EV3, HYV, SDIF/SD3, XLS event reports, and ZIP packs for club and high school meet files.",
);

export default function FormatsPage() {
  return (
    <>
      <PageIntro
        title="Export the file Meet Manager already knows how to open."
        description="You build the lineup once. HY3, CL2, and SDIF are the interchange Meet Manager, SwimTopia, SwimCloud, and TeamUnify already use."
      />
      <section className={cn(siteContainer, "flex flex-col gap-10 pb-16")}>
        <Alert>
          <AlertTitle>The host still opens the file</AlertTitle>
          <AlertDescription>
            These files are your team&apos;s entries. The host receives them in
            Meet Manager, SwimTopia, SwimCloud, or TeamUnify. Lane4 HQ does not
            merge other teams&apos; entries or replace a timing console. A host
            can still reject a file under their own rules.
          </AlertDescription>
        </Alert>
        <ul className="border-t border-foreground/15">
          {formats.map((format) => (
            <li
              key={format.code}
              className="grid gap-1 border-b border-foreground/10 py-4 sm:grid-cols-[10rem_minmax(0,36rem)] sm:items-baseline sm:gap-8"
            >
              <p
                className="font-display text-lg font-semibold tracking-tight"
                translate="no"
              >
                {format.code}
              </p>
              <p className="leading-relaxed text-muted-foreground">
                {format.use}
              </p>
            </li>
          ))}
        </ul>
      </section>
      <MarketingCta />
    </>
  );
}
