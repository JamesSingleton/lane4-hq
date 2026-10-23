"use client";

import type {
  ColumnVisibilityState,
  SortingState,
} from "@tanstack/react-table";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  exportRosterCsvAction,
  exportRosterHy3Action,
  saveRosterViewPreferencesAction,
} from "@/app/team/[teamId]/roster/actions";
import { RosterImportButton } from "@/app/team/[teamId]/roster/roster-import-export";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { DataTableViewOptions } from "@/components/data-table/data-table-view-options";
import { useDataTable } from "@/hooks/use-data-table";
import { rosterExportInputFromTableState } from "@/lib/roster-export-input";
import type { Athlete } from "@/types";
import type { Option } from "@/types/data-table";
import { columns } from "./columns";
import { RosterActionBar } from "./roster-action-bar";
import { RosterExportButton } from "./roster-export-button";

export type RosterFacetOptions = {
  status: Option[];
  gender: Option[];
  groupId: Option[];
  classYear: Option[];
};

export function RosterTable({
  teamId,
  seasonId,
  data,
  pageCount,
  groups = [],
  facetOptions,
  showClassYear = false,
  showCollegeEligibility: _showCollegeEligibility = false,
  showUsaSwimmingId = true,
  initialColumnVisibility = {},
  initialSorting = [{ id: "lastName", desc: false }],
}: {
  teamId: string;
  seasonId?: string;
  data: Athlete[];
  pageCount: number;
  groups?: { id: string; name: string }[];
  facetOptions: RosterFacetOptions;
  showClassYear?: boolean;
  showCollegeEligibility?: boolean;
  showUsaSwimmingId?: boolean;
  initialColumnVisibility?: ColumnVisibilityState;
  initialSorting?: SortingState;
}) {
  const [exporting, setExporting] = useState(false);
  const [exportingHy3, setExportingHy3] = useState(false);
  const [exportMessage, setExportMessage] = useState("");
  const [, startTransition] = useTransition();
  const skipPersist = useRef(true);

  const tableColumns = useMemo(
    () =>
      columns(teamId, {
        showClassYear,
        showUsaSwimmingId,
        statusOptions: facetOptions.status,
        genderOptions: facetOptions.gender,
        groupOptions: facetOptions.groupId,
        classYearOptions: facetOptions.classYear,
      }),
    [teamId, showClassYear, showUsaSwimmingId, facetOptions],
  );

  const { table } = useDataTable({
    data,
    columns: tableColumns,
    pageCount,
    initialState: {
      sorting: initialSorting,
      columnVisibility: initialColumnVisibility,
      columnPinning: { start: [], end: ["actions"] },
      pagination: { pageIndex: 0, pageSize: 10 },
    },
    getRowId: (row) => row.id,
    shallow: false,
    clearOnDefault: true,
  });

  const columnVisibility = table.state.columnVisibility;
  const sorting = table.state.sorting;

  useEffect(() => {
    if (skipPersist.current) {
      skipPersist.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      startTransition(() => {
        void saveRosterViewPreferencesAction(teamId, {
          columnVisibility,
          sorting,
        });
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [columnVisibility, sorting, teamId]);

  async function handleExport() {
    setExporting(true);
    setExportMessage("");
    try {
      const exportInput = rosterExportInputFromTableState({
        columnFilters: table.state.columnFilters,
        sorting,
        seasonId,
      });
      const csv = await exportRosterCsvAction(teamId, exportInput);
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "roster-export.csv";
      a.click();
      URL.revokeObjectURL(url);
      setExportMessage("Roster exported");
    } catch (err) {
      setExportMessage(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  async function handleHy3Export() {
    setExportingHy3(true);
    setExportMessage("");
    try {
      const exportInput = rosterExportInputFromTableState({
        columnFilters: table.state.columnFilters,
        sorting,
        seasonId,
      });
      const { content, filename } = await exportRosterHy3Action(
        teamId,
        exportInput,
      );
      const blob = new Blob([content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setExportMessage("Hy-Tek roster exported");
    } catch (err) {
      setExportMessage(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExportingHy3(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <DataTable
        table={table}
        actionBar={
          <RosterActionBar
            table={table}
            teamId={teamId}
            seasonId={seasonId}
            groups={groups}
          />
        }
      >
        <DataTableToolbar table={table}>
          <RosterImportButton teamId={teamId} />
          <RosterExportButton onExport={handleExport} loading={exporting} />
          <RosterExportButton
            onExport={handleHy3Export}
            loading={exportingHy3}
            label="Hy-Tek roster"
            shortLabel="HY3"
            busyLabel="Exporting HY3…"
          />
          <DataTableViewOptions table={table} />
        </DataTableToolbar>
      </DataTable>
      {exportMessage ? (
        <p className="text-muted-foreground text-sm">{exportMessage}</p>
      ) : null}
    </div>
  );
}
