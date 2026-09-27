import { NextRequest, NextResponse } from "next/server";
import {
  extractZip,
  getConfig,
  pushFiles,
  sanitizePath,
  PushFile,
} from "@/lib/github";

const MAX_TOTAL_BYTES = 25 * 1024 * 1024; // 25 Mo
const MAX_FILES = 300;

interface IncomingFile {
  path?: unknown;
  content?: unknown;
  extract?: unknown;
}

export async function POST(req: NextRequest) {
  try {
    const { token } = getConfig();
    if (!token) {
      return NextResponse.json(
        { error: "GITHUB_TOKEN n'est pas configuré côté serveur." },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => null);
    const message = typeof body?.message === "string" && body.message.trim()
      ? body.message.trim()
      : "update: mise à jour via bgh-pusher";
    const incoming: IncomingFile[] = Array.isArray(body?.files) ? body.files : [];

    if (incoming.length === 0) {
      return NextResponse.json(
        { error: "Aucun fichier fourni. Ajoute du texte ou des fichiers d'abord." },
        { status: 400 }
      );
    }

    // Expand zips, sanitize paths, enforce limits
    const files: PushFile[] = [];
    let totalBytes = 0;
    for (const item of incoming) {
      if (typeof item.path !== "string" || typeof item.content !== "string") {
        return NextResponse.json(
          { error: "Fichier malformé (path/content requis)." },
          { status: 400 }
        );
      }
      if (item.extract === true) {
        const extracted = await extractZip(item.content);
        files.push(...extracted);
      } else {
        files.push({ path: sanitizePath(item.path), contentBase64: item.content });
      }
    }

    for (const f of files) {
      totalBytes += Math.floor((f.contentBase64.length * 3) / 4);
    }
    if (files.length > MAX_FILES) {
      return NextResponse.json(
        { error: `Trop de fichiers (${files.length}). Maximum : ${MAX_FILES}.` },
        { status: 400 }
      );
    }
    if (totalBytes > MAX_TOTAL_BYTES) {
      return NextResponse.json(
        { error: `Lot trop volumineux (${Math.round(totalBytes / 1024)} Ko). Maximum : 25 Mo.` },
        { status: 400 }
      );
    }

    const result = await pushFiles(files, message);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur inconnue";
    const status = /token|permission|403/i.test(msg) ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
