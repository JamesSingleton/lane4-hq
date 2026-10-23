import { CtaLink } from "@/components/cta-link";
import { FaqList } from "@/components/faq-list";
import { MarketingCta } from "@/components/marketing-cta";
import { MarketingStage } from "@/components/marketing-stage";
import { ProductShot } from "@/components/product-shot";
import { ProductStage, type StageItem } from "@/components/product-stage";
import { Section, sectionTitle } from "@/components/section";
import { productShots } from "@/lib/screenshots";
import {
  formats,
  meetWeek,
  PRIMARY_CTA,
  productLinks,
  SIGN_UP_URL,
  weekLoad,
} from "@/lib/site";

function stageShot(
  shot: keyof typeof productShots,
): Pick<StageItem, "src" | "alt" | "caption"> {
  const spec = productShots[shot];
  return {
    src: `/screenshots/${spec.file}`,
    alt: spec.alt,
    caption: spec.caption,
  };
}

const stageItems: StageItem[] = [
  {
    id: "entries",
    kicker: "Entries",
    title: "Seeds already filled, in the order the meet is swum",
    body: "Individuals and relays in event order. Switch to by-swimmer when you are checking who has too many events. Seed times come from best times. Qualifying times from the host file, and high school association limits, show up before you export.",
    href: "/product/meets",
    link: "Meets and entries",
    ...stageShot("entries"),
  },
  {
    id: "results",
    kicker: "Results",
    title: "Sunday's file next to previous best",
    body: "Previous best is on the row. Turn on a cut you entered — JO, sectionals, or a high school standard — without leaving the meet. Faster swims update best times. Yardage and attendance stay with the practices you already ran.",
    href: "/product/meets",
    link: "Results and cuts",
    ...stageShot("results"),
  },
  ...productLinks
    .filter((item) => item.href !== "/product/meets")
    .map((item) => ({
      id: item.href,
      kicker: item.title,
      title: item.title,
      body: item.description,
      href: item.href,
      link: item.title,
      ...stageShot(item.shot),
    })),
];

export function HomePage() {
  return (
    <MarketingStage>
      <section className="bg-[#07080b] text-white">
        <div className="mx-auto flex w-full max-w-4xl flex-col items-center px-4 pt-20 text-center md:px-8 md:pt-28">
          <h1
            data-hero-line
            className="font-display text-5xl font-semibold tracking-[-0.045em] text-balance sm:text-6xl lg:text-7xl lg:leading-[0.98]"
          >
            Stop retyping seed times the night before entries are due.
          </h1>
          <p
            data-hero-copy
            className="mt-6 max-w-2xl text-base leading-relaxed text-white/65 text-pretty md:text-lg"
          >
            Lane4 fills each seed from the swimmer&apos;s best time, keeps the
            lineup for a club invitational or a high school dual, and puts
            Sunday&apos;s results next to previous best. Export the HY3, CL2, or
            SDIF the host asked for. If you coach both, each team keeps its own
            times.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <span data-hero-cta>
              <CtaLink
                href={SIGN_UP_URL}
                className="bg-white text-[#07080b] hover:bg-white/90"
              >
                {PRIMARY_CTA}
              </CtaLink>
            </span>
            <span data-hero-cta>
              <CtaLink
                href="#meet-week"
                variant="outline"
                className="border-white/25 bg-transparent text-white hover:bg-white/10"
              >
                See a meet week
              </CtaLink>
            </span>
          </div>
          <p
            data-hero-note
            className="mt-6 max-w-lg text-sm leading-relaxed text-white/50 text-pretty"
          >
            Free for one coach, on a club or a high school. No card to start.
            The host still opens the file in Meet Manager, SwimTopia, SwimCloud,
            or TeamUnify.
          </p>
        </div>
        <div
          data-hero-shot
          className="mx-auto w-full max-w-6xl px-4 pt-14 md:px-8 md:pt-16"
        >
          <ProductShot
            shot="dashboard"
            priority
            framed
            inverse
            showCaption={false}
          />
        </div>
        <div
          id="meet-week"
          data-meet-track
          className="mx-auto mt-14 w-full max-w-7xl border-t border-white/10 md:mt-16"
        >
          <div
            aria-hidden
            data-meet-lane
            className="h-px origin-left bg-[#6d8cff]"
          />
          <ol className="grid md:grid-cols-4">
            {meetWeek.map((step, index) => (
              <li
                key={step.title}
                className="flex flex-col gap-3 border-white/10 px-6 py-10 md:border-l md:first:border-l-0"
              >
                <p className="font-display text-5xl tracking-[-0.04em] text-white">
                  {index + 1}
                </p>
                <h2 className="text-lg font-medium">{step.title}</h2>
                <p className="text-sm leading-relaxed text-white/55 text-pretty">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="bg-[#07080b] text-white">
        <div className="mx-auto w-full max-w-7xl border-t border-white/10 px-4 py-20 md:px-8 md:py-28">
          <div className="max-w-2xl">
            <h2 className="font-display text-4xl font-semibold tracking-[-0.03em] text-pretty md:text-5xl md:leading-[1.05]">
              The jobs that still take the evening before a meet.
            </h2>
            <p className="mt-4 leading-relaxed text-white/60 text-pretty">
              A club invitational and a high school dual ask for the same work.
              Seed times, a lineup, and Sunday&apos;s results usually live in
              Team Manager, a spreadsheet, and a whiteboard that do not match.
            </p>
          </div>
          <div className="mt-12 hidden border-b border-white/15 pb-3 text-sm text-white/45 md:grid md:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_minmax(0,1fr)] md:gap-8">
            <p>Job</p>
            <p>How it goes now</p>
            <p>In Lane4</p>
          </div>
          <ul>
            {weekLoad.map((item) => (
              <li
                key={item.waste}
                className="grid gap-3 border-b border-white/10 py-6 md:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_minmax(0,1fr)] md:gap-8"
              >
                <p className="font-medium">{item.waste}</p>
                <p className="text-sm leading-relaxed text-white/55">
                  <span className="mb-1 block font-medium text-white md:sr-only">
                    How it goes now
                  </span>
                  {item.from}
                </p>
                <p className="text-sm leading-relaxed text-white/85">
                  <span className="mb-1 block font-medium md:sr-only">
                    In Lane4
                  </span>
                  {item.to}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <ProductStage
        kicker="One team"
        title="The rest of the week lives on the same team."
        intro="Roster, calendar, workouts, progression, and analytics stay with the club or the high school you have open."
        items={stageItems}
      />

      <Section>
        <div className="flex max-w-2xl flex-col gap-4">
          <h2 className={sectionTitle}>
            Send the file the host already knows how to open.
          </h2>
          <p className="leading-relaxed text-muted-foreground text-pretty">
            You build the lineup once. Meet Manager, SwimTopia, SwimCloud, and
            TeamUnify still get the interchange they already use.
          </p>
        </div>
        <ul data-formats className="mt-8 border-t border-foreground/15">
          {formats.map((format) => (
            <li
              key={format.code}
              className="grid gap-1 border-b border-foreground/10 py-4 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-baseline sm:gap-8"
            >
              <p
                data-format-code
                className="font-display text-3xl font-semibold tracking-[-0.04em]"
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
        <CtaLink
          href="/formats"
          variant="outline"
          size="default"
          className="mt-8 w-fit"
        >
          File formats
        </CtaLink>
      </Section>

      <Section tone="deck">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-16">
          <div className="flex flex-col gap-4">
            <h2 className={sectionTitle}>
              Coaches ask these questions before they move a team over.
            </h2>
            <p className="leading-relaxed text-muted-foreground text-pretty">
              This is the workspace for the coach taking a club or a high school
              to the meet.
            </p>
          </div>
          <FaqList />
        </div>
      </Section>

      <MarketingCta />
    </MarketingStage>
  );
}
