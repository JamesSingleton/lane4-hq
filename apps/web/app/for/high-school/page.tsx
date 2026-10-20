import { FeatureBlock, FeaturePage } from "@/components/feature-page";
import { ProductShot } from "@/components/product-shot";
import { pageMetadata } from "@/lib/metadata";
import { COMING_SOON_DESKTOP } from "@/lib/site";

export const metadata = pageMetadata(
  "For high school teams",
  "High school duals and invitationals: class year, age groups from the host file, and association scoring caps, with seeds filled from best times.",
  "/for/high-school",
);

export default function HighSchoolPage() {
  return (
    <FeaturePage
      title="Enter the dual with class year and your association's limits already on the lineup."
      description="The open beta is the coach workspace for the high school team you take to someone else's meet. Duals and invitationals use the same entry board."
      shot="entries"
    >
      <FeatureBlock title="Who it is for">
        <p>
          Head coaches and assistant coaches build the lineup. There is no
          separate athletic-director screen. Invite another person as a coach if
          they need the same roster and export. Free includes one coach seat, so
          a second person needs Pro or Enterprise. The owner and head coach are
          the ones who import and export meet files.
        </p>
      </FeatureBlock>
      <FeatureBlock title="Roster">
        <p>
          Freshman, sophomore, junior, and senior live on the season. You can
          add a swimmer without a USA Swimming ID. Seeds still fill from that
          team&apos;s best times, and you can override a seed before export.
        </p>
      </FeatureBlock>
      <FeatureBlock title="The host file">
        <p>
          Import EV3, HYV, XLS, or a ZIP. Age groups on the events come from
          that file, including labels such as JV, Varsity, and Open. Dive events
          in a combined file stay off the swim entry board.
        </p>
        <p>
          Association scoring caps are your limits: max scoring names in an
          individual event, and max relay teams. Entry limits from the file —
          individual, relay, and combined — are checked before you export. A
          scratch keeps the row. Relays take four legs, plus alternates when the
          meet asks for them.
        </p>
      </FeatureBlock>
      <FeatureBlock title="The file you send">
        <p>
          Export HY3 or CL2 for Meet Manager, or SDIF when the host asked for
          it. Print the individual entries and a split sheet. The default print
          omits relay alternates; you can include them. Split cadence is
          print-only and is not saved. A host can still reject a file.
        </p>
      </FeatureBlock>
      <FeatureBlock title="After the meet">
        <p>
          Import HY3, CL2, SDIF, or a ZIP. Previous best sits on the row. Turn
          on a high school standard you created or imported and see who went
          under. Lane4 does not ship a built-in standards book. Faster swims
          update best times. Unmatched names stay on the review list.
        </p>
      </FeatureBlock>
      <FeatureBlock title="Beside a club team">
        <p>
          If you also coach a club, switch teams without signing out. Times and
          entries stay with each team. A club membership can store a USA
          Swimming ID. Lane4 HQ is not certified or approved by USA Swimming,
          and it does not sync a SWIMS roster.
        </p>
      </FeatureBlock>
      <ProductShot shot="results" />
      <FeatureBlock title="If you host the meet">
        <p>{COMING_SOON_DESKTOP}</p>
      </FeatureBlock>
    </FeaturePage>
  );
}
