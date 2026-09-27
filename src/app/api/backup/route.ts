import { NextRequest, NextResponse } from "next/server";
import { backupRepo, getConfig } from "@/lib/github";

/**
 * GET /api/backup
 * → télécharge tout le contenu du dépôt courant (repo + branche configurés)
 *   sous forme de .zip (sans dossier racine : rechargeable tel quel via
 *   « Charger un .zip » / mode replace).
 */
export async function GET(_req: NextRequest) {
  try {
    const { repo, branch } = getConfig();
    const { buffer, files, bytes } = await backupRepo();

    const stamp = new Date().toISOString().slice(0, 10);
    const safeRepo = repo.replace(/[^A-Za-z0-9._-]+/g, "-");
    const safeBranch = branch.replace(/[^A-Za-z0-9._-]+/g, "-");
    const filename = `${safeRepo}-${safeBranch}-${stamp}.zip`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.length),
        "X-Backup-Files": String(files),
        "X-Backup-Bytes": String(bytes),
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur inconnue";
    const status = /token|permission|403/i.test(msg) ? 403 : /invalide/i.test(msg) ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
