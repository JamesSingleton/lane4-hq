"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useRef } from "react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(useGSAP, ScrollTrigger);
}

export function MarketingStage({ children }: { children: React.ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const intro = gsap.timeline({
          defaults: { ease: "power3.out" },
        });

        intro
          .from("[data-hero-line]", {
            y: 28,
            autoAlpha: 0,
            duration: 0.72,
          })
          .from(
            "[data-hero-copy]",
            { y: 18, autoAlpha: 0, duration: 0.55 },
            0.4,
          )
          .from(
            "[data-hero-cta]",
            { y: 14, autoAlpha: 0, duration: 0.4, stagger: 0.08 },
            0.52,
          )
          .from(
            "[data-hero-note]",
            { y: 12, autoAlpha: 0, duration: 0.45 },
            0.58,
          )
          .from(
            "[data-hero-shot]",
            { y: 56, duration: 1, ease: "power2.out" },
            0.34,
          );

        for (const shot of gsap.utils.toArray<HTMLElement>("[data-shot]")) {
          gsap.from(shot, {
            y: 48,
            duration: 0.85,
            ease: "power2.out",
            scrollTrigger: {
              trigger: shot,
              start: "top 86%",
              once: true,
            },
          });
        }

        const catalog = rootRef.current?.querySelector("[data-catalog]");
        if (catalog) {
          gsap.from("[data-catalog-item]", {
            y: 32,
            duration: 0.65,
            stagger: 0.08,
            ease: "power2.out",
            scrollTrigger: {
              trigger: catalog,
              start: "top 82%",
              once: true,
            },
          });
        }

        const formats = rootRef.current?.querySelector("[data-formats]");
        if (formats) {
          gsap.from("[data-format-code]", {
            y: 16,
            duration: 0.4,
            stagger: 0.045,
            ease: "power2.out",
            scrollTrigger: {
              trigger: formats,
              start: "top 84%",
              once: true,
            },
          });
        }

        const closing = rootRef.current?.querySelector("[data-closing]");
        if (closing) {
          gsap.from(closing, {
            y: 28,
            duration: 0.7,
            ease: "power2.out",
            scrollTrigger: {
              trigger: closing,
              start: "top 90%",
              once: true,
            },
          });
        }
      });

      mm.add(
        "(min-width: 1280px) and (prefers-reduced-motion: no-preference)",
        () => {
          gsap.fromTo(
            "[data-meet-lane]",
            { scaleX: 0, transformOrigin: "left center" },
            {
              scaleX: 1,
              ease: "none",
              scrollTrigger: {
                trigger: "[data-meet-track]",
                start: "top 72%",
                end: "center 55%",
                scrub: 0.45,
              },
            },
          );
        },
      );
    },
    { scope: rootRef },
  );

  return <div ref={rootRef}>{children}</div>;
}
