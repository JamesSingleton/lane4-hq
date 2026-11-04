import type { ReactNode } from "react";
import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  pixelBasedPreset,
  Row,
  Section,
  Tailwind,
  Text,
} from "react-email";
import { getBaseUrl } from "../client";

/**
 * Lane4's email look. Dark first, sharp contrast, no decoration: a near-black
 * page, one panel, big tight headings, a white button. Color only marks state
 * (done, heads up, act now), never style. Built from tables and inline styles
 * (no flexbox, media queries, SVG, or dark-mode selectors) so it holds up in
 * Gmail, Outlook, and Apple Mail.
 */
const colors = {
  night: "#07080b",
  panel: "#0e1115",
  raised: "#151a1f",
  line: "#20262d",
  white: "#fdfdfd",
  body: "#b9c0c6",
  muted: "#7f8992",
  lane: "#6fd3e0",
  pool: "#0c2430",
  okFg: "#4ade9a",
  okBg: "#0e2a1f",
  okLine: "#1c4a36",
  warnFg: "#ffcc4d",
  warnBg: "#2a2110",
  warnLine: "#4a3a14",
  stopFg: "#ff9592",
  stopBg: "#2c1214",
  stopLine: "#4d1d22",
};

/** `Hr` sets its own border inline, so the divider color goes inline too. */
const hairline = {
  border: "none",
  borderTop: `1px solid ${colors.line}`,
};

const tailwindConfig = {
  presets: [pixelBasedPreset],
  theme: {
    extend: {
      colors,
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Inter",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
        mono: ['"SF Mono"', "Menlo", "Consolas", "monospace"],
      },
    },
  },
};

/** Images are served by the marketing site in production. */
const assetBase =
  process.env.NODE_ENV === "production"
    ? "https://www.lane4hq.com/email"
    : "/static";

const MARKETING_URL = "https://www.lane4hq.com";

export type Tone = "ok" | "warn" | "stop";

const TONES: Record<Tone, { fg: string; bg: string; line: string }> = {
  ok: { fg: "text-okFg", bg: "bg-okBg", line: "border-okLine" },
  warn: { fg: "text-warnFg", bg: "bg-warnBg", line: "border-warnLine" },
  stop: { fg: "text-stopFg", bg: "bg-stopBg", line: "border-stopLine" },
};

interface EmailLayoutProps {
  /** Inbox preview line: what the email is about, in a sentence. */
  preview: string;
  /** Small label above the heading, e.g. "Account" or "Billing". */
  eyebrow: string;
  heading: string;
  /** Why this person got the email, shown in the footer. */
  reason: string;
  /** A state chip next to the label: done, heads up, or act now. */
  status?: { tone: Tone; label: string };
  children: ReactNode;
}

export function EmailLayout({
  preview,
  eyebrow,
  heading,
  reason,
  status,
  children,
}: EmailLayoutProps) {
  return (
    <Html lang="en">
      <Tailwind config={tailwindConfig}>
        <Head>
          {/* Already dark: ask clients not to invert it. */}
          <meta name="color-scheme" content="dark" />
          <meta name="supported-color-schemes" content="dark" />
        </Head>
        <Body className="m-0 bg-night py-12 font-sans">
          <Preview>{preview}</Preview>
          <Container className="mx-auto w-full max-w-[560px] px-4">
            <Section className="pb-8">
              <Row>
                <Column className="w-[40px]">
                  <Link href={MARKETING_URL}>
                    <Img
                      src={`${assetBase}/lane4-mark.png`}
                      width="28"
                      height="28"
                      alt="Lane4 HQ"
                      className="block rounded-[7px]"
                    />
                  </Link>
                </Column>
                <Column>
                  <Text className="m-0 font-semibold text-[15px] text-white tracking-[-0.2px]">
                    Lane4 HQ
                  </Text>
                </Column>
              </Row>
            </Section>

            <Section className="rounded-[16px] border border-line border-solid bg-panel">
              <Section className="px-10 pt-10 pb-10">
                <Row className="mb-4">
                  <Column>
                    <Text className="m-0 font-medium text-[13px] text-muted">
                      {eyebrow}
                    </Text>
                  </Column>
                  {status ? (
                    <Column className="text-right">
                      <StatusChip tone={status.tone} label={status.label} />
                    </Column>
                  ) : null}
                </Row>
                <Heading
                  as="h1"
                  className="m-0 mb-6 font-semibold text-[30px] text-white leading-[36px] tracking-[-0.8px]"
                >
                  {heading}
                </Heading>
                {children}
              </Section>
            </Section>

            <Section className="px-2 pt-8">
              <Text className="m-0 text-[12px] text-muted leading-[19px]">
                {reason}
              </Text>
              <Hr className="my-5" style={hairline} />
              <Row>
                <Column>
                  <Text className="m-0 text-[12px] text-muted leading-[18px]">
                    Meet entries, results, and rosters for swim coaches
                  </Text>
                </Column>
                <Column className="text-right">
                  <Text className="m-0 text-[12px] leading-[18px]">
                    <Link
                      href={getBaseUrl()}
                      className="text-body no-underline"
                    >
                      Open app
                    </Link>
                    <span className="text-muted">{"   ·   "}</span>
                    <Link
                      href={MARKETING_URL}
                      className="text-body no-underline"
                    >
                      lane4hq.com
                    </Link>
                  </Text>
                </Column>
              </Row>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

function StatusChip({ tone, label }: { tone: Tone; label: string }) {
  const t = TONES[tone];
  return (
    <Text
      className={`m-0 inline-block rounded-full border border-solid px-[10px] py-[3px] font-medium text-[12px] leading-[16px] ${t.fg} ${t.bg} ${t.line}`}
    >
      ●&nbsp;&nbsp;{label}
    </Text>
  );
}

/** A body paragraph. */
export function P({ children }: { children: ReactNode }) {
  return (
    <Text className="m-0 mb-4 text-[16px] text-body leading-[26px]">
      {children}
    </Text>
  );
}

/** Names that matter in a sentence: a team, a meet, a plan. */
export function B({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-white">{children}</strong>;
}

/**
 * The email's one main action: white on black. `showLink` adds the raw URL
 * underneath, for links people must be able to use even when buttons don't
 * render.
 */
export function EmailButton({
  href,
  children,
  showLink = false,
}: {
  href: string;
  children: ReactNode;
  showLink?: boolean;
}) {
  return (
    <Section className="mt-8 mb-6">
      <Button
        href={href}
        className="box-border rounded-[10px] bg-white px-6 py-[14px] text-center font-semibold text-[15px] text-night no-underline"
      >
        {children}
      </Button>
      {showLink ? (
        <Text className="m-0 mt-5 text-[13px] text-muted leading-[20px]">
          Or paste this link into your browser:
          <br />
          <Link href={href} className="break-all text-lane no-underline">
            {href}
          </Link>
        </Text>
      ) : null}
    </Section>
  );
}

/** A boxed note. With a `tone`, it marks a heads up or something to act on. */
export function Callout({
  tone,
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  const t = tone ? TONES[tone] : null;
  return (
    <Section
      className={`my-6 rounded-[12px] border border-solid px-5 py-4 ${
        t ? `${t.bg} ${t.line}` : "border-line bg-raised"
      }`}
    >
      <Text
        className={`m-0 text-[14px] leading-[22px] ${t ? t.fg : "text-body"}`}
      >
        {children}
      </Text>
    </Section>
  );
}

/** Big numbers side by side, each with a small label underneath. */
export function Stats({
  items,
}: {
  items: Array<{ label: string; value: number | string }>;
}) {
  return (
    <Section className="my-7 rounded-[12px] border border-line border-solid bg-raised">
      <Row>
        {items.map((item, i) => (
          <Column
            key={item.label}
            className={`px-6 py-5 align-top ${
              i === 0 ? "" : "border-0 border-line border-l border-solid"
            }`}
          >
            <Text className="m-0 font-semibold text-[38px] text-white leading-[42px] tracking-[-1.2px]">
              {item.value}
            </Text>
            <Text className="m-0 mt-1 text-[13px] text-muted">
              {item.label}
            </Text>
          </Column>
        ))}
      </Row>
    </Section>
  );
}

/** Label and value pairs, e.g. team, plan, role. */
export function Details({
  items,
}: {
  items: Array<{ label: string; value: ReactNode }>;
}) {
  return (
    <Section className="my-7 rounded-[12px] border border-line border-solid bg-raised">
      {items.map((item, i) => (
        <Row
          key={item.label}
          className={
            i === 0 ? "" : "border-0 border-line border-t border-solid"
          }
        >
          <Column className="w-[38%] px-5 py-[14px] align-top">
            <Text className="m-0 text-[13px] text-muted">{item.label}</Text>
          </Column>
          <Column className="px-5 py-[14px] align-top">
            <Text className="m-0 font-medium text-[14px] text-white">
              {item.value}
            </Text>
          </Column>
        </Row>
      ))}
    </Section>
  );
}

/** A one-time code, large and easy to read off. */
export function CodeBox({ code }: { code: string }) {
  return (
    <Section className="my-7 rounded-[12px] border border-line border-solid bg-raised px-5 py-7 text-center">
      <Text className="m-0 font-mono font-semibold text-[40px] text-white leading-[44px] tracking-[12px]">
        {code}
      </Text>
    </Section>
  );
}

/** A thin divider between parts of the panel. */
export function Divider() {
  return <Hr className="my-7" style={hairline} />;
}

/** Numbered next steps. */
export function Steps({
  items,
}: {
  items: Array<{ title: string; detail: string }>;
}) {
  return (
    <Section className="my-7">
      {items.map((item, i) => (
        <Row
          key={item.title}
          className={
            i === 0 ? "" : "border-0 border-line border-t border-solid"
          }
        >
          <Column className="w-[44px] py-4 align-top">
            <Text className="m-0 font-mono text-[13px] text-lane leading-[24px]">
              {String(i + 1).padStart(2, "0")}
            </Text>
          </Column>
          <Column className="py-4 align-top">
            <Text className="m-0 font-semibold text-[16px] text-white leading-[24px]">
              {item.title}
            </Text>
            <Text className="m-0 mt-1 text-[14px] text-muted leading-[21px]">
              {item.detail}
            </Text>
          </Column>
        </Row>
      ))}
    </Section>
  );
}

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  head_coach: "Head coach",
  assistant_coach: "Assistant coach",
  admin: "Admin",
  member: "Member",
};

/** `head_coach` → "Head coach". */
export function roleLabel(role: string): string {
  return (
    ROLE_LABELS[role] ??
    role.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())
  );
}
