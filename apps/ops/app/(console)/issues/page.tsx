import type { Metadata } from "next";
import { listOpenGitHubIssues } from "@/lib/github-issues";

export const metadata: Metadata = { title: "Issues" };

export default async function IssuesPage() {
  const result = await listOpenGitHubIssues();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Issues</h1>
        <p className="text-muted-foreground text-sm text-balance">
          Open GitHub issues. This list is read when the page loads and is not
          stored. The marketing support form still sends email.
        </p>
      </div>
      {result.ok ? (
        result.issues.length === 0 ? (
          <p className="text-muted-foreground text-sm">No open issues.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {result.issues.map((issue) => (
              <li key={issue.number} className="rounded-md border px-3 py-2">
                <a
                  href={issue.htmlUrl}
                  className="text-sm font-medium underline underline-offset-4"
                >
                  #{issue.number} {issue.title}
                </a>
                {issue.labels.length > 0 ? (
                  <p className="text-muted-foreground mt-1 text-xs">
                    {issue.labels.join(", ")}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )
      ) : (
        <p className="text-sm">
          {result.error}{" "}
          <a href={result.href} className="underline underline-offset-4">
            Open GitHub
          </a>
        </p>
      )}
    </div>
  );
}
