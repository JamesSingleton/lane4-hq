import {
  formatLocalDateOnly,
  formatLocalDateOnlyLabel,
  parseLocalDateOnly,
} from "@lane4hq/swim-core/calendar-date";
import { Button } from "@lane4hq/ui/components/button";
import { Calendar } from "@lane4hq/ui/components/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@lane4hq/ui/components/popover";
import { cn } from "@lane4hq/ui/lib/utils";
import { CalendarIcon } from "lucide-react";
import { useState } from "react";

/** A `YYYY-MM-DD` picker; WebKit's native date input shows today when empty. */
export function DatePicker({
  id,
  value,
  onChange,
  placeholder = "Pick a date",
  allowClear = false,
  notBefore,
  className,
}: {
  id?: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  placeholder?: string;
  allowClear?: boolean;
  /** Earliest selectable day, `YYYY-MM-DD`. */
  notBefore?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? parseLocalDateOnly(value) : undefined;
  const earliest = notBefore ? parseLocalDateOnly(notBefore) : undefined;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            className={cn(
              "w-full justify-start font-normal",
              !selected && "text-muted-foreground",
              className,
            )}
          />
        }
      >
        <CalendarIcon data-icon="inline-start" />
        {(value && formatLocalDateOnlyLabel(value, "long")) ?? placeholder}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? earliest}
          disabled={earliest ? { before: earliest } : undefined}
          captionLayout="dropdown"
          onSelect={(date) => {
            onChange(date ? formatLocalDateOnly(date) : undefined);
            setOpen(false);
          }}
        />
        {allowClear && value ? (
          <div className="border-t p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                onChange(undefined);
                setOpen(false);
              }}
            >
              Clear date
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
