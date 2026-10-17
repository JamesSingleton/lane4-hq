import { FeatureBlock, FeaturePage } from "@/components/feature-page";
import { ProductShot } from "@/components/product-shot";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata(
  "Meets and entries",
  "Fill seeds from best times, export HY3, CL2, or SDIF, and bring Sunday's results back next to previous best and a cut you entered.",
);

export default function MeetsProductPage() {
  return (
    <FeaturePage
      title="Fill seeds from best times, then export the file the host asked for."
      description="Individuals, relays, going or scratch. The file you send is that lineup, for a club invitational or a high school dual."
      shot="meets"
    >
      <ProductShot shot="entries" />
      <ProductShot shot="results" />
      <FeatureBlock title="From the event file">
        <p>
          Import EV3, HYV, XLS, or a ZIP. Sessions, events, qualifying times,
          and JV or Varsity divisions come with the file. Dive events in a
          combined meet stay off the swim entry board.
        </p>
      </FeatureBlock>
      <FeatureBlock title="Building entries">
        <p>
          Mark who is attending, including relay-only swimmers. Seed times fill
          from best times, and you can override them. Relays take four legs,
          plus alternates when the meet asks for them. On Pro, lineup
          suggestions fill open individual spots from eligible best times,
          within the meet&apos;s entry limits. Relays stay as you staffed them.
          Relay-order suggestions are on every plan, inside the monthly draft
          pool shared with practice drafts.
        </p>
        <p>
          Before export, validation flags entry limits from the file —
          individual, relay, and combined — and qualifying-time misses. On a
          high school team it also checks association scoring caps: max scoring
          names in an individual event, and max relay teams. A scratch keeps the
          row.
        </p>
      </FeatureBlock>
      <FeatureBlock title="The file they asked for, and paper">
        <p>
          Export HY3 or CL2 for Meet Manager, or SDIF for hosts that asked for
          it, including TeamUnify and SwimTopia. Print the individual entries
          report and a split sheet. The default print omits relay alternates;
          you can include them. Split cadence is print-only and is not saved.
        </p>
      </FeatureBlock>
      <FeatureBlock title="Results, previous best, and the cut">
        <p>
          Import the results file after the meet. Each row shows the new time
          next to previous best.
        </p>
        <p>
          Turn on a time standard you created or imported. That can be JO,
          sectionals, or a high school cut. Under, at, or over sits on the row.
          Lane4 HQ does not include a built-in standards book. Faster swims
          update best times. Unmatched names stay on a review list.
        </p>
      </FeatureBlock>
    </FeaturePage>
  );
}
