"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@lane4hq/ui/components/dialog";
import { cn } from "@lane4hq/ui/lib/utils";
import Image from "next/image";
import { useState } from "react";

export function ShotLightbox({
  src,
  alt,
  caption,
  showCaption = true,
  inverse = false,
  className,
  children,
}: {
  src: string;
  alt: string;
  caption: string;
  showCaption?: boolean;
  inverse?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <figure className={cn("flex flex-col", className)}>
      <button
        type="button"
        className="group w-full cursor-zoom-in rounded-xl text-left focus-visible:outline-2 focus-visible:outline-offset-4"
        aria-label={`View larger. ${alt}`}
        onClick={() => setOpen(true)}
      >
        {children}
        <span
          className={cn(
            "mt-3 flex items-start justify-between gap-4 text-sm",
            inverse && "text-white/70",
          )}
        >
          {showCaption ? (
            <span
              className={cn(
                "max-w-prose text-pretty",
                inverse ? "text-white/60" : "text-muted-foreground",
              )}
            >
              {caption}
            </span>
          ) : (
            <span className="sr-only">{caption}</span>
          )}
          <span className="shrink-0 font-medium underline-offset-4 group-hover:underline">
            View larger
          </span>
        </span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="flex max-h-[92dvh] flex-col gap-3 overflow-hidden bg-background p-3 sm:max-w-none"
          style={{
            width: "min(96vw, 90rem)",
            maxWidth: "min(96vw, 90rem)",
          }}
        >
          <DialogHeader className="pr-8 text-left">
            <DialogTitle>{caption}</DialogTitle>
            <DialogDescription className="sr-only">{alt}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-auto">
            <Image
              src={src}
              alt={alt}
              width={1440}
              height={900}
              unoptimized
              className="h-auto w-full"
            />
          </div>
        </DialogContent>
      </Dialog>
    </figure>
  );
}
