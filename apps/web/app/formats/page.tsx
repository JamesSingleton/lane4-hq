import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@lane4hq/ui/components/alert";
import { Badge } from "@lane4hq/ui/components/badge";
import { Separator } from "@lane4hq/ui/components/separator";
import { MarketingCta } from "@/components/marketing-cta";
import { PageIntro } from "@/components/section";
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
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 pb-16 md:px-6">
        <Alert>
          <AlertTitle>The host still opens the file</AlertTitle>
          <AlertDescription>
            These files are your team&apos;s entries. The host receives them in
            Meet Manager, SwimTopia, SwimCloud, or TeamUnify. Lane4 HQ does not
            merge other teams&apos; entries or replace a timing console. A host
            can still reject a file under their own rules.
          </AlertDescription>
        </Alert>
        <ul className="grid gap-x-12 gap-y-8 sm:grid-cols-2">
          {formats.map((format) => (
            <li key={format.code} className="flex flex-col gap-2">
              <Badge variant="secondary" className="w-fit">
                {format.code}
              </Badge>
              <p className="text-muted-foreground text-sm text-pretty">
                {format.use}
              </p>
            </li>
          ))}
        </ul>
      </section>
      <Separator className="mx-auto max-w-6xl" />
      <MarketingCta />
    </>
  );
}
