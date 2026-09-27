import JSZip from "jszip";

const API = "https://api.github.com";

/* ------------------------------------------------------------------ */
/* Configuration : env + override en mémoire (modifiable via l'UI)     */
/* ------------------------------------------------------------------ */

type ConfigOverride = { token?: string; repo?: string; branch?: string };

const g = globalThis as unknown as { __bghPusherCfg?: ConfigOverride };

export function setConfigOverride(partial: ConfigOverride) {
  const clean = Object.fromEntries(
    Object.entries(partial).filter(([, v]) => typeof v === "string" && v.trim() !== "")
  ) as ConfigOverride;
  g.__bghPusherCfg = { ...(g.__bghPusherCfg ?? {}), ...clean };
}

export function clearConfigOverride() {
  g.__bghPusherCfg = undefined;
}

export function getConfig() {
  const o = g.__bghPusherCfg ?? {};
  const token = o.token || process.env.GITHUB_TOKEN || "";
  const repo = o.repo || process.env.GITHUB_REPO || "DimalaxYT/bgh";
  const branch = o.branch || process.env.GITHUB_BRANCH || "main";
  return {
    token,
    repo,
    branch,
    tokenSource: (o.token ? "custom" : process.env.GITHUB_TOKEN ? "env" : "none") as
      | "custom"
      | "env"
      | "none",
  };
}

export function maskToken(token: string): string {
  if (!token) return "";
  if (token.length <= 16) return `${token.slice(0, 4)}…`;
  return `${token.slice(0, 11)}…${token.slice(-4)}`;
}

/* ------------------------------------------------------------------ */
/* Client HTTP GitHub                                                  */
/* ------------------------------------------------------------------ */

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

/** Encode un chemin de fichier pour l'URL (conserve les /). */
function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

/* ------------------------------------------------------------------ */
/* Utilitaires fichiers                                                */
/* ------------------------------------------------------------------ */

export interface PushFile {
  path: string;
  contentBase64: string;
}

export interface PushResult {
  sha: string;
  url: string;
  files: number;
}

/** Normalize and validate a file path. Throws on invalid paths. */
export function sanitizePath(raw: string): string {
  let p = raw.replace(/\\/g, "/").trim();
  p = p
    .split("/")
    .filter((seg) => seg && seg !== "." && seg !== "..")
    .join("/");
  if (!p) throw new Error(`Chemin invalide : "${raw}"`);
  if (p.startsWith(".git/") || p === ".git" || p.includes("/.git/")) {
    throw new Error(`Chemin interdit (dans .git) : "${raw}"`);
  }
  return p;
}

/** Extract a base64-encoded zip into individual files (server-side). */
export async function extractZip(contentBase64: string): Promise<PushFile[]> {
  const zip = await JSZip.loadAsync(Buffer.from(contentBase64, "base64"));
  const out: PushFile[] = [];
  const entries = Object.values(zip.files);
  for (const entry of entries) {
    if (entry.dir) continue;
    const name = entry.name;
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

/* ------------------------------------------------------------------ */
/* Push (création / modification de fichiers en un commit)             */
/* ------------------------------------------------------------------ */

/**
 * Push a batch of files to GitHub as a single commit.
 * Handles the empty-repository case (no existing branch/ref yet).
 * Pushing an existing path = modification.
 * replace=true : omets base_tree → l'arbre créé devient TOUT le contenu
 * du dépôt (les fichiers existants absents du lot sont supprimés).
 */
export async function pushFiles(
  files: PushFile[],
  message: string,
  replace = false
): Promise<PushResult> {
  const { token, repo, branch } = getConfig();
  if (!token) throw new Error("Aucun token configuré (env ou interface).");
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

  // 3. Create tree (based on current tree when it exists — sauf en mode replace)
  const treeBody: Record<string, unknown> = { tree: treeItems };
  if (baseTreeSha && !replace) treeBody.base_tree = baseTreeSha;
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

/* ------------------------------------------------------------------ */
/* Lecture : arborescence + contenu d'un fichier                       */
/* ------------------------------------------------------------------ */

export interface TreeFile {
  path: string;
  size: number;
}

export interface TreeListing {
  files: TreeFile[];
  truncated: boolean;
}

export async function listFiles(): Promise<TreeListing> {
  const { token, repo, branch } = getConfig();
  if (!token) throw new Error("Aucun token configuré.");
  const res = await gh(`/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`, token);
  if (res.status === 404) {
    // Particularité GitHub : /git/trees renvoie 404 quand l'arbre est vide
    // (ex : dépôt vidé via un commit « wipe »). On confirme via /contents.
    const rootRes = await gh(`/repos/${repo}/contents/?ref=${encodeURIComponent(branch)}`, token);
    if (rootRes.ok) {
      const root = await rootRes.json();
      if (Array.isArray(root) && root.length === 0) {
        return { files: [], truncated: false };
      }
    }
    throw new Error(`Branche "${branch}" introuvable ou arbre inaccessible (404).`);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Impossible de lister les fichiers (${res.status}) : ${err.message ?? "?"}`);
  }
  const data = (await res.json()) as {
    truncated?: boolean;
    tree?: { path: string; type: string; size?: number }[];
  };
  const files = (data.tree ?? [])
    .filter((e) => e.type === "blob")
    .map((e) => ({ path: e.path, size: e.size ?? 0 }))
    .sort((a, b) => a.path.localeCompare(b.path));
  return { files, truncated: !!data.truncated };
}

export interface FileContent {
  path: string;
  sha: string;
  size: number;
  content: string;
  isText: boolean;
}

export async function getFile(path: string): Promise<FileContent> {
  const { token, repo, branch } = getConfig();
  if (!token) throw new Error("Aucun token configuré.");
  const res = await gh(
    `/repos/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`,
    token
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Impossible de lire "${path}" (${res.status}) : ${err.message ?? "?"}`);
  }
  const data = (await res.json()) as {
    path: string;
    sha: string;
    size: number;
    content?: string;
  };
  const buf = Buffer.from(data.content ?? "", "base64");
  // Heuristique binaire : octet nul dans les 8 premiers Ko, ou fichier > 1 Mo
  const isText = data.size <= 1_000_000 && !buf.subarray(0, 8000).includes(0);
  return {
    path: data.path,
    sha: data.sha,
    size: data.size,
    content: isText ? buf.toString("utf8") : "",
    isText,
  };
}

/* ------------------------------------------------------------------ */
/* Suppression d'un fichier (Contents API, 1 commit par fichier)       */
/* ------------------------------------------------------------------ */

export async function deleteFile(
  path: string,
  sha: string,
  message: string
): Promise<{ sha: string; url: string }> {
  const { token, repo, branch } = getConfig();
  if (!token) throw new Error("Aucun token configuré.");
  const res = await gh(`/repos/${repo}/contents/${encodePath(path)}`, token, {
    method: "DELETE",
    body: JSON.stringify({ message, sha, branch }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Suppression impossible (${res.status}) : ${err.message ?? "?"}`);
  }
  const data = (await res.json()) as { commit?: { sha: string; html_url?: string } };
  return {
    sha: data.commit?.sha ?? "",
    url: data.commit?.html_url ?? `https://github.com/${repo}/commit/${data.commit?.sha ?? ""}`,
  };
}

/* ------------------------------------------------------------------ */
/* Wipe : vider tout le dépôt en UN SEUL commit (arbre vide)           */
/* ------------------------------------------------------------------ */

export interface WipeResult {
  sha: string;
  url: string;
  removed: number;
  alreadyEmpty: boolean;
}

/**
 * Supprime tous les fichiers du dépôt en un unique commit :
 * on crée un arbre vide, on en fait un commit dont le parent est le
 * head actuel, puis on déplace la branche. Historique intact → tout
 * reste récupérable via les commits précédents.
 */
export async function wipeRepo(
  message = "wipe: suppression de tous les fichiers"
): Promise<WipeResult> {
  const { token, repo, branch } = getConfig();
  if (!token) throw new Error("Aucun token configuré (env ou interface).");
  const base = `/repos/${repo}`;

  // 1. Head actuel de la branche (si absente → déjà vide)
  const refRes = await gh(`${base}/git/ref/heads/${encodeURIComponent(branch)}`, token);
  if (refRes.status === 404) {
    return { sha: "", url: "", removed: 0, alreadyEmpty: true };
  }
  if (!refRes.ok) {
    const err = await refRes.json().catch(() => ({}));
    throw new Error(`Impossible de lire la branche "${branch}" (${refRes.status}) : ${err.message ?? "?"}`);
  }
  const headSha = (await refRes.json()).object.sha as string;

  // 2. Compter les fichiers actuels (informatif)
  let removed = 0;
  const commitRes = await gh(`${base}/git/commits/${headSha}`, token);
  if (commitRes.ok) {
    const treeSha = ((await commitRes.json()) as { tree?: { sha?: string } }).tree?.sha;
    if (treeSha) {
      const listRes = await gh(`${base}/git/trees/${treeSha}?recursive=1`, token);
      if (listRes.ok) {
        const data = (await listRes.json()) as { tree?: { type: string }[] };
        removed = (data.tree ?? []).filter((e) => e.type === "blob").length;
      }
    }
  }

  // 3. Arbre vide — GitHub refuse { tree: [] } (422), on utilise donc le SHA
  //    canonique de l'arbre vide de git (déterministe, accepté par l'API).
  const emptyTreeSha = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

  // 4. Commit unique (parent = head actuel)
  const newCommitRes = await gh(`${base}/git/commits`, token, {
    method: "POST",
    body: JSON.stringify({ message, tree: emptyTreeSha, parents: [headSha] }),
  });
  if (!newCommitRes.ok) {
    const err = await newCommitRes.json().catch(() => ({}));
    throw new Error(`Échec création commit wipe (${newCommitRes.status}) : ${err.message ?? "?"}`);
  }
  const commit = (await newCommitRes.json()) as { sha: string; html_url?: string };

  // 5. Déplacer la branche
  const updRes = await gh(`${base}/git/refs/heads/${encodeURIComponent(branch)}`, token, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });
  if (!updRes.ok) {
    const err = await updRes.json().catch(() => ({}));
    throw new Error(`Commit créé mais branche non déplacée (${updRes.status}) : ${err.message ?? "?"}`);
  }

  return {
    sha: commit.sha,
    url: commit.html_url || `https://github.com/${repo}/commit/${commit.sha}`,
    removed,
    alreadyEmpty: false,
  };
}

/* ------------------------------------------------------------------ */
/* Sauvegarde : tout le dépôt dans un .zip (trees + blobs → JSZip)     */
/* ------------------------------------------------------------------ */

export interface BackupResult {
  buffer: Buffer;
  files: number;
  bytes: number; // taille cumulée décompressée
}

const MAX_BACKUP_FILES = 500;
const MAX_BACKUP_BYTES = 50 * 1024 * 1024; // 50 Mo décompressés

/**
 * Télécharge tout le contenu de la branche courante et lecompresse en .zip
 * (sans dossier racine → recharger ce zip restaure le dépôt à l'identique).
 * Sous-modules et liens symboliques ignorés ; limites : 500 fichiers / 50 Mo.
 */
export async function backupRepo(): Promise<BackupResult> {
  const { token, repo, branch } = getConfig();
  if (!token) throw new Error("Aucun token configuré.");
  const base = `/repos/${repo}`;

  // 1. Arborescence complète de la branche
  const treeRes = await gh(`${base}/git/trees/${encodeURIComponent(branch)}?recursive=1`, token);
  if (treeRes.status === 404) {
    throw new Error("Dépôt vide — rien à sauvegarder.");
  }
  if (!treeRes.ok) {
    const err = await treeRes.json().catch(() => ({}));
    throw new Error(`Impossible de lire l'arborescence (${treeRes.status}) : ${err.message ?? "?"}`);
  }
  const tree = (await treeRes.json()) as {
    truncated?: boolean;
    tree?: { path: string; type: string; mode: string; sha: string; size?: number }[];
  };
  // Uniquement les fichiers réguliers (ignore sous-modules 160000, symlinks 120000…)
  const blobs = (tree.tree ?? []).filter(
    (e) => e.type === "blob" && (e.mode === "100644" || e.mode === "100755")
  );
  if (blobs.length === 0) throw new Error("Dépôt vide — rien à sauvegarder.");
  if (tree.truncated) {
    throw new Error("Dépôt trop volumineux pour un listing complet (limite GitHub).");
  }
  if (blobs.length > MAX_BACKUP_FILES) {
    throw new Error(`Trop de fichiers (${blobs.length}). Maximum pour une sauvegarde : ${MAX_BACKUP_FILES}.`);
  }

  // 2. Récupération des blobs (par lots de 6 en parallèle)
  const zip = new JSZip();
  let bytes = 0;
  let done = 0;
  const BATCH = 6;
  for (let i = 0; i < blobs.length; i += BATCH) {
    const batch = blobs.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async (entry) => {
        const res = await gh(`${base}/git/blobs/${entry.sha}`, token);
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(`Blob inaccessible pour ${entry.path} (${res.status}) : ${err.message ?? "?"}`);
        }
        const data = (await res.json()) as { content?: string; encoding?: string };
        const buf = Buffer.from((data.content ?? "").replace(/\n/g, ""), "base64");
        return { path: entry.path, buf };
      })
    );
    for (const { path, buf } of results) {
      bytes += buf.length;
      zip.file(path, buf);
      done++;
    }
  }

  if (bytes > MAX_BACKUP_BYTES) {
    throw new Error(
      `Contenu trop volumineux (${Math.round(bytes / (1024 * 1024))} Mo). Maximum pour une sauvegarde : 50 Mo.`
    );
  }
  if (done === 0) throw new Error("Dépôt vide — rien à sauvegarder.");

  // 3. Compression
  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  return { buffer, files: done, bytes };
}

/* ------------------------------------------------------------------ */
/* Statut + validation de configuration                                */
/* ------------------------------------------------------------------ */

export interface RepoStatus {
  tokenValid: boolean;
  login: string | null;
  tokenMasked: string;
  tokenSource: "custom" | "env" | "none";
  repo: string;
  branch: string;
  repoFound: boolean;
  isPrivate: boolean | null;
  empty: boolean;
  error: string | null;
  commits: { sha: string; message: string; url: string; date: string }[];
}

export async function getStatus(): Promise<RepoStatus> {
  const { token, repo, branch, tokenSource } = getConfig();
  const status: RepoStatus = {
    tokenValid: false,
    login: null,
    tokenMasked: maskToken(token),
    tokenSource,
    repo,
    branch,
    repoFound: false,
    isPrivate: null,
    empty: true,
    error: null,
    commits: [],
  };

  if (!token) {
    status.error = "Aucun token configuré — colle-en un dans Paramètres.";
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

  const commitsRes = await gh(`/repos/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=8`, token);
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

/** Vérifie un token + accès repo avant de l'enregistrer. */
export async function validateConfig(
  token: string,
  repo: string
): Promise<{ ok: boolean; login?: string; error?: string }> {
  const userRes = await gh("/user", token);
  if (!userRes.ok) {
    return { ok: false, error: `Token refusé par GitHub (${userRes.status}).` };
  }
  const login = ((await userRes.json()) as { login: string }).login;
  const repoRes = await gh(`/repos/${repo}`, token);
  if (!repoRes.ok) {
    return {
      ok: false,
      login,
      error: `Token valide (${login}) mais le repo "${repo}" est inaccessible avec celui-ci.`,
    };
  }
  return { ok: true, login };
}

/* ------------------------------------------------------------------ */
/* Agent de détection : token → compte → dépôts → branche             */
/* (moteur heuristique 100 % local, aucune API d'IA externe)          */
/* ------------------------------------------------------------------ */

export interface DiscoveredRepo {
  fullName: string;
  isPrivate: boolean;
  defaultBranch: string;
  description: string | null;
  language: string | null;
  pushedAt: string | null;
  fork: boolean;
  writable: boolean;
  score: number;
  reasons: string[];
}

export interface TokenAnalysis {
  login: string;
  name: string | null;
  avatarUrl: string | null;
  scanned: number;
  repos: DiscoveredRepo[];
  suggestion: { repo: string; branch: string; reason: string } | null;
}

/** Indices de nommage : ces mots boostent un dépôt (projet lié au pusher). */
const NAME_HINTS = /bgh|pusher|bot|glm|agent|brainstorm/i;

/**
 * Analyse un token et déduit tout seul le compte, les dépôts accessibles
 * et la cible la plus probable (dépôt + branche).
 */
export async function analyzeToken(token: string): Promise<TokenAnalysis> {
  // 1. Identité du compte
  const userRes = await gh("/user", token);
  if (userRes.status === 401) {
    throw new Error("Token refusé par GitHub (401) — invalide ou expiré.");
  }
  if (!userRes.ok) {
    throw new Error(`GitHub a répondu ${userRes.status} pendant l'analyse du compte.`);
  }
  const user = (await userRes.json()) as {
    login: string;
    name: string | null;
    avatar_url: string | null;
  };

  // 2. Dépôts accessibles au token (pagination, 3 pages max = 300 dépôts)
  const raw: Record<string, unknown>[] = [];
  for (let page = 1; page <= 3; page++) {
    const res = await gh(
      `/user/repos?per_page=100&page=${page}&sort=pushed&visibility=all&affiliation=owner,collaborator,organization_member`,
      token
    );
    if (!res.ok) break;
    const chunk = (await res.json()) as Record<string, unknown>[];
    raw.push(...chunk);
    if (chunk.length < 100) break;
  }

  // 2b. Filet de sécurité : certains tokens fine-grained renvoient une liste
  //     vide via /user/repos — on sonde alors le dépôt configuré en env.
  const envRepo = process.env.GITHUB_REPO?.trim();
  if (envRepo && !raw.some((r) => r.full_name === envRepo)) {
    const probe = await gh(`/repos/${envRepo}`, token);
    if (probe.ok) raw.push((await probe.json()) as Record<string, unknown>);
  }

  // 3. Score heuristique de chaque dépôt
  const now = Date.now();
  const scored: DiscoveredRepo[] = raw.map((r) => {
    const fullName = String(r.full_name ?? "");
    const perm = (r.permissions ?? {}) as Record<string, boolean>;
    const pushedAt = (r.pushed_at as string) ?? null;
    const reasons: string[] = [];
    let score = 0;

    const writable = !!perm.push;
    if (writable) {
      score += 50;
      reasons.push("écriture");
    }
    if (perm.admin) {
      score += 5;
      reasons.push("admin");
    }
    if (!r.fork) {
      score += 10;
      reasons.push("dépôt source");
    } else {
      score += 2;
      reasons.push("fork");
    }
    if (NAME_HINTS.test(fullName)) {
      score += 8;
      reasons.push("nom lié au projet");
    }
    if (r.description) score += 2;
    if (r.language) score += 1;
    if (pushedAt) {
      const days = Math.max(0, (now - new Date(pushedAt).getTime()) / 86_400_000);
      score += Math.max(0, 30 - Math.min(30, days));
      if (days < 7) reasons.push("activité récente");
    }

    return {
      fullName,
      isPrivate: !!r.private,
      defaultBranch: (r.default_branch as string) ?? "main",
      description: (r.description as string | null) ?? null,
      language: (r.language as string | null) ?? null,
      pushedAt,
      fork: !!r.fork,
      writable,
      score,
      reasons,
    };
  });

  scored.sort((a, b) => b.score - a.score || a.fullName.localeCompare(b.fullName));

  // 4. Suggestion : le meilleur dépôt sur lequel on peut écrire
  const best = scored.find((r) => r.writable) ?? null;
  const suggestion = best
    ? {
        repo: best.fullName,
        branch: best.defaultBranch,
        reason: best.reasons.includes("activité récente")
          ? "dépôt le plus récemment actif avec droits d'écriture"
          : "meilleur score : droits d'écriture + fiabilité",
      }
    : null;

  return {
    login: user.login,
    name: user.name,
    avatarUrl: user.avatar_url,
    scanned: raw.length,
    repos: scored,
    suggestion,
  };
}

/** Liste les branches d'un dépôt (branche par défaut en premier). */
export async function listBranches(
  repo: string,
  token: string
): Promise<{ name: string; isDefault: boolean }[]> {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    throw new Error("Format de repo invalide — attendu : propriétaire/nom");
  }
  const repoRes = await gh(`/repos/${repo}`, token);
  if (repoRes.status === 404) {
    throw new Error(`Dépôt "${repo}" introuvable ou non accessible avec ce token.`);
  }
  if (!repoRes.ok) {
    throw new Error(`GitHub a répondu ${repoRes.status} pour "${repo}".`);
  }
  const def = ((await repoRes.json()) as { default_branch?: string }).default_branch ?? "";
  const res = await gh(`/repos/${repo}/branches?per_page=100`, token);
  if (!res.ok) {
    throw new Error(`Impossible de lister les branches (${res.status}).`);
  }
  const data = (await res.json()) as { name: string }[];
  if (def && !data.some((b) => b.name === def)) data.unshift({ name: def });
  return data.map((b) => ({ name: b.name, isDefault: b.name === def }));
}
