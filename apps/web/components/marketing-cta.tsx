import { CtaLink } from "@/components/cta-link";
import { Section } from "@/components/section";
import { PRIMARY_CTA, SIGN_IN_URL, SIGN_UP_URL } from "@/lib/site";

export function MarketingCta({
  title = "Put the next meet's seeds and lineup in one place.",
  body = "Create a team, import the event file, and export the entries. Free for one coach, club or high school. No card to start.",
}: {
  title?: string;
  body?: string;
}) {
  return (
    <Section className="pt-0">
      <div className="shot-shell">
        <div className="lane-cta flex flex-col gap-6 rounded-[calc(2rem-0.4rem)] px-6 py-12 md:px-12 md:py-20">
          <h2 className="font-display max-w-3xl text-3xl font-semibold tracking-tight text-pretty md:text-6xl md:leading-[0.95]">
            {title}
          </h2>
          <p className="max-w-xl text-pretty text-[#071016]/90">{body}</p>
          <div className="flex flex-wrap items-center gap-3">
            <CtaLink
              href={SIGN_UP_URL}
              icon
              className="bg-[#071016] text-white hover:bg-[#071016]/90"
            >
              {PRIMARY_CTA}
            </CtaLink>
            <CtaLink
              href={SIGN_IN_URL}
              variant="outline"
              className="border-[#071016]/20 bg-transparent text-[#071016] hover:bg-[#071016]/10"
            >
              Sign in
            </CtaLink>
          </div>
        </div>
      </div>
    </Section>
  );
}
