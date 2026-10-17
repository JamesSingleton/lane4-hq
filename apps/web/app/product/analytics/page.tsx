import { FeatureBlock, FeaturePage } from "@/components/feature-page";
import { ProductShot } from "@/components/product-shot";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata(
  "Analytics",
  "Yardage, attendance, and team top times from practices and results you already have. The roster-wide cut list is on Pro.",
);

export default function AnalyticsProductPage() {
  return (
    <FeaturePage
      title="See who dropped time, who is under a cut, and who has been at practice."
      description="Yardage, attendance, and top times come from the practices and meets you already ran. The roster-wide cut list is on Pro."
      shot="analytics"
    >
      <ProductShot shot="cutTracker" />
      <FeatureBlock title="Yardage and attendance">
        <p>
          Seven-day and thirty-day yardage, and who showed up. That is the roll
          you already took, before you name a relay or look back at a race that
          died on Saturday.
        </p>
      </FeatureBlock>
      <FeatureBlock title="Team top times">
        <p>
          Fastest best times by event, swimmer, or course. Filter the list when
          you are staffing a relay.
        </p>
      </FeatureBlock>
      <FeatureBlock title="Cut list on Pro">
        <p>
          Enter a standard — JO, sectionals, or a high school cut — and Pro
          lists anyone already at or under it, with their time next to the
          standard. Free still keeps best times, and any plan can turn a
          standard on for one meet&apos;s results. Pro is the roster-wide list.
          These are standards you enter.
        </p>
      </FeatureBlock>
    </FeaturePage>
  );
}
