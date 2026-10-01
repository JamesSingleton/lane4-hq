import { Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import type { MeetReportChrome } from "../../../meet-program/build";
import { reportColors as colors } from "./chrome";

export const meetPageStyle = {
  fontFamily: "Helvetica",
  fontSize: 8.5,
  paddingTop: 36,
  paddingBottom: 48,
  paddingHorizontal: 36,
  color: colors.ink,
} as const;

export function MeetReportHeader({ report }: { report: MeetReportChrome }) {
  const details = [report.meetDateLabel, report.courseLabel, report.location]
    .filter(Boolean)
    .join(" · ");
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-end",
        borderBottomWidth: 1,
        borderBottomColor: colors.ink,
        paddingBottom: 6,
        marginBottom: 10,
      }}
    >
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={{ fontSize: 13, fontWeight: 700 }}>{report.meetName}</Text>
        <Text style={{ fontSize: 8, color: colors.muted, marginTop: 2 }}>
          {details}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text
          style={{
            fontSize: 7,
            color: colors.muted,
            letterSpacing: 0.4,
            textTransform: "uppercase",
          }}
        >
          Lane4 Meet Manager
        </Text>
        <Text style={{ fontSize: 11, fontWeight: 700, color: colors.accent }}>
          {report.reportTitle}
        </Text>
      </View>
    </View>
  );
}

export function MeetReportFooter({ report }: { report: MeetReportChrome }) {
  return (
    <View
      fixed
      style={{
        position: "absolute",
        bottom: 24,
        left: 36,
        right: 36,
        flexDirection: "row",
        justifyContent: "space-between",
        borderTopWidth: 0.5,
        borderTopColor: colors.rule,
        paddingTop: 5,
      }}
    >
      <Text style={{ fontSize: 7, color: colors.muted }}>
        {report.meetName} · {report.reportTitle} · {report.generatedAtLabel}
      </Text>
      <Text
        style={{ fontSize: 7, color: colors.muted }}
        render={({ pageNumber, totalPages }) =>
          `Page ${pageNumber} of ${totalPages}`
        }
      />
    </View>
  );
}

export function EventTitle({
  number,
  title,
}: {
  number?: number;
  title: string;
}) {
  return (
    <View
      minPresenceAhead={60}
      style={{
        flexDirection: "row",
        gap: 8,
        backgroundColor: "#F2F4F7",
        paddingVertical: 3,
        paddingHorizontal: 4,
        marginTop: 8,
        marginBottom: 3,
      }}
    >
      {number == null ? null : (
        <Text style={{ fontWeight: 700 }}>Event {number}</Text>
      )}
      <Text style={{ fontWeight: 700 }}>{title}</Text>
    </View>
  );
}

export type Column = {
  key: string;
  label: string;
  width?: number;
  flex?: number;
  align?: "left" | "right";
};

export function Row({
  columns,
  cells,
  header = false,
}: {
  columns: Column[];
  cells: Record<string, ReactNode>;
  header?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        paddingVertical: 1.5,
        paddingHorizontal: 4,
        ...(header
          ? { borderBottomWidth: 0.5, borderBottomColor: colors.rule }
          : {}),
      }}
    >
      {columns.map((c) => (
        <Text
          key={c.key}
          style={{
            width: c.width,
            flex: c.flex,
            textAlign: c.align ?? "left",
            paddingRight: 4,
            ...(header
              ? { fontSize: 7, color: colors.muted, fontWeight: 700 }
              : {}),
          }}
        >
          {header ? c.label : cells[c.key]}
        </Text>
      ))}
    </View>
  );
}

export function DetailLine({ children }: { children: ReactNode }) {
  return (
    <Text
      style={{
        fontSize: 7,
        color: colors.muted,
        paddingLeft: 36,
        paddingRight: 4,
        paddingBottom: 2,
      }}
    >
      {children}
    </Text>
  );
}
