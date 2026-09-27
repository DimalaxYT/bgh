import { NextRequest, NextResponse } from "next/server";
import { listRepos } from "@/lib/github";

/**
 * GET /api/repos
 * → tous les dépôts accessibles avec le token configuré, triés par score
 *   heuristique (écriture, activité, nom lié au projet…).
 *   Utilisé par la section « Tes dépôts » de la page principale.
 */
export async function GET(_req: NextRequest) {
  try {
    const { login, repos } = await listRepos();
    return NextResponse.json({ ok: true, login, repos });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur inconnue";
    const status = /401|token/i.test(msg) ? 401 : /permission|403/i.test(msg) ? 403 : 502;
    return NextResponse.json({ error: msg }, { status });
  }
}
