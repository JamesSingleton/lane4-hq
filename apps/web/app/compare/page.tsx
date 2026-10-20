import { MarketingCta } from "@/components/marketing-cta";
import { PageIntro } from "@/components/section";
import { pageMetadata } from "@/lib/metadata";
import { competitorRoles, lane4Today } from "@/lib/site";

export const metadata = pageMetadata(
  "Compare",
  "What Lane4 HQ does in open beta, what it does not do, and the role Hy-Tek, TeamUnify, SwimTopia, and Commit usually play. Not a scored feature matrix.",
  "/compare",
);

export default function ComparePage() {
  return (
    <>
      <PageIntro
        title="Lane4 is the visiting team's workspace. The host still runs the meet."
        description="This page lists what the open beta does, what it leaves to other software, and the job each of those products usually has. It is not a scored matrix, and it does not audit their current editions or prices."
      />
      <section className="mx-auto w-full max-w-6xl px-4 pb-16 md:px-6">
        <h2 className="font-display text-2xl font-medium tracking-tight md:text-3xl">
          Lane4 HQ today
        </h2>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <caption className="sr-only">
              Lane4 HQ capabilities in the open beta, including work that is not
              offered or still coming soon
            </caption>
            <thead>
              <tr className="border-b border-foreground/15">
                <th scope="col" className="py-3 pr-4 font-medium">
                  Work
                </th>
                <th scope="col" className="py-3 font-medium">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {lane4Today.map((row) => (
                <tr key={row.work} className="border-b border-foreground/10">
                  <th scope="row" className="py-4 pr-4 font-normal text-pretty">
                    {row.work}
                  </th>
                  <td className="py-4 align-top whitespace-nowrap">
                    {row.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="mx-auto w-full max-w-6xl px-4 pb-8 md:px-6">
        <h2 className="font-display max-w-2xl text-2xl font-medium tracking-tight text-balance md:text-3xl">
          Where the other tools usually sit
        </h2>
        <p className="text-muted-foreground mt-4 max-w-2xl text-pretty">
          Coaches already know these names. The notes below are the role each
          one plays in a typical season, so you can see the handoff. They are
          not a claim that Lane4 wins a category.
        </p>
        <ul className="mt-8 flex flex-col">
          {competitorRoles.map((item) => (
            <li
              key={item.name}
              className="grid gap-2 border-t border-foreground/10 py-6 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] md:gap-8"
            >
              <h3 className="font-medium">{item.name}</h3>
              <p className="text-muted-foreground text-sm text-pretty">
                {item.body}
              </p>
            </li>
          ))}
        </ul>
      </section>
      <MarketingCta
        title="Start with the meet you are entering now."
        body="Import the host's event file on the Free plan and export your team's lineup. The desktop meet manager is not part of signup."
      />
    </>
  );
}
