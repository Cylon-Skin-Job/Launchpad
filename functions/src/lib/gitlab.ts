/**
 * GitLab API client — thin wrapper around REST API v4.
 */

const GITLAB_API = "https://gitlab.com/api/v4";

interface DiffFile {
  old_path: string;
  new_path: string;
  diff: string;
  new_file: boolean;
  renamed_file: boolean;
  deleted_file: boolean;
}

interface CompareResult {
  commits: Array<{ id: string; message: string }>;
  diffs: DiffFile[];
}

interface CommitAction {
  action: "create" | "update" | "delete";
  file_path: string;
  content?: string;
}

async function gitlabFetch(
  path: string,
  token: string,
  options: RequestInit = {}
): Promise<Response> {
  const res = await fetch(`${GITLAB_API}${path}`, {
    ...options,
    headers: {
      "PRIVATE-TOKEN": token,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitLab API ${res.status}: ${body}`);
  }
  return res;
}

/** Compare two commits and return the diff. */
export async function getDiff(
  token: string,
  projectId: number,
  fromSha: string,
  toSha: string
): Promise<CompareResult> {
  const path = `/projects/${projectId}/repository/compare?from=${fromSha}&to=${toSha}`;
  const res = await gitlabFetch(path, token);
  return res.json() as Promise<CompareResult>;
}

/** Get raw file content at a given ref. */
export async function getFileContent(
  token: string,
  projectId: number,
  filePath: string,
  ref: string
): Promise<string> {
  const encoded = encodeURIComponent(filePath);
  const path = `/projects/${projectId}/repository/files/${encoded}/raw?ref=${ref}`;
  const res = await gitlabFetch(path, token);
  return res.text();
}

/** Create a commit with one or more file changes. */
export async function commitFiles(
  token: string,
  projectId: number,
  branch: string,
  message: string,
  actions: CommitAction[]
): Promise<{ id: string }> {
  const path = `/projects/${projectId}/repository/commits`;
  const res = await gitlabFetch(path, token, {
    method: "POST",
    body: JSON.stringify({ branch, commit_message: message, actions }),
  });
  return res.json() as Promise<{ id: string }>;
}

export type { DiffFile, CompareResult, CommitAction };
