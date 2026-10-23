import { existsSync } from "node:fs";
import path from "node:path";
import Image from "next/image";
import { ShotFrame } from "@/components/shot-frame";
import { ShotLightbox } from "@/components/shot-lightbox";
import { type ProductShotId, productShots } from "@/lib/screenshots";

export function ProductShot({
  shot,
  priority = false,
  className,
  showCaption = true,
  framed = false,
  inverse = false,
}: {
  shot: ProductShotId;
  priority?: boolean;
  className?: string;
  showCaption?: boolean;
  framed?: boolean;
  inverse?: boolean;
}) {
  const spec = productShots[shot];
  const filePath = path.join(process.cwd(), "public", "screenshots", spec.file);
  const ready = existsSync(filePath);
  const src = `/screenshots/${spec.file}`;

  if (!ready) {
    return (
      <figure className={className}>
        <div className="shot-shell">
          <div className="shot-core">
            <div className="flex aspect-[16/10] flex-col justify-end gap-1 bg-muted px-5 py-4">
              <p className="text-sm font-medium">{spec.caption}</p>
              <p className="text-muted-foreground text-sm">
                Add {spec.file} to public/screenshots.
              </p>
            </div>
          </div>
        </div>
      </figure>
    );
  }

  return (
    <ShotLightbox
      src={src}
      alt={spec.alt}
      caption={spec.caption}
      showCaption={showCaption}
      inverse={inverse}
      className={className}
    >
      {framed ? (
        <ShotFrame>
          <Image
            src={src}
            alt=""
            width={1440}
            height={900}
            unoptimized
            priority={priority}
            className="h-auto w-full"
            sizes="(min-width: 1280px) 960px, 100vw"
          />
        </ShotFrame>
      ) : (
        <div className="shot-shell">
          <div className="shot-core">
            <Image
              src={src}
              alt=""
              width={1440}
              height={900}
              unoptimized
              priority={priority}
              className="h-auto w-full"
              sizes="(min-width: 1280px) 1152px, 100vw"
            />
          </div>
        </div>
      )}
    </ShotLightbox>
  );
}
