import { eventTitle } from "@lane4hq/meet-engine/labels";
import type { Meet } from "@lane4hq/meet-engine/model";
import { cn } from "@lane4hq/ui/lib/utils";

export function EventList({
  meet,
  selected,
  onSelect,
  badge,
}: {
  meet: Meet;
  selected: string;
  onSelect: (eventId: string) => void;
  badge?: (eventId: string) => string;
}) {
  return (
    <nav aria-label="Events" className="w-64 shrink-0 overflow-auto border-r">
      <ul className="flex flex-col p-1">
        {meet.events.map((event) => (
          <li key={event.id}>
            <button
              type="button"
              aria-current={selected === event.id ? "true" : undefined}
              onClick={() => onSelect(event.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 [content-visibility:auto] [contain-intrinsic-size:auto_2rem]",
                selected === event.id && "bg-muted font-medium",
              )}
            >
              <span className="w-7 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                {event.number}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {eventTitle(event)}
              </span>
              {badge ? (
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {badge(event.id)}
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
