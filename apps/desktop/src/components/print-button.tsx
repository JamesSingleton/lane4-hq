import { Button } from "@lane4hq/ui/components/button";
import { Printer } from "lucide-react";
import { useState, useTransition } from "react";
import { errorMessage } from "../lib/native";
import { type PrintRequest, printReport } from "../lib/print";
import { useMeet } from "../state/meet-context";

export function PrintButton({
  children,
  ...request
}: PrintRequest & { children: React.ReactNode }) {
  const {
    state: { meet },
  } = useMeet();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            try {
              setError(null);
              await printReport(meet, request);
            } catch (e) {
              setError(errorMessage(e));
            }
          })
        }
      >
        <Printer />
        {pending ? "Preparing…" : children}
      </Button>
      {error ? (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      ) : null}
    </span>
  );
}
