import { NextRequest, NextResponse } from "next/server";
import { deleteFile, sanitizePath } from "@/lib/github";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (typeof body?.path !== "string" || typeof body?.sha !== "string" || !body.sha) {
      return NextResponse.json(
        { error: "path et sha sont requis pour supprimer un fichier." },
        { status: 400 }
      );
    }
    const path = sanitizePath(body.path);
    const message =
      typeof body?.message === "string" && body.message.trim()
        ? body.message.trim()
        : `delete: suppression de ${path}`;
    const result = await deleteFile(path, body.sha, message);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur inconnue";
    const status = /token|permission|403/i.test(msg) ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
