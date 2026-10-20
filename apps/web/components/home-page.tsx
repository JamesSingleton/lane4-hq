import Link from "next/link";
import { CtaLink } from "@/components/cta-link";
import { FaqList } from "@/components/faq-list";
import { MarketingCta } from "@/components/marketing-cta";
import { ProductShot } from "@/components/product-shot";
import { Section } from "@/components/section";
import {
  COMING_SOON_DESKTOP,
  exampleProgram,
  formats,
  meetWeek,
  PRIMARY_CTA,
  productLinks,
  SIGN_UP_URL,
  weekLoad,
} from "@/lib/site";

export function HomePage() {
  return (
    <>
      <section className="mx-auto w-full max-w-6xl px-4 pt-6 md:px-6 md:pt-10">
        <div className="pool-panel overflow-hidden rounded-3xl">
          <div className="grid gap-10 px-5 py-10 sm:px-8 md:px-12 md:py-16 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)] lg:items-end lg:gap-14">
            <div className="hero-copy flex max-w-2xl flex-col items-start gap-5">
              <p className="text-sm">
                Open beta for high school and club coaches
              </p>
              <h1 className="font-display text-[2.35rem] leading-[1.05] font-medium text-balance text-white sm:text-5xl lg:text-6xl">
                The seed time is already on the roster.
              </h1>
              <p className="max-w-xl text-base text-pretty sm:text-lg">
                Lane4 fills each seed from the swimmer&apos;s best time, keeps
                the lineup for a Tuesday dual or a Saturday invitational, and
                puts Sunday&apos;s results next to previous best. Export the
                HY3, CL2, or SDIF the host asked for. A club and a high school
                on the same login keep separate times.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <CtaLink
                  href={SIGN_UP_URL}
                  className="min-h-11 bg-[#f3d36b] text-[#10242c] hover:bg-[#e6c45a]"
                >
                  {PRIMARY_CTA}
                </CtaLink>
                <CtaLink
                  href="#meet-week"
                  variant="outline"
                  className="min-h-11 border-[#e7f2f6]/60 bg-transparent text-[#e7f2f6] hover:bg-white/10 hover:text-white"
                >
                  See a meet week
                </CtaLink>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <p className="text-sm">
                Example lineup. Not a team, a swimmer, or a result.
              </p>
              <ul className="program-row flex flex-col divide-y divide-white/15 border-y border-white/15 font-mono text-sm">
                {exampleProgram.map((row) => (
                  <li
                    key={row.event}
                    className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 gap-y-1 py-3 sm:grid-cols-[2rem_minmax(0,1fr)_auto]"
                  >
                    <span>{row.event}</span>
                    <span className="text-pretty">{row.name}</span>
                    <span className="col-start-2 sm:col-start-auto sm:text-right">
                      {row.seed}
                      <span className="sr-only">, {row.source}</span>
                      <span aria-hidden className="mt-0.5 block text-xs">
                        {row.source}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="lane-ropes pt-2" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        </div>
      </section>

      <Section className="grid gap-10 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:gap-16">
        <div className="flex flex-col gap-4">
          <h2 className="font-display text-3xl font-medium tracking-tight text-balance md:text-4xl">
            The jobs that still take the evening before a meet.
          </h2>
          <p className="text-muted-foreground text-pretty">
            A high school dual and a club invitational ask for the same work.
            Seed times, a lineup, and Sunday&apos;s results usually live in Team
            Manager, a spreadsheet, and a whiteboard that do not match.
          </p>
        </div>
        <ul className="flex flex-col">
          {weekLoad.map((item) => (
            <li
              key={item.waste}
              className="grid gap-2 border-t border-foreground/10 py-6 md:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_minmax(0,1fr)] md:gap-8"
            >
              <p className="font-medium">{item.waste}</p>
              <p className="text-muted-foreground text-sm text-pretty">
                <span className="text-foreground">Before. </span>
                {item.from}
              </p>
              <p className="text-sm text-pretty">
                <span className="font-medium">In Lane4. </span>
                {item.to}
              </p>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="meet-week" className="pt-0">
        <div className="flex max-w-2xl flex-col gap-4">
          <h2 className="font-display text-3xl font-medium tracking-tight text-balance md:text-4xl">
            Take one meet from the host&apos;s event file to Sunday&apos;s
            results.
          </h2>
          <p className="text-muted-foreground text-pretty">
            Import the file, mark who is going, send what the host asked for,
            and read the results next to previous best.
          </p>
        </div>
        <ol className="mt-10 grid gap-8 md:grid-cols-2">
          {meetWeek.map((step, index) => (
            <li
              key={step.title}
              className="flex flex-col gap-2 border-t border-foreground/10 pt-5"
            >
              <p className="step-index font-display text-2xl font-medium">
                {index + 1}
              </p>
              <h3 className="text-lg font-medium">{step.title}</h3>
              <p className="text-muted-foreground text-sm text-pretty">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </Section>

      <Section className="grid items-center gap-8 pt-0 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:gap-14">
        <div className="flex flex-col gap-4">
          <h2 className="font-display text-3xl font-medium tracking-tight text-balance md:text-4xl">
            High school entries keep class year and the association&apos;s caps
            on the lineup.
          </h2>
          <p className="text-muted-foreground text-pretty">
            Freshman through senior lives on the season. JV, Varsity, and Open
            come through as the host file&apos;s age group. Association scoring
            caps check max names in an individual event and max relay teams
            before you export. Entry limits from the file cover individual,
            relay, and combined events.
          </p>
          <p className="text-muted-foreground text-pretty">
            There is no separate athletic-director product. A second coach on
            the team needs a Pro or Enterprise seat. Free is one coach.
          </p>
          <CtaLink
            href="/for/high-school"
            variant="outline"
            size="default"
            className="min-h-11 w-fit"
          >
            High school teams
          </CtaLink>
        </div>
        <figure className="flex flex-col gap-3">
          <ProductShot shot="entries" showCaption={false} />
          <figcaption className="text-muted-foreground text-sm">
            Sample data in the product. Not a customer team.
          </figcaption>
        </figure>
      </Section>

      <Section className="pt-0">
        <div className="flex max-w-2xl flex-col gap-4">
          <h2 className="font-display text-3xl font-medium tracking-tight text-balance md:text-4xl">
            The coach workspace in this beta.
          </h2>
          <p className="text-muted-foreground text-pretty">
            Roster, meets, workouts, calendar, progression, and analytics for
            the team you have open. Screenshots use sample data, not a customer
            team.
          </p>
        </div>
        <ul className="mt-10 grid gap-10 md:grid-cols-2">
          {productLinks.map((item) => (
            <li key={item.href} className="flex flex-col gap-4">
              <ProductShot shot={item.shot} showCaption={false} compact />
              <div className="flex flex-col gap-1 border-t border-foreground/10 pt-4">
                <Link
                  href={item.href}
                  className="font-medium underline-offset-4 hover:underline focus-visible:underline"
                >
                  {item.title}
                </Link>
                <p className="text-muted-foreground text-sm text-pretty">
                  {item.description}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section className="pt-0">
        <div className="flex max-w-xl flex-col gap-4">
          <h2 className="font-display text-3xl font-medium tracking-tight text-balance md:text-4xl">
            Send the file the host already knows how to open.
          </h2>
          <p className="text-muted-foreground text-pretty">
            You build the lineup once. Meet Manager, SwimTopia, SwimCloud, and
            TeamUnify still get the interchange they already use.
          </p>
        </div>
        <ul className="mt-8 divide-y divide-foreground/10 border-y border-foreground/10">
          {formats.map((format) => (
            <li
              key={format.code}
              className="grid gap-1 py-4 sm:grid-cols-[9rem_minmax(0,1fr)_auto] sm:items-baseline sm:gap-6"
            >
              <p className="font-mono text-sm font-medium" translate="no">
                {format.code}
              </p>
              <p className="text-muted-foreground text-sm text-pretty">
                {format.use}
              </p>
              <p className="text-sm">{format.direction}</p>
            </li>
          ))}
        </ul>
        <CtaLink
          href="/formats"
          variant="outline"
          size="default"
          className="mt-6 min-h-11 w-fit"
        >
          File formats
        </CtaLink>
      </Section>

      <Section className="pt-0">
        <div className="grid gap-4 border-t border-foreground/10 pt-8 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
          <h2 className="font-display text-2xl font-medium tracking-tight">
            Meet hosts
          </h2>
          <p className="text-muted-foreground max-w-2xl text-pretty">
            {COMING_SOON_DESKTOP} Today you still receive the visiting
            team&apos;s HY3, CL2, or SDIF in the software you already run.
          </p>
        </div>
        <p className="mt-6">
          <Link
            href="/compare"
            className="font-medium underline-offset-4 hover:underline focus-visible:underline"
          >
            How Lane4 compares with Team Manager, Meet Manager, TeamUnify,
            SwimTopia, and Commit
          </Link>
        </p>
      </Section>

      <Section id="faq" className="pt-0">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
          <div className="flex flex-col gap-4">
            <h2 className="font-display text-3xl font-medium tracking-tight text-balance md:text-4xl">
              Questions coaches ask before they move a team over.
            </h2>
            <Link
              href="/faq"
              className="text-sm underline-offset-4 hover:underline focus-visible:underline"
            >
              All questions
            </Link>
          </div>
          <FaqList />
        </div>
      </Section>

      <MarketingCta />
    </>
  );
}
