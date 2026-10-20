import { ChevronDownIcon } from "lucide-react";
import { faqs } from "@/lib/site";

export function FaqList() {
  return (
    <div className="flex flex-col">
      {faqs.map((item) => (
        <details
          key={item.question}
          className="group border-b border-foreground/10"
        >
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 py-3 text-left font-medium focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden">
            {item.question}
            <ChevronDownIcon
              aria-hidden
              className="size-4 shrink-0 transition-transform group-open:rotate-180"
            />
          </summary>
          <p className="text-muted-foreground pb-4 text-sm text-pretty">
            {item.answer}
          </p>
        </details>
      ))}
    </div>
  );
}
