# Lane4 HQ — Agent conventions

Short rules for AI agents working in this monorepo. Prefer existing packages and patterns over inventing new ones.

## Models

When spawning subagents or choosing a model for work in this repo, **only** use:

- **Composer 2.5** (`composer-2.5` / `composer-2.5-fast`)
- **Cursor Grok 4.5** (`cursor-grok-4.5-high`)

Do not use other model families (Claude, GPT, GLM, etc.) unless the human explicitly overrides this rule in the current message.

## Product posture

- **Admin (`apps/admin`)** is a **visiting-team** coach SaaS: roster, entries, results, workouts, calendar for meets your team attends.
- **Desktop (`apps/desktop`)** is a local-first Tauri v2 app for **macOS and Windows** ([ADR 0001](docs/adr/0001-tauri-for-desktop.md)). It is Lane4's **meet manager**, like Hy-Tek Meet Manager or SwimTopia's meet app. It:
  - builds a meet from the host's event file and merges each team's entry pack;
  - seeds heats;
  - pulls races from Colorado Time Systems consoles over serial;
  - lets officials verify results, scores, and places;
  - builds finals from prelims, scores diving, and prints heat sheets and results (`@lane4hq/reports/meet-program`);
  - exports per-team results files, and publishes verified heats when online.

  It does **not** copy admin screens. Team management stays on the web ([ADR 0002](docs/adr/0002-desktop-is-for-running-meets.md)). See [`docs/specs/desktop-roadmap.md`](docs/specs/desktop-roadmap.md), [ADR 0003](docs/adr/0003-cts-timing-interface-split.md) (CTS transport/codec), and [ADR 0004](docs/adr/0004-offline-meet-store-and-publishing.md) (offline store and publishing).
- **API (`apps/api`)** is the versioned HTTP API for the desktop, future Expo mobile apps, and public live results ([ADR 0005](docs/adr/0005-lane4-api-service.md)). It uses Hono with zod-openapi on Node, is deployed to Railway, and mounts the shared Better Auth (bearer tokens, device-code sign-in approved at admin's `/device`). New routes declare zod schemas under `/v1`, and authorize inside an operation (`requireTeamRole`), never in the route alone.
- **Not yet built:** meet download in the desktop (the API serves programs), the public live-results page, timer setups writes (`I…`), CL2/SD3 result writers, and HY3 split (G1) records.
- **Out of scope for now:** family/parent portal, dues/messaging.
- **Future (do not build unless asked):** host entry merge → public marketing roadmap on `apps/web`.

## Swim file formats

- **Runtime parsers/exporters:** `@lane4hq/swim-formats` (TypeScript). Import from package subpaths (e.g. `@lane4hq/swim-formats/hy3`), not ad-hoc parsers.
- **Oracle only:** the external Python [`hytek-parser`](https://github.com/SwimComm/hytek-parser) package is a **parity reference** for HY3/HYV — not a production sidecar.
- Supported interchange: HY3, CL2, EV3, HYV, SDIF/SD3, XLS (MM event reports), ZIP packs.
- Fixtures live in `packages/swim-formats/fixtures/` (PII-safe mirrors of real TM/MM packs). Do not commit raw coach dumps outside that discipline.
- **Do not invent new format parsers without golden / Vitest coverage** against those fixtures.

## Testing

- Format work is not done until `pnpm --filter @lane4hq/swim-formats test` passes (Vitest + coverage).
- Prefer golden corpus tests (`__tests__/meet/golden-corpus.test.ts`) and export→re-import round-trips for export changes.
- Domain helpers (athlete match, entry limits, QT) belong in `@lane4hq/swim-core` with unit tests.
- API: `pnpm --filter @lane4hq/api test`. It mocks `@lane4hq/db` and auth, and includes a contract test that the meet engine's `HeatPublication` parses with the API schema. Change both sides together.
- Desktop: `pnpm --filter @lane4hq/desktop test` (TS) and `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml` (Rust). Keep Rust thin (OS, files, serial I/O, keychain, HTTP). Domain logic stays in TS packages: `pnpm --filter @lane4hq/timing-cts test` and `pnpm --filter @lane4hq/meet-engine test`.
- CTS codec changes need golden vectors (vendor hex from F397) and must keep the Rust framing in `src-tauri/src/timing/frame.rs` in sync with `packages/timing-cts/src/frame.ts`.
- Desktop runtime code must run in macOS 11's WKWebView: no ES2023 array methods (`toSorted`, `findLast`, `at`, …) and no `crypto.randomUUID`.
- Desktop UI must work in both WebKit (macOS) and WebView2 (Windows). Handle file paths only through Tauri/Rust APIs, never by joining strings.

## Apps & packages

| Area | Package / app |
|------|----------------|
| Coach SaaS | `apps/admin` |
| API for native apps and live results (Hono, Railway) | `apps/api` |
| Desktop (Tauri, macOS + Windows) | `apps/desktop` |
| Marketing site | `apps/web` |
| Formats | `packages/swim-formats` |
| CTS timing codec + simulator | `packages/timing-cts` |
| Running a meet (entries merge, seeding, adjudication, standings, export, publish) | `packages/meet-engine` |
| Domain (times, events, match) | `packages/swim-core` |
| PDF / print reports | `packages/reports` |
| DB / authz | `packages/db`, `packages/auth` |
| UI | `packages/ui` |

## Skills to follow when relevant

- `.agents/skills/next-best-practices/` — Next.js / RSC
- `.agents/skills/vercel-react-best-practices/` — React performance
- `.agents/skills/frontend-design/` — distinctive UI (stay in admin design tokens)
- `.agents/skills/web-design-guidelines/` — a11y / WIG review
- `.agents/skills/vercel-composition-patterns/` — compound components, no boolean prop sprawl

## Auth & server actions

- Treat every Server Action like a public endpoint: authenticate and authorize inside the action (`requireTeamRole` / plan features).
- Meet import/export is gated to owner + head_coach and the `meet_import` plan feature.
- Changes to shared data and reads of sensitive data record an audit event with `writeAuditLog` (`@lane4hq/db/audit`). Name actions `area.thing.verb` (e.g. `results.heat.publish`). Pass the transaction so the event commits with the change, and pass an `AuditContext` (source, IP, user agent, request id). Never log secrets such as session tokens. Account events (sign-ins, sessions) have no team.
- The API follows Midday's layout (see `apps/api/README.md`): routers in `src/rest/routers/`, zod schemas in `src/schemas/`, outside clients in `src/services/`, helpers in `src/utils/`. A router mounted after `protectedMiddleware` in `rest/routers/index.ts` requires sign-in; only mount public routers above it. Each route adds `rateLimit("user")` (Upstash), or its own rule if it is bursty, and declares an `operationId`.
- The desktop's Lane4 server and admin URLs are fixed at build time (`LANE4_API_URL` / `LANE4_ADMIN_URL`, read in `publish.rs`). Never make them user-editable.
- Desktop updates come from signed `desktop-v*` GitHub releases (`.github/workflows/desktop-release.yml`) through `GET /v1/desktop/update`. Only builds given the updater public key update; never commit the private key.

## Agent skills

### Issue tracker

GitHub Issues in this repo (`gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles with matching label strings. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.
