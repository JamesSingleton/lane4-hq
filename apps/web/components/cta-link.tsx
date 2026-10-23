import { buttonVariants } from "@lane4hq/ui/components/button";
import { cn } from "@lane4hq/ui/lib/utils";

type ButtonVariants = NonNullable<Parameters<typeof buttonVariants>[0]>;
type ButtonVariant = NonNullable<ButtonVariants["variant"]>;
type ButtonSize = NonNullable<ButtonVariants["size"]>;

function NestedArrow() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="size-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M4.5 11.5 11.5 4.5" />
      <path d="M6 4.5h5.5V10" />
    </svg>
  );
}

export function CtaLink({
  href,
  children,
  variant = "default",
  size = "lg",
  icon = false,
  className,
}: {
  href: string;
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: boolean;
  className?: string;
}) {
  return (
    <a
      href={href}
      className={cn(
        buttonVariants({ variant, size }),
        "press-scale rounded-full",
        size === "lg" && "h-11 px-5 text-base",
        icon && "group pr-1.5 pl-5",
        className,
      )}
    >
      {children}
      {icon ? (
        <span
          aria-hidden
          className="ml-3 flex size-8 items-center justify-center rounded-full bg-black/8 motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5 group-hover:-translate-y-px dark:bg-white/15"
        >
          <NestedArrow />
        </span>
      ) : null}
    </a>
  );
}
