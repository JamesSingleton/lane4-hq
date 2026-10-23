import { cn } from "@lane4hq/ui/lib/utils";
import { CtaLink } from "@/components/cta-link";
import { siteContainer } from "@/components/section";
import { PRIMARY_CTA, SIGN_IN_URL, SIGN_UP_URL } from "@/lib/site";

export function MarketingCta({
  title = "Put the next meet's seeds and lineup in one place.",
  body = "Create a team, import the event file, and export the entries. Free for one coach, club or high school. No card to start.",
}: {
  title?: string;
  body?: string;
}) {
  return (
    <section data-closing className="bg-[#0c2430] text-[#f3f6f6]">
      <div className={cn(siteContainer, "flex flex-col gap-6 py-24 md:py-32")}>
        <h2 className="font-display max-w-3xl text-4xl font-semibold tracking-[-0.03em] text-pretty md:text-6xl md:leading-[1.02]">
          {title}
        </h2>
        <p className="max-w-xl text-pretty text-lg leading-relaxed text-[#f3f6f6]/75">
          {body}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <CtaLink
            href={SIGN_UP_URL}
            className="bg-[#f3f6f6] text-[#0c2430] hover:bg-white"
          >
            {PRIMARY_CTA}
          </CtaLink>
          <CtaLink
            href={SIGN_IN_URL}
            variant="outline"
            className="border-[#f3f6f6]/30 bg-transparent text-[#f3f6f6] hover:bg-[#f3f6f6]/10"
          >
            Sign in
          </CtaLink>
        </div>
      </div>
    </section>
  );
}
