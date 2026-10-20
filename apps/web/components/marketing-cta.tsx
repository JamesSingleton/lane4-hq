import { CtaLink } from "@/components/cta-link";
import { Section } from "@/components/section";
import { PRICE_NOTE, PRIMARY_CTA, SIGN_IN_URL, SIGN_UP_URL } from "@/lib/site";

export function MarketingCta({
  title = "Create a team and enter the meet you have open.",
  body = "The coach workspace is in open beta. Free is one coach seat, with unlimited swimmers and meets. Choosing Pro or Enterprise opens checkout in the app. Free does not.",
}: {
  title?: string;
  body?: string;
}) {
  return (
    <Section className="pt-0">
      <div className="pool-panel flex flex-col gap-6 rounded-3xl px-6 py-12 md:px-12 md:py-16">
        <h2 className="font-display max-w-3xl text-3xl font-medium tracking-tight text-balance text-white md:text-5xl md:leading-[1.05]">
          {title}
        </h2>
        <p className="max-w-xl text-pretty">{body}</p>
        <p className="max-w-xl text-sm text-pretty">{PRICE_NOTE}</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <CtaLink
            href={SIGN_UP_URL}
            className="min-h-11 bg-[#f3d36b] text-[#10242c] hover:bg-[#e6c45a]"
          >
            {PRIMARY_CTA}
          </CtaLink>
          <CtaLink
            href={SIGN_IN_URL}
            variant="outline"
            className="min-h-11 border-[#e7f2f6]/60 bg-transparent text-[#e7f2f6] hover:bg-white/10 hover:text-white"
          >
            Sign in
          </CtaLink>
        </div>
      </div>
    </Section>
  );
}
