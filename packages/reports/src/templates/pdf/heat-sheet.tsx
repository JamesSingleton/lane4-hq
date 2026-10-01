import { Document, Page, Text, View } from "@react-pdf/renderer";
import type {
  HeatSheetEvent,
  HeatSheetReport,
  MeetReportEventKind,
} from "../../meet-program/build";
import { reportColors as colors } from "./components/chrome";
import {
  type Column,
  DetailLine,
  EventTitle,
  MeetReportFooter,
  MeetReportHeader,
  meetPageStyle,
  Row,
} from "./components/meet-chrome";
import { ensureReportFonts } from "./fonts";

const COLUMNS: Record<MeetReportEventKind, Column[]> = {
  individual: [
    { key: "lane", label: "Lane", width: 32 },
    { key: "name", label: "Name", flex: 1.4 },
    { key: "age", label: "Age", width: 30 },
    { key: "team", label: "Team", flex: 1 },
    { key: "seed", label: "Seed Time", width: 60, align: "right" },
  ],
  relay: [
    { key: "lane", label: "Lane", width: 32 },
    { key: "name", label: "Team", flex: 2.4 },
    { key: "seed", label: "Seed Time", width: 60, align: "right" },
  ],
  dive: [
    { key: "lane", label: "Order", width: 32 },
    { key: "name", label: "Name", flex: 1.4 },
    { key: "age", label: "Age", width: 30 },
    { key: "team", label: "Team", flex: 1 },
  ],
};

function legsLine(legs: string[]): string {
  return legs.map((leg, i) => `${i + 1}) ${leg}`).join("   ");
}

function EventBlock({ event }: { event: HeatSheetEvent }) {
  const columns = COLUMNS[event.kind];
  return (
    <View>
      <EventTitle number={event.number} title={event.title} />
      {event.heats.map((heat) => (
        <View key={heat.label} wrap={false} style={{ marginBottom: 4 }}>
          <Text
            style={{
              fontSize: 8,
              fontWeight: 700,
              color: colors.accent,
              paddingHorizontal: 4,
              paddingVertical: 2,
            }}
          >
            {heat.label}
          </Text>
          <Row columns={columns} cells={{}} header />
          {heat.rows.map((row) => (
            <View key={row.lane}>
              <Row
                columns={columns}
                cells={{
                  lane: String(row.lane),
                  name: row.exhibition ? `${row.name} (X)` : row.name,
                  age: row.age == null ? "" : String(row.age),
                  team: row.team,
                  seed: row.seed,
                }}
              />
              {row.legs.length > 0 ? (
                <DetailLine>{legsLine(row.legs)}</DetailLine>
              ) : null}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

export function HeatSheetPdfDocument({ report }: { report: HeatSheetReport }) {
  ensureReportFonts();
  return (
    <Document
      title={`${report.meetName} — Heat sheet`}
      author="Lane4"
      subject="Heat sheet"
    >
      <Page size="LETTER" wrap style={meetPageStyle}>
        <MeetReportHeader report={report} />
        {report.events.length === 0 ? (
          <Text style={{ color: colors.muted }}>No seeded events.</Text>
        ) : (
          report.events.map((event) => (
            <EventBlock key={event.eventId} event={event} />
          ))
        )}
        <MeetReportFooter report={report} />
      </Page>
    </Document>
  );
}
