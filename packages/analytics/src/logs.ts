import type { AnalyticsApp } from "./catalog";
import { posthogHosts } from "./context";

export type AnalyticsLog = {
  message: string;
  level: "info" | "warn" | "error";
  app: AnalyticsApp;
  environment: string;
  release: string;
  requestId?: string;
  route?: string;
  status?: number;
  durationMs?: number;
};

type OtlpAttribute = {
  key: string;
  value: { stringValue: string } | { intValue: number };
};

function attribute(key: string, value: string | number): OtlpAttribute {
  return typeof value === "number"
    ? { key, value: { intValue: value } }
    : { key, value: { stringValue: value } };
}

const SEVERITY: Record<AnalyticsLog["level"], number> = {
  info: 9,
  warn: 13,
  error: 17,
};

/** OTLP JSON. Request and response bodies are not accepted by this type. */
export function otlpLogsBody(records: AnalyticsLog[]) {
  return {
    resourceLogs: [
      {
        resource: {
          attributes: [attribute("service.name", records[0]?.app ?? "lane4")],
        },
        scopeLogs: [
          {
            logRecords: records.map((record) => {
              const attributes = [
                attribute("app", record.app),
                attribute("environment", record.environment),
                attribute("release", record.release),
              ];
              if (record.requestId) {
                attributes.push(attribute("request_id", record.requestId));
              }
              if (record.route)
                attributes.push(attribute("route", record.route));
              if (record.status != null) {
                attributes.push(attribute("status", record.status));
              }
              if (record.durationMs != null) {
                attributes.push(attribute("duration_ms", record.durationMs));
              }
              return {
                timeUnixNano: `${Date.now()}000000`,
                severityNumber: SEVERITY[record.level],
                severityText: record.level,
                body: { stringValue: record.message },
                attributes,
              };
            }),
          },
        ],
      },
    ],
  };
}

export async function sendOtlpLogs(options: {
  apiKey?: string | null;
  host?: string | null;
  records: AnalyticsLog[];
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const apiKey = options.apiKey?.trim();
  if (!apiKey || options.records.length === 0) return;
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = `${posthogHosts(options.host).ingest}/i/v1/logs`;
  try {
    await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(otlpLogsBody(options.records)),
    });
  } catch {
    // Logging must not break the request that produced it.
  }
}
