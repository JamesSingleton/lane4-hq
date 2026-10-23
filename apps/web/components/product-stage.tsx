"use client";

import { cn } from "@lane4hq/ui/lib/utils";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ShotFrame } from "@/components/shot-frame";
import { ShotLightbox } from "@/components/shot-lightbox";

export type StageItem = {
  id: string;
  kicker: string;
  title: string;
  body: string;
  href: string;
  link: string;
  src: string;
  alt: string;
  caption: string;
};

export function ProductStage({
  kicker,
  title,
  intro,
  items,
}: {
  kicker: string;
  title: string;
  intro: string;
  items: StageItem[];
}) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");
  const active = items.find((item) => item.id === activeId) ?? items[0];
  if (!active) return null;

  return (
    <section className="bg-[#07080b] text-white">
      <div className="mx-auto w-full max-w-7xl px-4 py-20 md:px-8 md:py-28">
        <div className="grid gap-8 border-b border-white/10 pb-10 lg:grid-cols-2 lg:items-end lg:gap-16">
          <div>
            <p className="text-[0.7rem] tracking-[0.16em] text-white/45 uppercase">
              {kicker}
            </p>
            <h2 className="mt-4 max-w-xl font-display text-4xl font-semibold tracking-[-0.03em] text-pretty md:text-5xl md:leading-[1.05]">
              {title}
            </h2>
          </div>
          <p className="max-w-xl text-white/65 leading-relaxed text-pretty lg:justify-self-end">
            {intro}
          </p>
        </div>
        <div className="grid items-start gap-10 pt-2 lg:grid-cols-[minmax(16rem,24rem)_minmax(0,1fr)] lg:gap-12">
          <ul>
            {items.map((item) => {
              const open = item.id === active.id;
              return (
                <li key={item.id} className="border-b border-white/10">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setActiveId(item.id)}
                    className="flex w-full flex-col items-start gap-2 py-5 text-left focus-visible:outline-2 focus-visible:outline-offset-4"
                  >
                    <span className="text-[0.7rem] tracking-[0.16em] text-white/40 uppercase">
                      {item.kicker}
                    </span>
                    <span
                      className={cn(
                        "text-lg",
                        open ? "text-white" : "text-white/70",
                      )}
                    >
                      {item.title}
                    </span>
                    {open ? (
                      <span className="max-w-md text-sm leading-relaxed text-white/60 text-pretty">
                        {item.body}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="lg:sticky lg:top-24">
            <ShotLightbox
              key={active.src}
              src={active.src}
              alt={active.alt}
              caption={active.caption}
              inverse
            >
              <ShotFrame>
                <Image
                  src={active.src}
                  alt=""
                  width={1440}
                  height={900}
                  unoptimized
                  className="h-auto w-full"
                  sizes="(min-width: 1024px) 720px, 100vw"
                />
              </ShotFrame>
            </ShotLightbox>
            <Link
              href={active.href}
              className="mt-4 inline-flex text-sm text-white/80 underline-offset-4 hover:underline"
            >
              {active.link}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
