export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

type ChatCompletionResponse = {
  model?: string;
  usage?: { total_tokens?: number };
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  error?: { message?: string };
};

type ChatChoice = NonNullable<ChatCompletionResponse["choices"]>[number];

function normalizeBaseUrl(baseUrl?: string) {
  const trimmed = baseUrl?.trim();
  if (!trimmed) return "https://api.openai.com/v1";
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function extractReply(content?: ChatChoice) {
  const raw = content?.message?.content;
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) {
    return raw
      .map(item => item.text ?? "")
      .join("")
      .trim();
  }
  return "";
}

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

  const finalBaseUrl = normalizeBaseUrl(baseUrl);
  const start = Date.now();

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey.trim()}`,
    };

    if (finalBaseUrl.includes("coding.dashscope.aliyuncs.com")) {
      headers["User-Agent"] = "OpenAI/Codex";
    }

    const response = await fetch(`${finalBaseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Reply with exactly: OK" }],
        max_tokens: 10,
      }),
    });

    const data = await response.json() as ChatCompletionResponse;

    if (!response.ok) {
      const message = data.error?.message || `HTTP ${response.status}`;
      throw new Error(message);
    }

    const latencyMs = Date.now() - start;
    const reply = extractReply(data.choices?.[0]);

    return NextResponse.json({
      ok: true,
      reply,
      latencyMs,
      model: data.model || model,
      tokens: data.usage?.total_tokens ?? 0,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const friendly =
      message.includes("401") || message.toLowerCase().includes("unauthorized")
        ? "API Key 无效或已过期"
        : message.includes("404")
          ? "模型不存在，请检查模型名"
          : message.includes("429")
            ? "请求频率超限，请稍后重试"
            : message.includes("ECONNREFUSED") || message.includes("ENOTFOUND")
              ? "无法连接到 API 地址，请检查 Base URL"
              : message.slice(0, 120);

    return NextResponse.json({
      ok: false,
      error: friendly,
      detail: message.slice(0, 300),
    });
  }
}
