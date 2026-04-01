// 执笔龙虾 - 多语种文案与 SEO
import { Codex } from "@openai/codex-sdk";
import { ModelRouter } from "../../core/index.js";

export type Language = "zh" | "en" | "ja" | "de" | "fr" | "es" | "ar";

export interface CopyResult {
  title: string;
  subtitle: string;
  description: string;
  bulletPoints: string[];
  seoKeywords: string[];
}

export async function runWriter(
  codex: Codex,
  productInfo: string,
  targetLang: Language = "en"
): Promise<CopyResult> {
  const thread = codex.startThread({
    skipGitRepoCheck: true,
  } as any);

  const langNames: Record<Language, string> = {
    zh: "中文", en: "英文", ja: "日文", de: "德文", fr: "法文", es: "西班牙文", ar: "阿拉伯文",
  };

  const turn = await thread.run(
    `你是执笔龙虾，跨境电商文案专家。\n` +
    `为以下商品撰写${langNames[targetLang]}电商文案，输出 JSON：\n"${productInfo}"\n\n` +
    `{\n` +
    `  "title": "SEO 优化标题（80字符内）",\n` +
    `  "subtitle": "副标题",\n` +
    `  "description": "详情页描述（200字）",\n` +
    `  "bulletPoints": ["卖点1", "卖点2", "卖点3", "卖点4", "卖点5"],\n` +
    `  "seoKeywords": ["关键词1", "关键词2", "关键词3"]\n` +
    `}\n只输出 JSON。`,
    {
      outputSchema: {
        type: "object",
        properties: {
          title: { type: "string" },
          subtitle: { type: "string" },
          description: { type: "string" },
          bulletPoints: { type: "array", items: { type: "string" } },
          seoKeywords: { type: "array", items: { type: "string" } },
        },
        required: ["title", "subtitle", "description", "bulletPoints", "seoKeywords"],
        additionalProperties: false,
      },
    }
  );

  return JSON.parse(turn.finalResponse ?? "{}") as CopyResult;
}
