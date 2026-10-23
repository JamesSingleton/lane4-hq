import { cn } from "@lane4hq/ui/lib/utils";

export function ShotFrame({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[1.7rem] bg-[#6d8cff] p-2.5 shadow-[0_40px_90px_-36px_rgba(109,140,255,0.85)] md:p-3.5",
        className,
      )}
    >
      <div className="overflow-hidden rounded-[1.2rem] bg-[#101218]">
        {children}
      </div>
    </div>
  );
}
