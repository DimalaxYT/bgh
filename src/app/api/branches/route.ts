import { NextRequest, NextResponse } from "next/server";
import { getConfig, listBranches } from "@/lib/github";

/**
 * POST /api/branches  { repo, token? }
 * → liste des branches du dépôt (branche par défaut marquée).
 * Token optionnel : sans token fourni, utilise le token configuré.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const repo = typeof body?.repo === "string" ? body.repo.trim() : "";
  if (!repo) {
    return NextResponse.json({ error: "Dépôt manquant." }, { status: 400 });
  }

  const supplied = typeof body?.token === "string" ? body.token.trim() : "";
  const token = supplied || getConfig().token;
  if (!token) {
    return NextResponse.json(
      { error: "Aucun token disponible (fournis-en un ou configure l'app)." },
      { status: 400 }
    );
  }

  try {
    const branches = await listBranches(repo, token);
    return NextResponse.json({ ok: true, branches });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur inconnue" },
      { status: 502 }
    );
  }
}
