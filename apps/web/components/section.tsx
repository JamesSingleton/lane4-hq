import { cn } from "@lane4hq/ui/lib/utils";

export const siteContainer = "mx-auto w-full max-w-7xl px-4 md:px-8";

export const sectionTitle =
  "font-display max-w-3xl text-4xl font-semibold tracking-[-0.03em] text-pretty md:text-5xl md:leading-[1.05]";

export function Section({
  children,
  className,
  id,
  tone = "plain",
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
  tone?: "plain" | "deck";
}) {
  return (
    <section
      id={id}
      className={cn(tone === "deck" && "border-y border-border/70 bg-muted/40")}
    >
      <div className={cn(siteContainer, "py-20 md:py-28")}>
        <div className={className}>{children}</div>
      </div>
    </section>
  );
}

export function PageIntro({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn(siteContainer, "pt-16 pb-10 md:pt-24 md:pb-14")}>
      <div className="flex max-w-4xl flex-col gap-5">
        <h1 className="font-display text-5xl font-semibold tracking-[-0.035em] text-pretty md:text-6xl md:leading-[0.98]">
          {title}
        </h1>
        <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground text-pretty">
          {description}
        </p>
        {children}
      </div>
    </div>
  );
}
