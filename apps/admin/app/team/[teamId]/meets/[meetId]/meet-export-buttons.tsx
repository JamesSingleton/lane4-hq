"use client";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@lane4hq/ui/components/alert";
import { Button } from "@lane4hq/ui/components/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@lane4hq/ui/components/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@lane4hq/ui/components/dropdown-menu";
import { Separator } from "@lane4hq/ui/components/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@lane4hq/ui/components/tooltip";
import { ChevronDown, Download } from "lucide-react";
import { useState } from "react";
import { useTeamCapabilities } from "@/components/team-capabilities";
import { TEAM_MANAGE_ROLE_TOOLTIP } from "@/lib/team-role-messages";
import { exportMeetAction, exportMeetZipAction } from "../actions";
import { confirmMeetEntriesViewOnExport } from "../meet-entries-view";
import { exportMeetEntriesCsvAction } from "../meet-events-actions";

type TextFormat = "sdif" | "hy3" | "cl2";
type ZipKind = "entries" | "results";
type ExportJob =
  | { kind: "text"; format: TextFormat }
  | { kind: "csv" }
  | { kind: "zip"; zip: ZipKind };

type ExportAction = {
  key: string;
  label: string;
  needsLineup?: boolean;
  job?: ExportJob;
};

const TEXT_FORMAT_META: Record<
  TextFormat,
  { label: string; extension: string }
> = {
  hy3: { label: "For Meet Manager (HY3)", extension: "hy3" },
  sdif: { label: "For SwimTopia / SDIF (SD3)", extension: "sd3" },
  cl2: { label: "CL2 (SDIF entries/results)", extension: "cl2" },
};

const ZIP_KIND_META: Record<ZipKind, { label: string }> = {
  entries: { label: "Entries pack (HY3 + CL2)" },
  results: { label: "Results pack (HY3 + CL2)" },
};

const LINEUP_ACTIONS: ExportAction[] = [
  {
    key: "hy3",
    label: TEXT_FORMAT_META.hy3.label,
    needsLineup: true,
    job: { kind: "text", format: "hy3" },
  },
  {
    key: "sdif",
    label: TEXT_FORMAT_META.sdif.label,
    needsLineup: true,
    job: { kind: "text", format: "sdif" },
  },
  {
    key: "csv-entries",
    label: "Entries CSV",
    needsLineup: true,
    job: { kind: "csv" },
  },
  {
    key: "cl2",
    label: TEXT_FORMAT_META.cl2.label,
    needsLineup: true,
    job: { kind: "text", format: "cl2" },
  },
];

const ZIP_ACTIONS: ExportAction[] = [
  {
    key: "zip-entries",
    label: ZIP_KIND_META.entries.label,
    needsLineup: true,
    job: { kind: "zip", zip: "entries" },
  },
  {
    key: "zip-results",
    label: ZIP_KIND_META.results.label,
    needsLineup: true,
    job: { kind: "zip", zip: "results" },
  },
];

function jobKey(job: ExportJob): string {
  if (job.kind === "text") return `text:${job.format}`;
  if (job.kind === "csv") return "csv";
  return `zip:${job.zip}`;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function actionDisabled(
  action: ExportAction,
  busy: boolean,
  lineupLocked: boolean,
) {
  return busy || Boolean(action.needsLineup && lineupLocked);
}

export function MeetExportButtons({
  teamId,
  meetId,
  meetName,
  hasLineup,
  pendingExportSwimmers = [],
}: {
  teamId: string;
  meetId: string;
  meetName: string;
  hasLineup: boolean;
  pendingExportSwimmers?: string[];
}) {
  const { canManageTeam } = useTeamCapabilities();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const baseName = meetName.replace(/[^\w.-]+/g, "_");

  if (!canManageTeam) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={<Button type="button" variant="outline" size="sm" disabled />}
        >
          <Download data-icon="inline-start" />
          Export
        </TooltipTrigger>
        <TooltipContent>{TEAM_MANAGE_ROLE_TOOLTIP}</TooltipContent>
      </Tooltip>
    );
  }

  async function runJob(job: ExportJob) {
    if (hasLineup === false) return;

    setLoading(jobKey(job));
    setError("");
    try {
      await confirmMeetEntriesViewOnExport(teamId);
      if (job.kind === "text") {
        const { content, filename } = await exportMeetAction(
          teamId,
          meetId,
          job.format,
        );
        const { extension } = TEXT_FORMAT_META[job.format];
        downloadBlob(
          new Blob([content], { type: "text/plain" }),
          filename ?? `${baseName}.${extension}`,
        );
      } else if (job.kind === "csv") {
        const content = await exportMeetEntriesCsvAction(teamId, meetId);
        downloadBlob(
          new Blob([content], { type: "text/csv;charset=utf-8" }),
          `${baseName}_entries.csv`,
        );
      } else {
        const { base64, filename } = await exportMeetZipAction(
          teamId,
          meetId,
          job.zip,
        );
        downloadBlob(
          new Blob([base64ToBytes(base64).buffer as ArrayBuffer], {
            type: "application/zip",
          }),
          filename,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setLoading(null);
    }
  }

  function choose(action: ExportAction) {
    if (action.job) {
      setDrawerOpen(false);
      void runJob(action.job);
    }
  }

  const busy = loading !== null;
  const lineupLocked = !hasLineup;
  const lineupHint = "Add entries before exporting a lineup.";
  const pendingExportNote =
    pendingExportSwimmers.length > 0 ? (
      <Alert className="text-left">
        <AlertTitle>Pending swimmers excluded from export</AlertTitle>
        <AlertDescription>
          {pendingExportSwimmers.join(", ")} — set status to Committed on the
          entries board to include them in HY3/CL2/SD3.
        </AlertDescription>
      </Alert>
    ) : null;

  function renderMenuItems(actions: ExportAction[]) {
    return actions.map((action) => (
      <DropdownMenuItem
        key={action.key}
        disabled={actionDisabled(action, busy, lineupLocked)}
        closeOnClick
        onClick={() => {
          if (action.job) void runJob(action.job);
        }}
      >
        {action.label}
      </DropdownMenuItem>
    ));
  }

  function renderDrawerItems(actions: ExportAction[]) {
    return actions.map((action) => {
      const disabled = actionDisabled(action, busy, lineupLocked);
      return (
        <Button
          key={action.key}
          type="button"
          variant="ghost"
          className="w-full justify-start"
          disabled={disabled}
          onClick={() => choose(action)}
        >
          {action.label}
        </Button>
      );
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="hidden md:block">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" size="sm" disabled={busy}>
                <Download data-icon="inline-start" />
                Export
                <ChevronDown data-icon="inline-end" />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-max min-w-64">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Lineup</DropdownMenuLabel>
              {lineupLocked ? (
                <p className="text-muted-foreground px-1.5 py-1 text-xs">
                  {lineupHint}
                </p>
              ) : (
                pendingExportNote
              )}
              {renderMenuItems(LINEUP_ACTIONS)}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>ZIP packs</DropdownMenuLabel>
              {renderMenuItems(ZIP_ACTIONS)}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="md:hidden">
        <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} showSwipeHandle>
          <DrawerTrigger
            render={
              <Button variant="outline" size="sm" disabled={busy}>
                <Download data-icon="inline-start" />
                Export
              </Button>
            }
          />
          <DrawerContent>
            <DrawerHeader className="text-left">
              <DrawerTitle>Export</DrawerTitle>
              <DrawerDescription>
                Meet Manager, SwimTopia, and entry reports.
              </DrawerDescription>
            </DrawerHeader>
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
              {!lineupLocked ? pendingExportNote : null}
              <div className="flex flex-col gap-1">
                <p className="text-muted-foreground text-xs">Lineup</p>
                {lineupLocked ? (
                  <p className="text-muted-foreground text-sm">{lineupHint}</p>
                ) : null}
                {renderDrawerItems(LINEUP_ACTIONS)}
              </div>
              <Separator />
              <div className="flex flex-col gap-1">
                <p className="text-muted-foreground text-xs">ZIP packs</p>
                {renderDrawerItems(ZIP_ACTIONS)}
              </div>
            </div>
            <DrawerFooter>
              <DrawerClose render={<Button variant="outline" />}>
                Cancel
              </DrawerClose>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      </div>
      {error ? (
        <p className="text-destructive max-w-56 text-right text-sm">{error}</p>
      ) : null}
    </div>
  );
}
