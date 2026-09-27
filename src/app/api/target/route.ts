import { NextRequest, NextResponse } from "next/server";
import { getConfig, setConfigOverride } from "@/lib/github";

/**
 * POST /api/target  { repo, branch? }
 * → change le dépôt ciblé (et la branche) en utilisant le token DÉJÀ
 *   configuré. Sécurité : on vérifie d'abord que ce token accède bien au
 *   dépôt demandé — impossible de cibler ce que le token ne voit pas.
 *   La branche par défaut du dépôt est utilisée si non précisée.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const repo = typeof body?.repo === "string" ? body.repo.trim() : "";
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
      return NextResponse.json(
        { error: "Format de repo invalide — attendu : propriétaire/nom" },
        { status: 400 }
      );
    }

    const { token } = getConfig();
    if (!token) {
      return NextResponse.json({ error: "Aucun token configuré." }, { status: 400 });
    }

    const res = await fetch(`https://api.github.com/repos/${repo}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "bgh-pusher",
      },
      cache: "no-store",
    });
    if (res.status === 404) {
      return NextResponse.json(
        { error: `Dépôt "${repo}" inaccessible avec le token actuel.` },
        { status: 400 }
      );
    }
    if (!res.ok) {
      return NextResponse.json(
        { error: `GitHub a répondu ${res.status} pour "${repo}".` },
        { status: 502 }
      );
    }
    const data = (await res.json()) as {
      default_branch?: string;
      permissions?: Record<string, boolean>;
    };

    const branch =
      typeof body?.branch === "string" && body.branch.trim()
        ? body.branch.trim()
        : (data.default_branch ?? "main");
    const writable = !!data.permissions?.push;

    setConfigOverride({ repo, branch });
    return NextResponse.json({ ok: true, repo, branch, writable });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur inconnue" },
      { status: 500 }
    );
  }
}
