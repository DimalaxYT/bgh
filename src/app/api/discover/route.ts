import { NextRequest, NextResponse } from "next/server";
import { analyzeToken } from "@/lib/github";

/**
 * POST /api/discover  { token }
 * → l'agent déduit le compte, les dépôts accessibles, la cible probable.
 * Le token n'est PAS enregistré ici : c'est une analyse à blanc.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (!token) {
    return NextResponse.json({ error: "Colle un token GitHub à analyser." }, { status: 400 });
  }

  try {
    const analysis = await analyzeToken(token);
    return NextResponse.json(analysis);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur inconnue pendant l'analyse.";
    const status = msg.includes("401") ? 401 : msg.includes("invalide") ? 400 : 502;
    return NextResponse.json({ error: msg }, { status });
  }
}
