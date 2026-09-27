import { NextRequest, NextResponse } from "next/server";
import { wipeRepo } from "@/lib/github";

/**
 * POST /api/wipe  { message? }
 * → supprime TOUS les fichiers du dépôt en un seul commit (arbre vide).
 * L'historique est intact : récupération possible via les commits précédents.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const message =
      typeof body?.message === "string" && body.message.trim()
        ? body.message.trim()
        : "wipe: suppression de tous les fichiers";
    const result = await wipeRepo(message);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur inconnue";
    const status = /token|permission|403/i.test(msg) ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
