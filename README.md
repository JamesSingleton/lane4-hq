# Lane4 HQ

Lane4 HQ is a visiting-team swim coach SaaS for rosters, meet entries, results, workouts, attendance, and calendars.

The coach app covers meets your team attends. Host-team entry merging, a family portal, and a timing console are outside the current scope.

## Architecture

```text
Next.js client
  -> Next.js server actions and route handlers
     -> Better Auth session and team authorization
        -> Drizzle + postgres.js -> Neon Postgres
        -> AWS S3 SDK -> Neon Object Storage
```

The Next.js backend owns database queries, authorization, uploads, and deletes. Browser components call that backend. Public logos and avatars are served through a same-origin route that resolves the current Neon branch's storage endpoint.

| Path | Purpose |
| --- | --- |
| `apps/admin` | Coach app |
| `apps/web` | Marketing site |
| `apps/desktop` | Electron app |
| `packages/db` | Drizzle schema, migrations, and queries |
| `packages/auth` | Better Auth configuration and authorization |
| `packages/storage` | Server-side logo and avatar storage |
| `packages/swim-core` | Swim domain logic |
| `packages/swim-formats` | Meet and roster parsers and exporters |
| `packages/reports` | PDF and print reports |
| `packages/ui` | Shared UI components |

## Local setup

Install Node.js 24+ and pnpm 11.22.0. [Create a Neon account](https://console.neon.tech), then choose or create a project in AWS Ohio (`aws-us-east-2`) or Frankfurt (`aws-eu-central-1`). Neon Object Storage is currently available in those regions.

Run from the repository root:

```bash
pnpm install
cp .env.example .env.local
npm i -g neon

neon auth
neon link --no-env-pull
neon deploy
neon env pull --file .env.local
```

`neon.ts` declares the `team-logos` and `user-avatars` buckets. Linking first and deploying next provisions those buckets before their branch credentials are pulled.

Generate a Better Auth secret:

```bash
openssl rand -base64 32
```

Set `BETTER_AUTH_SECRET` in `.env.local`, then apply the schema and start the coach app:

```bash
pnpm db:migrate
pnpm dev:admin
```

Open [localhost:3001](http://localhost:3001), sign up, and create a team.

The repository ignores `.env.local`, `.neon`, and generated MCP configuration. Keep credentials and linked project identifiers in those local files.

## Migrate an existing installation

Create database and object-storage backups before cutover. Keep the existing `BETTER_AUTH_SECRET` and application URLs so imported sessions and authentication flows remain valid.

1. Stop application writes.
2. Run the Neon setup commands above through `neon env pull` against a fresh target project. Do not sign up or create a team in the target.
3. Add `SOURCE_DATABASE_URL` with the existing direct Postgres connection to `.env.local`.
4. If an image origin resolves to a private address, add that exact origin to `IMAGE_IMPORT_ALLOWED_ORIGINS`. Separate multiple origins with commas.
5. Apply the target schema, then import:

```bash
pnpm db:migrate
pnpm migrate:existing
```

The importer:

- Imports into a target without users or teams, or resumes image migration only when every non-image value matches the source.
- Copies all `public` schema rows with `pg_dump` and `pg_restore`.
- Verifies every public table's row content, excluding the logo and avatar fields rewritten during image migration.
- Downloads existing public team logos and avatars, uploads them into the target branch, and rewrites their database values to branch-aware `/api/storage/` paths.
- Leaves the source database and objects unchanged.

The PostgreSQL client tools must be installed locally. Existing image URLs must use HTTP or HTTPS and remain anonymously readable during the import. Private addresses are blocked unless their exact origin is listed in `IMAGE_IMPORT_ALLOWED_ORIGINS`; a failed download stops the migration.

After the command succeeds, run the local user journeys against Neon before updating the application host. Keep the source read-only until the production smoke test passes, then remove `SOURCE_DATABASE_URL` from `.env.local`.

## Agent setup

The repository checks in the Neon skills installed by:

```bash
neon skills -y \
  --agent cursor \
  --agent claude-code \
  --skill neon \
  --skill neon-postgres \
  --skill neon-postgres-branches
```

After `neon link`, configure project-local OAuth MCP:

```bash
pnpm neon:mcp
```

The script reads the project ID from `.neon`, writes local Cursor and Claude Code configuration, and pins MCP tools to that project. Each agent requests Neon authorization on first use.

For a global Cursor installation with API-key authentication:

```bash
neon mcp -y --agent cursor --project-id <project-id>
```

This pins the tools to the selected project and reuses an existing compatible MCP key or mints a project-scoped key.

## Develop with branches

Neon branches copy the database and object storage together. Each feature can start with production-like rows and files, then change both in isolation.

Stop the app before switching branches:

```bash
neon checkout main
neon checkout dev-meet-import --create
pnpm db:migrate
pnpm dev:admin
```

`neon checkout` updates `.neon` and `.env.local`. Restarting the app loads the selected branch's database and storage credentials.

Inspect schema changes against the parent:

```bash
neon diff
```

Stop the app before returning:

```bash
neon checkout main
pnpm dev:admin
```

Git and Neon branches are separate. Commit Drizzle schema changes and generated migrations through Git; child-branch data is not merged into the parent.

Database and object-storage writes are isolated by Neon. Email, calendar, billing, and other third-party side effects are not. Leave those integration credentials empty on development branches unless you are using approved sandbox accounts. Production-derived branches can also contain sensitive data.

## Environment variables

Use [`.env.example`](.env.example) as the template.

| Variables | Purpose |
| --- | --- |
| `DATABASE_URL` | Pooled application connection |
| `DATABASE_URL_UNPOOLED` | Direct connection for Drizzle migrations |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Server-side storage credentials |
| `AWS_ENDPOINT_URL_S3`, `AWS_REGION` | Branch storage endpoint and region |
| `BETTER_AUTH_*`, `NEXT_PUBLIC_*` | Authentication and application origins |
| `RESEND_*`, `EMAIL_FROM` | Email delivery |
| `POLAR_*`, `STRIPE_*` | Billing integrations |
| `GOOGLE_*`, `MICROSOFT_*` | Social login and calendar integrations |
| `OPENAI_API_KEY` | Optional AI features |
| `USA_SWIMMING_*` | Optional SWIMS integration |
| `NEXT_PUBLIC_POSTHOG_*`, `POSTHOG_*`, `VITE_POSTHOG_*` | Optional product analytics. Empty keys disable it |

Neon fills the database and `AWS_*` values. Configure application and integration values separately.

## Database changes

The Drizzle schema lives in `packages/db/src/schema/`. Committed migrations and metadata live in `packages/db/drizzle/`.

```bash
pnpm db:generate
pnpm db:migrate
```

Runtime traffic uses the pooled `DATABASE_URL`. Drizzle migrations prefer the direct `DATABASE_URL_UNPOOLED`.

## Deployment

Three commands cover separate parts of a release:

```bash
neon deploy       # apply neon.ts infrastructure to the selected branch
pnpm db:migrate   # apply the Drizzle schema
pnpm build        # build the Next.js applications
```

`neon deploy` provisions backend services. Deploy the Next.js apps through the application host with the selected branch's database and storage variables plus the application secrets from `.env.example`.

See [the admin guide](apps/admin/README.md), [CONTRIBUTING.md](CONTRIBUTING.md), and [AGENTS.md](AGENTS.md).
