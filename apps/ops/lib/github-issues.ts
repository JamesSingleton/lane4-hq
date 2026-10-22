export type GitHubIssue = {
  number: number;
  title: string;
  htmlUrl: string;
  labels: string[];
};

const CACHE_MS = 5 * 60 * 1000;

let cache: { at: number; repo: string; issues: GitHubIssue[] } | null = null;

export function parseGitHubIssues(payload: unknown): GitHubIssue[] {
  if (!Array.isArray(payload)) return [];
  const issues: GitHubIssue[] = [];
  for (const item of payload) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (row.pull_request) continue;
    if (
      typeof row.number !== "number" ||
      typeof row.title !== "string" ||
      typeof row.html_url !== "string"
    ) {
      continue;
    }
    const labels = Array.isArray(row.labels)
      ? row.labels.flatMap((label) => {
          if (!label || typeof label !== "object") return [];
          const name = (label as { name?: unknown }).name;
          return typeof name === "string" ? [name] : [];
        })
      : [];
    issues.push({
      number: row.number,
      title: row.title,
      htmlUrl: row.html_url,
      labels,
    });
  }
  return issues;
}

export function githubIssuesPage(repo: string): string {
  return `https://github.com/${repo}/issues`;
}

export async function listOpenGitHubIssues(options?: {
  repo?: string;
  token?: string;
  now?: number;
  fetch?: typeof fetch;
}): Promise<
  | { ok: true; issues: GitHubIssue[]; href: string }
  | { ok: false; error: string; href: string }
> {
  const repo =
    options?.repo ??
    process.env.DESKTOP_RELEASES_REPO ??
    "JamesSingleton/lane4-hq";
  const href = githubIssuesPage(repo);
  const token = options?.token ?? process.env.GITHUB_RELEASE_TOKEN;
  if (!token) {
    return { ok: false, error: "GITHUB_RELEASE_TOKEN is not set.", href };
  }

  const now = options?.now ?? Date.now();
  if (cache && cache.repo === repo && now - cache.at < CACHE_MS) {
    return { ok: true, issues: cache.issues, href };
  }

  try {
    const http = options?.fetch ?? fetch;
    const response = await http(
      `https://api.github.com/repos/${repo}/issues?state=open&per_page=30`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "User-Agent": "Lane4-Ops",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );
    if (!response.ok) {
      return { ok: false, error: `GitHub answered ${response.status}.`, href };
    }
    const issues = parseGitHubIssues(await response.json());
    cache = { at: now, repo, issues };
    return { ok: true, issues, href };
  } catch {
    return { ok: false, error: "Could not reach GitHub.", href };
  }
}
