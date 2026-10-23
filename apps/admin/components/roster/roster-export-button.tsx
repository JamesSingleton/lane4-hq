"use client";

import { Button } from "@lane4hq/ui/components/button";
import { Download } from "lucide-react";

export function RosterExportButton({
  onExport,
  loading,
  label = "Export roster",
  shortLabel = "Export",
  busyLabel = "Exporting…",
}: {
  onExport: () => void;
  loading?: boolean;
  label?: string;
  shortLabel?: string;
  busyLabel?: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      disabled={loading}
      onClick={onExport}
      aria-label={loading ? busyLabel : label}
    >
      <Download data-icon="inline-start" />
      {loading ? (
        busyLabel
      ) : (
        <>
          <span className="sm:hidden">{shortLabel}</span>
          <span className="hidden sm:inline">{label}</span>
        </>
      )}
    </Button>
  );
}
