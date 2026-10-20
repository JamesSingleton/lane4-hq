import { existsSync } from "node:fs";
import path from "node:path";
import { cn } from "@lane4hq/ui/lib/utils";
import Image from "next/image";
import { type ProductShotId, productShots } from "@/lib/screenshots";

export function ProductShot({
  shot,
  priority = false,
  className,
  showCaption = true,
  compact = false,
  bleed = false,
}: {
  shot: ProductShotId;
  priority?: boolean;
  className?: string;
  showCaption?: boolean;
  compact?: boolean;
  bleed?: boolean;
}) {
  const spec = productShots[shot];
  const filePath = path.join(process.cwd(), "public", "screenshots", spec.file);
  const ready = existsSync(filePath);
  const src = `/screenshots/${spec.file}`;

  return (
    <figure
      className={cn("flex flex-col gap-3", bleed && "shot-bleed", className)}
    >
      <div className="shot-shell">
        <div className="shot-core">
          {ready ? (
            <Image
              src={src}
              alt={showCaption ? "" : spec.alt}
              width={1440}
              height={900}
              unoptimized
              priority={priority}
              className={
                compact
                  ? "h-auto w-full object-cover object-top lg:max-h-[26rem]"
                  : "h-auto w-full"
              }
              sizes={
                bleed
                  ? "(min-width: 1280px) 1120px, 100vw"
                  : "(min-width: 1024px) 42rem, 100vw"
              }
            />
          ) : (
            <div className="flex aspect-[16/10] flex-col justify-end gap-1 bg-muted px-5 py-4">
              <p className="text-sm font-medium">{spec.caption}</p>
              <p className="text-muted-foreground text-sm">
                Add {spec.file} to public/screenshots.
              </p>
            </div>
          )}
        </div>
      </div>
      {showCaption ? (
        <figcaption className="text-muted-foreground max-w-prose text-sm text-pretty">
          {spec.caption} Sample data, not a customer team.
        </figcaption>
      ) : null}
    </figure>
  );
}
