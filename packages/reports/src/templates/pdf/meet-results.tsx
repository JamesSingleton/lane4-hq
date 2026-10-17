import { Document, Page, Text, View } from "@react-pdf/renderer";
import type {
  MeetReportEventKind,
  MeetResultsReport,
  ResultsEvent,
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

function columns(kind: MeetReportEventKind, markLabel: string): Column[] {
  const person: Column[] =
    kind === "relay"
      ? [{ key: "name", label: "Team", flex: 2.4 }]
      : [
          { key: "name", label: "Name", flex: 1.4 },
          { key: "age", label: "Age", width: 26 },
          { key: "team", label: "Team", flex: 1 },
        ];
  return [
    { key: "place", label: "Place", width: 32 },
    ...person,
    ...(kind === "dive"
      ? []
      : [{ key: "seed", label: "Seed", width: 52, align: "right" as const }]),
    { key: "mark", label: markLabel, width: 60, align: "right" },
    { key: "note", label: "", width: 36 },
    { key: "points", label: "Pts", width: 30, align: "right" },
  ];
}

function EventBlock({ event }: { event: ResultsEvent }) {
  const cols = columns(event.kind, event.markLabel);
  return (
    <View>
      <EventTitle number={event.number} title={event.title} />
      <Row columns={cols} cells={{}} header />
      {event.sections.map((section) => (
        <View key={section.label ?? "all"}>
          {section.label ? (
            <Text
              style={{
                fontSize: 8,
                fontWeight: 700,
                color: colors.accent,
                paddingHorizontal: 4,
                paddingTop: 3,
              }}
            >
              {section.label}
            </Text>
          ) : null}
          {section.rows.map((row, i) => (
            <View key={`${row.name}-${i}`} wrap={false}>
              <Row
                columns={cols}
                cells={{
                  place: row.place,
                  name: row.exhibition ? `${row.name} (X)` : row.name,
                  age: row.age == null ? "" : String(row.age),
                  team: row.team,
                  seed: row.seed,
                  mark: row.mark,
                  note: row.note ?? "",
                  points: row.points,
                }}
              />
              {row.legs.length > 0 ? (
                <DetailLine>
                  {row.legs.map((leg, n) => `${n + 1}) ${leg}`).join("   ")}
                </DetailLine>
              ) : null}
              {row.splits.length > 0 ? (
                <DetailLine>{row.splits.join("   ")}</DetailLine>
              ) : null}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function TeamScores({ report }: { report: MeetResultsReport }) {
  if (report.teamScores.length === 0) return null;
  const cols: Column[] = [
    { key: "rank", label: "Place", width: 40 },
    { key: "team", label: "Team", flex: 1 },
    { key: "points", label: "Points", width: 60, align: "right" },
  ];
  return (
    <View wrap={false} style={{ marginTop: 14 }}>
      <EventTitle title="Team scores" />
      <Row columns={cols} cells={{}} header />
      {report.teamScores.map((s) => (
        <Row
          key={s.team}
          columns={cols}
          cells={{ rank: String(s.rank), team: s.team, points: s.points }}
        />
      ))}
    </View>
  );
}

export function MeetResultsPdfDocument({
  report,
}: {
  report: MeetResultsReport;
}) {
  ensureReportFonts();
  return (
    <Document
      title={`${report.meetName} — Results`}
      author="Lane4"
      subject="Results"
    >
      <Page size="LETTER" wrap style={meetPageStyle}>
        <MeetReportHeader report={report} />
        {report.events.length === 0 ? (
          <Text style={{ color: colors.muted }}>No verified results yet.</Text>
        ) : (
          report.events.map((event) => (
            <EventBlock key={event.eventId} event={event} />
          ))
        )}
        <TeamScores report={report} />
        <MeetReportFooter report={report} />
      </Page>
    </Document>
  );
}
