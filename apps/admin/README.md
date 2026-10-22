# Lane4 HQ Admin

The visiting-team coach app for rosters, meet entries, results, workouts, attendance, and calendars. It uses Next.js, Better Auth, Drizzle, Neon Postgres, and Neon Object Storage.

## Run locally

Follow the [root setup guide](../../README.md#local-setup) to install the toolchain, link a Neon project, provision storage, and configure `.env.local`.

Then run from the repository root:

```bash
pnpm db:migrate
pnpm dev:admin
```

Open [localhost:3001](http://localhost:3001), sign up, and create a team at `/onboarding`.

## Request flow

```text
Browser
  -> Next.js server action or route
     -> Better Auth session
     -> Team membership, role, and feature checks
        -> Drizzle + postgres.js -> database
        -> AWS S3 SDK -> object storage
```

Database queries and authenticated storage operations run in the existing Next.js backend. Every server action authenticates and authorizes its caller with helpers such as `requireTeamRole`, `requireTeamMember`, and the applicable plan checks.

## Database and migrations

`@lane4hq/db` owns the schema and queries:

- Schema: `packages/db/src/schema/`
- Migrations: `packages/db/drizzle/`
- Runtime connection: `DATABASE_URL`
- Migration connection: `DATABASE_URL_UNPOOLED`

After changing the schema, run from the repository root against a development branch:

```bash
pnpm db:generate
pnpm db:migrate
```

Review and commit the generated SQL and Drizzle metadata.

## Logos and avatars

[`neon.ts`](../../neon.ts) declares two `public_read` buckets:

| Bucket | Contents |
| --- | --- |
| `team-logos` | Team logos |
| `user-avatars` | Coach avatars |

`@lane4hq/storage` uses the AWS S3 SDK from server actions. Uploads accept JPEG, PNG, WebP, AVIF, and SVG files up to 2 MiB. Each upload receives a UUID-based object key.

The database stores stable same-origin paths under `/api/storage/`. That public route resolves each object against the active branch's `AWS_ENDPOINT_URL_S3`, so inherited rows and objects stay together when a contributor checks out a Neon branch.

## Branch workflow

Stop the app, create or select a branch, apply migrations, then restart:

```bash
neon checkout main
neon checkout dev-feature --create
pnpm db:migrate
pnpm dev:admin
```

Inspect schema changes with `neon diff`. Stop the app before `neon checkout main`, then restart it to load the parent branch credentials.

Neon isolates database and object-storage writes. External email, calendar, and billing systems remain shared. Leave those credentials empty for development unless you are testing with approved sandbox accounts.

## Routes

| Route | Purpose |
| --- | --- |
| `/sign-in`, `/sign-up` | Coach authentication. Sign-up requires a beta invite or a team invitation. |
| `/beta` | Send private-beta invites and impersonate a user (`BETA_OPERATOR_EMAILS`) |
| `/forgot-password`, `/reset-password`, `/2fa` | Account recovery and two-factor authentication |
| `/onboarding` | Create the first team |
| `/team/[teamId]` | Team dashboard |
| `/team/[teamId]/roster` | Swimmer roster |
| `/team/[teamId]/meets` | Meets, entries, and results |
| `/team/[teamId]/workouts` | Workouts |
| `/team/[teamId]/attendance` | Practice attendance |
| `/team/[teamId]/calendar` | Team calendar |
| `/team/[teamId]/progression` | Time trends and meet history |
| `/team/[teamId]/analytics` | Team volume, attendance, and top times |
| `/team/[teamId]/settings` | Team settings and logo |
| `/team/[teamId]/settings/account` | Account settings and avatar |
| `/team/[teamId]/settings/billing` | Subscription management |
| `/team/[teamId]/settings/usa-swimming` | SWIMS integration |

## Verify

Run from the repository root:

```bash
pnpm check:types
pnpm lint
pnpm test
pnpm build
```

If the development cache grows too large, stop the app before running `pnpm clean:admin`.

See the [root deployment guide](../../README.md#deployment) for infrastructure, migration, and application deployment.
