import { describe, expect, it } from "vitest";
import {
  rosterExportInputFromTableState,
  rosterSearchFiltersToExportInput,
} from "../../lib/roster-export-input";

describe("rosterSearchFiltersToExportInput", () => {
  it("maps roster URL filters to RosterPageInput", () => {
    expect(
      rosterSearchFiltersToExportInput({
        seasonId: "season-1",
        firstName: "  ada ",
        status: ["active"],
        gender: ["female"],
        groupId: ["varsity", "none"],
        classYear: ["2027"],
        sort: [{ id: "lastName", desc: true }],
      }),
    ).toEqual({
      seasonId: "season-1",
      q: "ada",
      status: ["active"],
      gender: ["female"],
      groupId: ["varsity", "none"],
      classYear: ["2027"],
      sort: [{ id: "lastName", desc: true }],
    });
  });

  it("omits empty filters for full-season export", () => {
    expect(
      rosterSearchFiltersToExportInput({
        seasonId: "season-1",
        firstName: "   ",
        status: [],
      }),
    ).toEqual({ seasonId: "season-1" });
  });
});

describe("rosterExportInputFromTableState", () => {
  it("reads column filters and sorting", () => {
    expect(
      rosterExportInputFromTableState({
        seasonId: "season-1",
        columnFilters: [
          { id: "firstName", value: "Ada" },
          { id: "status", value: ["active"] },
          { id: "gender", value: undefined },
          { id: "groupId", value: "" },
          { id: "ignored", value: "nope" },
        ],
        sorting: [{ id: "lastName", desc: false }],
      }),
    ).toEqual({
      seasonId: "season-1",
      q: "Ada",
      status: ["active"],
      sort: [{ id: "lastName", desc: false }],
    });
  });

  it("omits sorting and season when the table has neither", () => {
    expect(
      rosterExportInputFromTableState({
        columnFilters: [],
        sorting: [],
      }),
    ).toEqual({});
  });
});
