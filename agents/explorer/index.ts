// 探海龙虾 - 竞品数据与选品趋势
import { Codex } from "@openai/codex-sdk";
import { ModelRouter } from "../../core/index.js";

export interface ExplorerResult {
  keywords: string[];
  competitors: string[];
  trends: string[];
  recommendation: string;
}

export async function runExplorer(
  codex: Codex,
  query: string
): Promise<ExplorerResult> {
  const thread = codex.startThread({
    skipGitRepoCheck: true,
  } as any);

  const turn = await thread.run(
    `你是探海龙虾，跨境电商选品专家。\n` +
    `分析以下选品需求，输出 JSON 格式结果：\n"${query}"\n\n` +
    `输出格式：\n` +
    `{\n` +
    `  "keywords": ["关键�?", "关键�?"],\n` +
    `  "competitors": ["竞品1", "竞品2"],\n` +
    `  "trends": ["趋势1", "趋势2"],\n` +
    `  "recommendation": "选品建议"\n` +
    `}\n只输�?JSON，不要其他内容。`,
    {
      outputSchema: {
        type: "object",
        properties: {
          keywords: { type: "array", items: { type: "string" } },
          competitors: { type: "array", items: { type: "string" } },
          trends: { type: "array", items: { type: "string" } },
          recommendation: { type: "string" },
        },
        required: ["keywords", "competitors", "trends", "recommendation"],
        additionalProperties: false,
      },
    }
  );

  return JSON.parse(turn.finalResponse ?? "{}") as ExplorerResult;
}
