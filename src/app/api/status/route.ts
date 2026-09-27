import { NextResponse } from "next/server";
import { getStatus } from "@/lib/github";

export async function GET() {
  try {
    const status = await getStatus();
    return NextResponse.json(status);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur inconnue" },
      { status: 500 }
    );
  }
}
