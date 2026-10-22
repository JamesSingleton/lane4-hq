import { listBetaAccessRequests } from "@lane4hq/db/queries/beta-requests";
import type { Metadata } from "next";
import Link from "next/link";
import { listOpenGitHubIssues } from "@/lib/github-issues";

export const metadata: Metadata = { title: "Home" };

export default async function HomePage() {
  const [requests, issues] = await Promise.all([
    listBetaAccessRequests(20),
    listOpenGitHubIssues(),
  ]);
  const pending = requests.filter((request) => request.status === "pending");

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Home</h1>
        <p className="text-muted-foreground text-sm">
          Who is waiting to join, and what is open on GitHub.
        </p>
      </div>
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold">
            Access requests ({pending.length})
          </h2>
          <Link
            href="/requests"
            className="text-sm underline underline-offset-4"
          >
            Review
          </Link>
        </div>
        {pending.length === 0 ? (
          <p className="text-muted-foreground text-sm">No open requests.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {pending.slice(0, 5).map((request) => (
              <li
                key={request.id}
                className="rounded-md border px-3 py-2 text-sm"
              >
                <p className="font-medium">
                  {request.name}{" "}
                  <span className="text-muted-foreground font-normal">
                    {request.email}
                  </span>
                </p>
                <p className="text-muted-foreground">{request.team}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold">
            GitHub issues{issues.ok ? ` (${issues.issues.length})` : ""}
          </h2>
          <Link href="/issues" className="text-sm underline underline-offset-4">
            Open
          </Link>
        </div>
        {issues.ok ? (
          issues.issues.length === 0 ? (
            <p className="text-muted-foreground text-sm">No open issues.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {issues.issues.slice(0, 5).map((issue) => (
                <li key={issue.number} className="text-sm">
                  <a
                    href={issue.htmlUrl}
                    className="underline underline-offset-4"
                  >
                    #{issue.number} {issue.title}
                  </a>
                </li>
              ))}
            </ul>
          )
        ) : (
          <p className="text-muted-foreground text-sm">
            {issues.error}{" "}
            <a href={issues.href} className="underline underline-offset-4">
              Open GitHub
            </a>
          </p>
        )}
      </section>
    </div>
  );
}
