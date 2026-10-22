import { type Logger, logs, SeverityNumber } from "@opentelemetry/api-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  BatchLogRecordProcessor,
  LoggerProvider,
} from "@opentelemetry/sdk-logs";

function projectToken(): string {
  return (
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN?.trim() ||
    process.env.POSTHOG_API_KEY?.trim() ||
    ""
  );
}

function ingestHost(): string {
  return (
    process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() ||
    process.env.POSTHOG_HOST?.trim() ||
    "https://us.i.posthog.com"
  ).replace(/\/+$/, "");
}

/** Official PostHog logs exporter. Null when no project token is configured. */
export function createPosthogLogger(serviceName: string): {
  provider: LoggerProvider;
  logger: Logger;
} | null {
  const token = projectToken();
  if (!token) return null;
  const provider = new LoggerProvider({
    resource: resourceFromAttributes({ "service.name": serviceName }),
    processors: [
      new BatchLogRecordProcessor({
        exporter: new OTLPLogExporter({
          url: `${ingestHost()}/i/v1/logs`,
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }),
      }),
    ],
  });
  return { provider, logger: provider.getLogger(serviceName) };
}

export function registerPosthogLogs(
  sink: { provider: LoggerProvider } | null,
): void {
  if (process.env.NEXT_RUNTIME === "nodejs" && sink) {
    logs.setGlobalLoggerProvider(sink.provider);
  }
}

export function logRequestError(
  sink: { logger: Logger } | null,
  input: { route: string; method: string; errorName: string },
): void {
  sink?.logger.emit({
    body: "request error",
    severityNumber: SeverityNumber.ERROR,
    attributes: {
      route: input.route,
      method: input.method,
      error_name: input.errorName,
    },
  });
}
