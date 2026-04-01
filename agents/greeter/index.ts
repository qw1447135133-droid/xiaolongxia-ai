// 迎客龙虾 - 多语种客服与评论互动
import { Codex } from "@openai/codex-sdk";
import { ModelRouter } from "../../core/index.js";

export interface CustomerServiceReply {
  reply: string;
  tone: "friendly" | "professional" | "apologetic";
  followUpAction?: string;
}

export async function runGreeter(
  codex: Codex,
  customerMessage: string,
  language: string = "en",
  context?: string
): Promise<CustomerServiceReply> {
  const thread = codex.startThread({
    skipGitRepoCheck: true,
  } as any);

  const turn = await thread.run(
    `你是迎客龙虾，跨境电商多语种客服专家。\n` +
    `${context ? `商品背景：${context}\n` : ""}` +
    `用${language}回复以下买家消息，输出 JSON：\n"${customerMessage}"\n\n` +
    `{\n` +
    `  "reply": "回复内容",\n` +
    `  "tone": "friendly|professional|apologetic",\n` +
    `  "followUpAction": "建议跟进动作（可选）"\n` +
    `}\n只输出 JSON。`,
    {
      outputSchema: {
        type: "object",
        properties: {
          reply: { type: "string" },
          tone: { type: "string", enum: ["friendly", "professional", "apologetic"] },
          followUpAction: { type: "string" },
        },
        required: ["reply", "tone"],
        additionalProperties: false,
      },
    }
  );

  return JSON.parse(turn.finalResponse ?? "{}") as CustomerServiceReply;
}
