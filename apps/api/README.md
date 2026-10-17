# Lane4 API

The versioned HTTP API for Lane4's desktop meet manager, future mobile apps, and public live results ([ADR 0005](../../docs/adr/0005-lane4-api-service.md)). Hono with `@hono/zod-openapi` on Node 24.

## Run it

```sh
pnpm dev:api          # http://localhost:8080, reads the root .env.local
```

- `/docs`: API reference (Scalar)
- `/openapi.json`: OpenAPI 3.1 document. `pnpm --filter @lane4hq/api openapi` writes it to `apps/api/openapi.json` for client generators.
- `/api/auth/*`: Better Auth (bearer tokens, device-code sign-in)
- `/health`: liveness (the process is up). Railway's deploy healthcheck uses this, so a database blip doesn't fail a deploy.
- `/health/ready`: readiness. `503` with `{ checks: { database: "failed" } }` when Postgres doesn't answer within 3 s. The reason is logged, never returned.

Logs are one JSON object per line (`src/utils/logger.ts`): a `request` line per call (method, path, status, ms, request id, user id), plus errors with their request id. Health probes aren't logged. On `SIGTERM` the server stops accepting connections, closes the database pool, and exits within 12 s.

## Layout

Modeled on [Midday's API](https://github.com/midday-ai/midday/tree/main/apps/api), without tRPC. Import with the `@api/*` alias.

| Path | What |
|------|------|
| `src/rest/routers/` | One router per resource (`users`, `teams`, `hosted-meets`, `desktop`). `index.ts` mounts the public routers, then `protectedMiddleware`, then the signed-in ones, so a new router is signed-in unless it's mounted above that line. |
| `src/rest/middleware/` | `publicMiddleware` (client IP, per-IP rate limit), `protectedMiddleware` (bearer session), and `rateLimit(rule)` |
| `src/rest/utils/` | Request helpers: client IP, audit context |
| `src/rest/types.ts` | The Hono context (`AppEnv`) |
| `src/schemas/` | Zod request and response schemas with OpenAPI metadata, one file per resource |
| `src/operations/` | The work behind each route; every team operation authorizes with `requireTeamRole` |
| `src/services/` | Clients for outside services (GitHub releases, Upstash) |
| `src/utils/` | Env, logging, health, errors, validation |

`app.ts` builds the app (`createApp`, with services passed in so tests can fake them); `index.ts` wires the real services and starts the server.

Apply the database migrations first (`pnpm db:migrate`). The API uses the `hosted_meets`, `published_heats`, and `device_code` tables.

## Routes

| Route | Auth | What |
|-------|------|------|
| `GET /v1/me` | bearer | The user and their teams |
| `GET /v1/teams/{teamId}/meets` | coach | A team's meets |
| `GET /v1/teams/{teamId}/meets/{meetId}/program` | coach | A meet's numbered events |
| `GET /v1/teams/{teamId}/hosted-meets` | coach | Meets the team has published |
| `POST /v1/teams/{teamId}/hosted-meets/{meetId}/heats` | coach | Publish a verified heat (`lane4.heat-results/v1`) |
| `GET /v1/hosted-meets/{meetId}/results` | public | Live results, without birthdays or member ids |
| `GET /v1/desktop/update` | public | Tauri update manifest for the newest desktop release; `204` when there's none |
| `GET /v1/desktop/update/download/{assetId}` | public | Redirects to an installer from that release |

"Coach" means owner, head coach, or assistant coach of that team. Signed-out requests to any other `/v1` path get `401`, not `404`.

### Desktop updates

The desktop updater asks `/v1/desktop/update`. The API finds the newest published (not draft, not prerelease) GitHub release tagged `desktop-v*` in `DESKTOP_RELEASES_REPO`, returns its `latest.json` with download URLs pointing back at the API, and caches it for 5 minutes. Downloads redirect to GitHub, and only for assets of that release, so a private repo's token never leaves the server. Installers are verified by the app against its built-in public key; the API can't forge an update.

## Deploy (Railway)

Point a Railway service at this repo with `apps/api/railway.json`, which builds `apps/api/Dockerfile` from the repo root. Set:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | Same database as admin |
| `BETTER_AUTH_SECRET` | Same as admin |
| `BETTER_AUTH_URL` | **Admin's** URL, so device codes point at admin's `/device` page and auth emails link to admin |
| `API_ALLOWED_ORIGINS` | Comma-separated browser origins that may call the API (e.g. the web app). Native apps send no `Origin`. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Rate limiting. Required when `NODE_ENV=production`; without them locally, limits are off. |
| `DESKTOP_RELEASES_REPO` | `owner/name` with the `desktop-v*` releases. Defaults to `JamesSingleton/lane4-hq`. |
| `GITHUB_RELEASE_TOKEN` | Read-only token for that repo's releases; required while it's private |
| `RESEND_*`, `EMAIL_FROM`, `POLAR_*`, `GOOGLE_*`, `MICROSOFT_*` | Same as admin (Better Auth sends email and loads its plugins) |

## Rate limits

Sliding windows in Upstash Redis (`src/rest/middleware/rate-limit.ts`, `src/services/upstash.ts`). Responses carry `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset`; a `429` adds `Retry-After`. If Redis errors or takes over a second, requests go through.

| Rule | Applies to | Key | Limit |
|------|-----------|-----|-------|
| `ip` | every `/v1` request, before auth | client IP (`X-Real-IP`) | 600/min |
| `user` | signed-in reads | user | 120/min |
| `publish` | `POST …/heats` | user | 600/min |

Sign-in routes under `/api/auth` use Better Auth's own limiter. The desktop stops draining its publish queue on a `429` and resumes on the next pass.

Railway sets `PORT`.
