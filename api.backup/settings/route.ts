export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { updateSettings, getSettings } from "@/lib/runtime-settings";
import type { RuntimeSettings } from "@/lib/runtime-settings";

export async function GET() {
  return NextResponse.json(getSettings());
}

export async function POST(req: NextRequest) {
  const body = await req.json() as Partial<RuntimeSettings>;
  updateSettings(body);
  return NextResponse.json({ ok: true });
}
