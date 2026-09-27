import JSZip from "jszip";

const API = "https://api.github.com";

export interface PushFile {
  path: string;
  contentBase64: string;
}

export interface PushResult {
  sha: string;
  url: string;
  files: number;
}

export function getConfig() {
  return {
    token: process.env.GITHUB_TOKEN || "",
    repo: process.env.GITHUB_REPO || "DimalaxYT/bgh",
    branch: process.env.GITHUB_BRANCH || "main",
  };
}

function ghHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
    "User-Agent": "bgh-pusher",
  };
}

async function gh(path: string, token: string, init?: RequestInit) {
  return fetch(`${API}${path}`, {
    ...init,
    headers: ghHeaders(token),
    cache: "no-store",
  });
}

/** Normalize and validate a file path. Throws on invalid paths. */
export function sanitizePath(raw: string): string {
  let p = raw.replace(/\\/g, "/").trim();
  p = p.split("/")
    .filter((seg) => seg && seg !== "." && seg !== "..")
    .join("/");
  if (!p) throw new Error(`Chemin invalide : "${raw}"`);
  if (p.startsWith(".git/") || p === ".git" || p.includes("/.git/")) {
    throw new Error(`Chemin interdit (dans .git) : "${raw}"`);
  }
  return p;
}

/** Extract a base64-encoded zip into individual files (server-side). */
export async function extractZip(
  contentBase64: string
): Promise<PushFile[]> {
  const zip = await JSZip.loadAsync(Buffer.from(contentBase64, "base64"));
  const out: PushFile[] = [];
  const entries = Object.values(zip.files);
  for (const entry of entries) {
    if (entry.dir) continue;
    const name = entry.name;
    // Skip OS noise
    if (name.includes("__MACOSX") || name.endsWith(".DS_Store")) continue;
    const content = await entry.async("base64");
    try {
      out.push({ path: sanitizePath(name), contentBase64: content });
    } catch {
      // skip invalid paths inside the zip
    }
  }
  if (out.length === 0) throw new Error("L'archive zip ne contient aucun fichier exploitable.");
  return out;
}

/**
 * Push a batch of files to GitHub as a single commit.
 * Handles the empty-repository case (no existing branch/ref yet).
 */
export async function pushFiles(
  files: PushFile[],
  message: string
): Promise<PushResult> {
  const { token, repo, branch } = getConfig();
  if (!token) throw new Error("GITHUB_TOKEN n'est pas configuré côté serveur.");
  if (files.length === 0) throw new Error("Aucun fichier à pousser.");
  const base = `/repos/${repo}`;

  // 1. Locate the branch tip (may not exist on an empty repo)
  const refRes = await gh(`${base}/git/ref/heads/${branch}`, token);
  let baseCommitSha: string | null = null;
  let baseTreeSha: string | null = null;
  if (refRes.ok) {
    baseCommitSha = (await refRes.json()).object.sha as string;
    const commitRes = await gh(`${base}/git/commits/${baseCommitSha}`, token);
    if (commitRes.ok) baseTreeSha = (await commitRes.json()).tree.sha as string;
  } else if (refRes.status !== 404) {
    const err = await refRes.json().catch(() => ({}));
    throw new Error(
      `Impossible de lire la branche "${branch}" (${refRes.status}) : ${err.message ?? "erreur GitHub"}`
    );
  }

  // 2. Create blobs
  const treeItems: { path: string; mode: string; type: string; sha: string }[] = [];
  for (const file of files) {
    const blobRes = await gh(`${base}/git/blobs`, token, {
      method: "POST",
      body: JSON.stringify({ content: file.contentBase64, encoding: "base64" }),
    });
    if (!blobRes.ok) {
      const err = await blobRes.json().catch(() => ({}));
      throw new Error(`Échec création blob pour ${file.path} (${blobRes.status}) : ${err.message ?? "?"}`);
    }
    treeItems.push({
      path: file.path,
      mode: "100644",
      type: "blob",
      sha: (await blobRes.json()).sha,
    });
  }

  // 3. Create tree (based on current tree when it exists)
  const treeBody: Record<string, unknown> = { tree: treeItems };
  if (baseTreeSha) treeBody.base_tree = baseTreeSha;
  const treeRes = await gh(`${base}/git/trees`, token, {
    method: "POST",
    body: JSON.stringify(treeBody),
  });
  if (!treeRes.ok) {
    const err = await treeRes.json().catch(() => ({}));
    throw new Error(`Échec création tree (${treeRes.status}) : ${err.message ?? "?"}`);
  }
  const treeSha = (await treeRes.json()).sha as string;

  // 4. Create the commit
  const commitBody: Record<string, unknown> = {
    message,
    tree: treeSha,
    parents: baseCommitSha ? [baseCommitSha] : [],
  };
  const commitRes = await gh(`${base}/git/commits`, token, {
    method: "POST",
    body: JSON.stringify(commitBody),
  });
  if (!commitRes.ok) {
    const err = await commitRes.json().catch(() => ({}));
    throw new Error(`Échec création commit (${commitRes.status}) : ${err.message ?? "?"}`);
  }
  const commit = (await commitRes.json()) as { sha: string; html_url?: string };

  // 5. Move the branch (create it if this was the initial commit)
  const refBody = JSON.stringify({ sha: commit.sha, force: false });
  const updateRes = await gh(`${base}/git/refs/heads/${branch}`, token, {
    method: "PATCH",
    body: refBody,
  });
  if (!updateRes.ok) {
    const createRes = await gh(`${base}/git/refs`, token, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha }),
    });
    if (!createRes.ok) {
      const err = await createRes.json().catch(() => ({}));
      throw new Error(
        `Commit créé mais impossible de déplacer la branche (${createRes.status}) : ${err.message ?? "?"}`
      );
    }
  }

  return {
    sha: commit.sha,
    url: commit.html_url || `https://github.com/${repo}/commit/${commit.sha}`,
    files: files.length,
  };
}

export interface RepoStatus {
  tokenValid: boolean;
  login: string | null;
  repo: string;
  branch: string;
  repoFound: boolean;
  isPrivate: boolean | null;
  empty: boolean;
  error: string | null;
  commits: { sha: string; message: string; url: string; date: string }[];
}

export async function getStatus(): Promise<RepoStatus> {
  const { token, repo, branch } = getConfig();
  const status: RepoStatus = {
    tokenValid: false,
    login: null,
    repo,
    branch,
    repoFound: false,
    isPrivate: null,
    empty: true,
    error: null,
    commits: [],
  };

  if (!token) {
    status.error = "GITHUB_TOKEN manquant côté serveur.";
    return status;
  }

  const userRes = await gh("/user", token);
  if (userRes.ok) status.login = (await userRes.json()).login;
  else {
    status.error = `Token invalide ou expiré (${userRes.status}).`;
    return status;
  }
  status.tokenValid = true;

  const repoRes = await gh(`/repos/${repo}`, token);
  if (!repoRes.ok) {
    status.error = `Repo "${repo}" inaccessible (${repoRes.status}). Vérifie le nom et la portée du token.`;
    return status;
  }
  const repoData = await repoRes.json();
  status.repoFound = true;
  status.isPrivate = repoData.private as boolean;

  const commitsRes = await gh(`/repos/${repo}/commits?sha=${branch}&per_page=8`, token);
  if (commitsRes.ok) {
    const list = (await commitsRes.json()) as {
      sha: string;
      html_url: string;
      commit: { message: string; author: { date: string } };
    }[];
    status.empty = list.length === 0;
    status.commits = list.map((c) => ({
      sha: c.sha.slice(0, 7),
      message: c.commit.message.split("\n")[0],
      url: c.html_url,
      date: c.commit.author?.date ?? "",
    }));
  }
  return status;
}
