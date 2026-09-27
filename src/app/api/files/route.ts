import { NextResponse } from "next/server";
import { listFiles } from "@/lib/github";

export async function GET() {
  try {
    const listing = await listFiles();
    return NextResponse.json(listing);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur inconnue" },
      { status: 500 }
    );
  }
}
