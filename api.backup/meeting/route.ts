export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { meeting } from "@/lib/engine";
import { hasAnyApiKey, updateSettings } from "@/lib/runtime-settings";
import type { RuntimeSettings } from "@/lib/runtime-settings";

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    topic?: string;
    providers?: RuntimeSettings["providers"];
    agentConfigs?: RuntimeSettings["agentConfigs"];
  };

  if (body.providers || body.agentConfigs) {
    updateSettings({
      ...(body.providers ? { providers: body.providers } : {}),
      ...(body.agentConfigs ? { agentConfigs: body.agentConfigs } : {}),
    });
  }

  if (!hasAnyApiKey()) {
    return NextResponse.json({ error: "未配置 API Key" }, { status: 503 });
  }

  const topic = body.topic?.trim();
  if (!topic) {
    return NextResponse.json({ error: "topic is required" }, { status: 400 });
  }

  try {
    const result = await meeting(topic);
    return NextResponse.json({ result });
  } catch (err) {
    console.error("[meeting route] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
