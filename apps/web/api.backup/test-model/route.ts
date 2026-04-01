export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export async function POST(req: NextRequest) {
  const { apiKey, baseUrl, model } = await req.json() as {
    apiKey: string;
    baseUrl?: string;
    model: string;
  };

  if (!apiKey?.trim()) {
    return NextResponse.json({ ok: false, error: "API Key 不能为空" });
  }
  if (!model?.trim()) {
    return NextResponse.json({ ok: false, error: "模型名不能为空" });
  }

  const start = Date.now();
  try {
    const isCodingPlan = baseUrl?.includes("coding.dashscope.aliyuncs.com");
    const client = new OpenAI({
      apiKey,
      ...(baseUrl?.trim() ? { baseURL: baseUrl.trim() } : {}),
      ...(isCodingPlan ? { defaultHeaders: { "User-Agent": "OpenAI/Codex" } } : {}),
    });

    const completion = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: "Reply with exactly: OK" }],
      max_tokens: 10,
    });

    const reply = completion.choices[0]?.message?.content ?? "";
    const latencyMs = Date.now() - start;

    return NextResponse.json({
      ok: true,
      reply,
      latencyMs,
      model: completion.model,
      tokens: completion.usage?.total_tokens ?? 0,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // 提取关键错误信息
    const friendly = msg.includes("401") ? "API Key 无效或已过期"
      : msg.includes("404") ? "模型不存在，请检查模型名"
      : msg.includes("429") ? "请求频率超限，稍后重试"
      : msg.includes("ECONNREFUSED") || msg.includes("ENOTFOUND") ? "无法连接到 API 地址，请检查 Base URL"
      : msg.slice(0, 120);

    return NextResponse.json({ ok: false, error: friendly, detail: msg.slice(0, 300) });
  }
}
