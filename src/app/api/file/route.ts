import { NextRequest, NextResponse } from "next/server";
import { getFile, sanitizePath } from "@/lib/github";

export async function GET(req: NextRequest) {
  try {
    const raw = req.nextUrl.searchParams.get("path");
    if (!raw) {
      return NextResponse.json({ error: "Paramètre ?path= requis." }, { status: 400 });
    }
    const path = sanitizePath(raw);
    const file = await getFile(path);
    return NextResponse.json(file);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur inconnue" },
      { status: 500 }
    );
  }
}
