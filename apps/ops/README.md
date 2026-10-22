# Lane4 Ops

Operator dashboard for the person who runs Lane4. Coaches stay on `apps/admin`.

```bash
pnpm dev:ops
```

Local URL: `http://localhost:3005`. Sign-in only. Accounts live in `staff`, not the coach `user` table.

Create the first account from the repo root:

```bash
STAFF_NAME="Your Name" STAFF_EMAIL="you@lane4hq.com" STAFF_PASSWORD="a long password" pnpm staff:create
```

Later accounts are added from Staff inside the app. The dev script sets `BETTER_AUTH_URL` to this app so its cookies are `lane4-staff.session_token`, separate from the coach app.

`ADMIN_URL` is where "View as this user" lands. `OPS_URL` on the coach app is where Stop returns, and where access-request emails link.

Open GitHub issues are read with `GITHUB_RELEASE_TOKEN` from `DESKTOP_RELEASES_REPO` (default `JamesSingleton/lane4-hq`). A token that cannot list issues shows the error and a link. Nothing is written to the database.
