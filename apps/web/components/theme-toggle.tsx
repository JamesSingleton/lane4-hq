"use client";

import { Button } from "@lane4hq/ui/components/button";
import { cn } from "@lane4hq/ui/lib/utils";
import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("press-scale", className)}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      <span className="relative size-4">
        <SunIcon
          aria-hidden
          className={
            isDark
              ? "size-4 scale-[0.25] opacity-0 blur-[4px] motion-safe:transition-[opacity,filter,scale] motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.2,0,0,1)]"
              : "size-4 scale-100 opacity-100 blur-0 motion-safe:transition-[opacity,filter,scale] motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.2,0,0,1)]"
          }
        />
        <MoonIcon
          aria-hidden
          className={
            isDark
              ? "absolute inset-0 size-4 scale-100 opacity-100 blur-0 motion-safe:transition-[opacity,filter,scale] motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.2,0,0,1)]"
              : "absolute inset-0 size-4 scale-[0.25] opacity-0 blur-[4px] motion-safe:transition-[opacity,filter,scale] motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.2,0,0,1)]"
          }
        />
      </span>
    </Button>
  );
}
