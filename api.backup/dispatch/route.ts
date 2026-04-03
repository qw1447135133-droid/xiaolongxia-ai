export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { dispatch } from "@/lib/engine";
import { hasAnyApiKey, updateSettings } from "@/lib/runtime-settings";
import type { RuntimeSettings } from "@/lib/runtime-settings";

export async function POST(req: NextRequest) {
  console.log('[dispatch API] Received request');
  const body = await req.json() as {
    instruction?: string;
    providers?: RuntimeSettings["providers"];
    agentConfigs?: RuntimeSettings["agentConfigs"];
  };

  // 每次 dispatch 都把前端最新配置同步到服务端，解决服务重启后内存丢失问题
  if (body.providers || body.agentConfigs) {
    updateSettings({
      ...(body.providers ? { providers: body.providers } : {}),
      ...(body.agentConfigs ? { agentConfigs: body.agentConfigs } : {}),
    });
  }

  if (!hasAnyApiKey()) {
    return NextResponse.json(
      { error: "未配置 API Key。请在「设置 → 模型供应商」添加供应商，或在 .env.local 中设置 OPENAI_API_KEY / SILICONFLOW_API_KEY。" },
      { status: 503 }
    );
  }

  const instruction = body.instruction?.trim();
  if (!instruction) {
    return NextResponse.json({ error: "instruction is required" }, { status: 400 });
  }

  console.log('[dispatch API] Calling dispatch with:', instruction);
  dispatch(instruction).catch(err => console.error("[dispatch route] unhandled error:", err));
  console.log('[dispatch API] Dispatch called, returning response');
  return NextResponse.json({ status: "dispatched", instruction });
}
