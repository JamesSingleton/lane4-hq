# 0005. A separate API service for native apps

- **Status:** Accepted
- **Date:** 2026-09-29
- **Supersedes:** [ADR 0002](0002-desktop-is-for-running-meets.md) decision 6 (desktop routes inside `apps/admin`)

## Context

ADR 0002 put the two desktop endpoints (download a meet, publish results) in `apps/admin` as `app/api/v1` route handlers. That made sense with one caller. Now more are planned:

- the desktop meet manager (macOS and Windows), possibly more than one desktop app;
- Expo mobile apps, possibly several;
- public live results for parents;
- admin itself, for anything it shares with those apps.

An API inside the admin Next.js app ties every client to admin's deploys, runtime, and routing. Admin runs on Vercel, where a long-lived API process with its own scaling doesn't fit.

## Decision

1. **`apps/api` is Lane4's API service.**
   - It uses Hono with `@hono/zod-openapi` on Node 24. Every route declares its zod schema, so the OpenAPI 3.1 document (`/openapi.json`, docs at `/docs`) comes from the code.
   - Routes live under `/v1`. Breaking changes get a new version, not edits in place.
   - It deploys to Railway from `apps/api/Dockerfile` (health check `/health`). The server ships as one esbuild bundle, because workspace packages export raw TypeScript.
2. **One auth, shared with admin.**
   - The API mounts the same Better Auth instance (`@lane4hq/auth/server`) at `/api/auth/*`, against the same database, so a session works on both.
   - Native apps send the session token as `Authorization: Bearer …` (the `bearer` plugin).
   - Desktop apps sign in by device code (the `device-authorization` plugin, RFC 8628). The app shows a code, the user approves it at `/device` in admin, and the app receives a session token for its OS keychain. Allowed clients are listed in `@lane4hq/auth/device-clients`.
   - The API runs with admin's `BETTER_AUTH_URL`, so device codes point people at admin's `/device` page and auth emails link to admin.
   - Expo apps will use the Expo plugin when mobile starts.
3. **Endpoints authorize inside, like Server Actions.** Each route calls an operation in `apps/api/src/operations/`. The operation takes the user id, looks up the team role itself (`requireTeamRole`), then reads or writes through `@lane4hq/db/queries`. Hosting a meet needs a coaching role (`MEET_HOSTING_ROLES`: owner, head coach, assistant coach).
4. **Hosted results are stored as published.**
   - `hosted_meets` holds one row per desktop meet id, owned by the first team to publish it. Another team can't publish into it.
   - `published_heats` holds one row per event, round, and heat. A higher revision replaces a lower one, the same revision is a no-op, and a lower revision is rejected with `409`.
   - Public results (`GET /v1/hosted-meets/{meetId}/results`) drop birthdays and USA Swimming ids.
5. **Rate limits and audit.**
   - Every `/v1` request is limited by IP before auth runs, then by user. Publishing has its own looser budget, because a deck machine drains its queue in a burst after being offline. Counters live in Upstash Redis, so limits hold across Railway replicas. If Redis is down, requests go through.
   - Changes are recorded in the existing `audit_log` table through one writer (`@lane4hq/db/audit`), in the same transaction as the change. Rows carry source, IP, user agent and request id. Account events such as device approvals and session revocations have no team. The API logs `results.heat.publish` and `meet.hosting.claimed`; Better Auth's after-hook logs `auth.*`.
6. **ADR 0002 decision 4 still holds for admin.** Admin's operations modules stay in `apps/admin`. Operations the API needs live in `apps/api` for now. When admin and the API both need one, it moves to a package.

## Consequences

- Desktop publishing, meet download, and future mobile apps share one versioned contract, and clients can generate code from the OpenAPI document.
- There are two server deploys (Vercel for admin, Railway for the API) sharing one database and auth secret. Both need the same `BETTER_AUTH_*` and `DATABASE_URL`.
- `HeatPublication` is defined twice: the TypeScript type in `@lane4hq/meet-engine/publish` and the zod schema in `apps/api`. A contract test builds a publication with the engine and parses it with the schema.
- Rate limits on `/v1` (Upstash, per IP and then per user, with a looser budget for publishing) and the publication audit log are in place. Still missing: a public results page that reads `GET /v1/hosted-meets/{meetId}/results`.
