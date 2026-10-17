import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@lane4hq/ui/components/select";
import { cn } from "@lane4hq/ui/lib/utils";

export type Choice<T extends string> = { value: T; label: string };

/** A shadcn select over a fixed list of string choices. */
export function ChoiceSelect<T extends string>({
  id,
  value,
  onValueChange,
  items,
  className,
  disabled,
}: {
  id?: string;
  value: T;
  onValueChange: (value: T) => void;
  items: readonly Choice<T>[];
  className?: string;
  disabled?: boolean;
}) {
  return (
    <Select
      items={items}
      value={value}
      disabled={disabled}
      onValueChange={(v) => {
        if (v != null) onValueChange(v as T);
      }}
    >
      <SelectTrigger id={id} className={cn("w-full", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
