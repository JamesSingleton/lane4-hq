# 0002. The desktop app is for running meets

- **Status:** Accepted
- **Date:** 2026-09-28

## Context

We first planned for `apps/desktop` to be a copy of `apps/admin` in a desktop shell, and to run meets second. Parity would have needed:

- a versioned admin API with bearer auth;
- desktop sign-in with the token in the OS keychain;
- shared `packages/features-*` UI, with a data interface and cache invalidation owned by each app.

All of that delivers screens that admin already serves in any browser, on Mac, Windows, Chromebooks and iPads, with nothing to install.

Lane4's goal is the lowest barrier to entry. The web wins on that: no installer, no code signing warnings, no IT approval, and updates reach everyone at once. The only request for a desktop admin was "for those who want it", which an installable web app (PWA) covers.

Running a meet is different. The deck machine must keep working without internet, talk to the timing console over serial, and read and write Hy-Tek files locally. A browser can't do that reliably. That is why a desktop app exists at all. Hy-Tek ships Team Manager and Meet Manager as two desktop apps, but that split comes from before the web. Lane4's team manager is `apps/admin`.

Admin itself has two problems that matter whether or not desktop exists:

- About 128 Server Actions each inline the same steps: session, authz (`requireTeamRole`, plan features), validation, `@lane4hq/db` queries, then `revalidatePath`. There is no module beneath them, so any second caller (such as an HTTP route the deck machine calls) would repeat every step.
- A meet's lineup is read two ways. `getMeetDetailAction` feeds the entries pages and the Program view, which recompute lineup rules on the client. `loadMeetLineupSnapshot` (which has no authz of its own) feeds host packs, CSV, and paper reports.

## Decision

### Product

1. **The desktop app is Lane4's meet manager.** It covers:
   - the meet file inspector (shipped);
   - running a meet: seeding, heats, timing console results, and Hy-Tek export ([companion spec](../specs/desktop-companion-v1.spec.md), [ADR 0003](0003-cts-timing-interface-split.md)).

   It does not copy admin screens. There is one desktop app, not a team-management app and a meet-management app.
2. **Team management stays on the web.** `apps/admin` works well on phones and tablets, and can be installed as a PWA for anyone who wants an app icon. There is no desktop or native mobile team-management app until real demand shows up.
3. **Following a meet starts on the web.** The Meet Mobile–style experience starts as a public live-results page (on `apps/web`, or a public route in admin), showing what the deck machine publishes. Parents open a link and install nothing. A native mobile app comes later, if push notifications ("your swimmer's heat is next") justify it.

### Admin

4. **Team operations module.** Each feature gets an operations module inside `apps/admin`. Given the acting user, the team, and the input, it performs authz, plan-feature checks, validation, and the database read or write.
   - Server Actions are a thin adapter over it. The meet API for desktop (decision 6) is a second adapter when it arrives.
   - The adapter hands over identity only (`userId`). The operation always looks up the role itself, and never trusts a role resolved by a caller or a parent layout.
   - Operations live in `apps/admin`, not in a package. Promote them to a package only if a second server app appears.
   - Tests exercise the operation directly, with `@lane4hq/db/queries` mocked.
5. **The Meet lineup snapshot is the only read of a meet's lineup.**
   - One authorized operation loads it.
   - The entries page, Program view, host pack, CSV, and paper reports all consume it.
   - The entries page also reads **Entry candidates** alongside the snapshot, because it is where coaches pick swimmers. Host packs and paper reports never carry the whole roster.
   - Lineup rules (going, eligibility, scratch, association event caps) are computed once in `swim-core`, not again in the client.
   - The first slice is this read:
     - one operation, returning the snapshot plus Entry candidates;
     - a Server Action adapter;
     - every lineup consumer moved onto it, so `getMeetDetailAction` no longer serves the lineup.

     Admin behaviour is unchanged.

### Desktop and admin together

6. **Desktop talks to admin only around a meet.** Its admin API surface is:
   - download a meet onto the deck machine;
   - publish results.

   These are versioned route handlers (`apps/admin/app/api/v1/...`) with better-auth bearer tokens, built on the team operations module. They are built when meet running starts, not before.

   *Superseded by [ADR 0005](0005-lane4-api-service.md): these endpoints live in a separate API service, `apps/api`.*

## Consequences

- Admin gets cleaner on its own. Server Actions shrink to adapters, so `meets/actions.ts` and `roster/actions.ts` stop being where the logic lives.
- There is no `packages/features-*`, no desktop data interface, and no desktop sign-in for admin screens.
- The public API stays small: two meet endpoints, with the same authz as Server Actions because both sit on the team operations module. It still needs rate limits and audit.
- The desktop's users are meet hosts, meet directors and officials. They are often the same clubs as admin's visiting-team coaches, but they are a different buyer and a different sale.
- A growth loop replaces parity as the desktop's reason to exist:
  1. A host runs a meet on Lane4.
  2. Visiting clubs and parents see its published results.
  3. Some of those clubs adopt admin.

## Open questions

- How meet running works offline: the local source of truth, checking a meet out onto the deck machine, publishing when a connection is available, and conflicts. It also decides whether SQLite is enough or a sync engine is needed. This gets its own ADR before meet running is built.
