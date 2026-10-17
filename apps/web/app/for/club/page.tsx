import { FeatureBlock, FeaturePage } from "@/components/feature-page";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata(
  "For club teams",
  "Club invitational weeks for USA Swimming coaches: seeds from best times, the file the host asked for, and cuts such as JO or sectionals that you enter.",
);

export default function ClubPage() {
  return (
    <FeaturePage
      title="Club meet week starts from each swimmer's best time."
      description="Import the invitational, fill seeds from best times, and export the file the host asked for. Sunday's results come back next to previous best and a cut you entered, such as JO or sectionals."
    >
      <FeatureBlock title="The invitational">
        <p>
          The seed is the best time already on the roster, so last season&apos;s
          printout stays in the drawer. You can still override a seed before you
          export HY3, CL2, or SDIF. After the meet, turn on a standard you
          entered and see who went under.
        </p>
      </FeatureBlock>
      <FeatureBlock title="The roster">
        <p>
          Store the USA Swimming ID on the swimmer so the number you already use
          sits with the name. SafeSport training gates minor contact and medical
          fields. When training or a minor&apos;s acknowledgment is missing, the
          dashboard says so.
        </p>
      </FeatureBlock>
      <FeatureBlock title="Beside the high school">
        <p>
          If you also coach a high school, switch teams without signing out.
          That team keeps its own roster, class year, entries, and times.
        </p>
      </FeatureBlock>
    </FeaturePage>
  );
}
