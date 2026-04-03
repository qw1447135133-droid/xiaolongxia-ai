export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { broadcast, subscriberCount } from "@/lib/ws-server";
import { getSettings } from "@/lib/runtime-settings";

export async function GET() {
  const settings = getSettings();
  const count = subscriberCount();

  // 发一条测试广播
  broadcast({ type: "agent_status", agentId: "orchestrator", status: "idle", currentTask: "debug ping" });

  return NextResponse.json({
    sseSubscribers: count,
    providersCount: settings.providers.length,
    providers: settings.providers.map(p => ({ id: p.id, name: p.name, hasKey: !!p.apiKey })),
    agentConfigsCount: Object.keys(settings.agentConfigs).length,
    agentConfigs: Object.fromEntries(
      Object.entries(settings.agentConfigs).map(([id, c]) => [id, { model: c.model, providerId: c.providerId }])
    ),
  });
}
