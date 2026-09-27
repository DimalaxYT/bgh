import { NextRequest, NextResponse } from "next/server";
import {
  clearConfigOverride,
  getConfig,
  maskToken,
  setConfigOverride,
  validateConfig,
} from "@/lib/github";

/** État courant de la configuration (token masqué, jamais renvoyé en clair). */
export async function GET() {
  const { token, repo, branch, tokenSource } = getConfig();
  return NextResponse.json({
    hasToken: !!token,
    tokenMasked: maskToken(token),
    tokenSource,
    repo,
    branch,
  });
}

/**
 * Enregistre un token / repo / branche personnalisé (stocké en mémoire serveur).
 * Le token est validé auprès de GitHub avant enregistrement.
 * { token?, repo?, branch?, reset? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);

    if (body?.reset === true) {
      clearConfigOverride();
      const { token, repo, branch, tokenSource } = getConfig();
      return NextResponse.json({
        ok: true,
        reset: true,
        hasToken: !!token,
        tokenMasked: maskToken(token),
        tokenSource,
        repo,
        branch,
      });
    }

    const newToken = typeof body?.token === "string" ? body.token.trim() : "";
    const newRepo =
      typeof body?.repo === "string" && body.repo.trim()
        ? body.repo.trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/i, "")
        : getConfig().repo;
    const newBranch =
      typeof body?.branch === "string" && body.branch.trim()
        ? body.branch.trim()
        : getConfig().branch;

    // Un token doit être fourni pour changer la config (sécurité : on ne
    // permet pas de changer le repo sans prouver un accès valide).
    if (!newToken) {
      return NextResponse.json(
        { error: "Colle un token (ou utilise reset pour revenir au token d'environnement)." },
        { status: 400 }
      );
    }

    if (!/^[\w.-]+\/[\w.-]+$/.test(newRepo)) {
      return NextResponse.json(
        { error: "Format de repo invalide — attendu : propriétaire/nom" },
        { status: 400 }
      );
    }

    // Validation GitHub avant enregistrement
    const check = await validateConfig(newToken, newRepo);
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 400 });
    }

    setConfigOverride({ token: newToken, repo: newRepo, branch: newBranch });
    const { tokenSource } = getConfig();
    return NextResponse.json({
      ok: true,
      login: check.login,
      repo: newRepo,
      branch: newBranch,
      tokenMasked: maskToken(newToken),
      tokenSource,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur inconnue" },
      { status: 500 }
    );
  }
}
