// 幻影龙虾 - 商品图与素材生成方案
import { Codex } from "@openai/codex-sdk";
import { ModelRouter } from "../../core/index.js";

export interface DesignBrief {
  mainImagePrompt: string;    // 主图 AI 生成提示词
  posterConcept: string;      // 海报设计方案
  videoStoryboard: string[];  // 短视频分镜
  colorPalette: string[];     // 推荐色板
  styleGuide: string;         // 风格指南
}

export async function runDesigner(
  codex: Codex,
  productInfo: string,
  targetMarket: string = "欧美"
): Promise<DesignBrief> {
  const thread = codex.startThread({
    skipGitRepoCheck: true,
  } as any);

  const turn = await thread.run(
    `你是幻影龙虾，跨境电商视觉设计专家，目标市场：${targetMarket}。\n` +
    `为以下商品制定视觉方案，输出 JSON：\n"${productInfo}"\n\n` +
    `{\n` +
    `  "mainImagePrompt": "英文 AI 图片生成提示词",\n` +
    `  "posterConcept": "海报设计方案描述",\n` +
    `  "videoStoryboard": ["第1幕", "第2幕", "第3幕"],\n` +
    `  "colorPalette": ["#hex1", "#hex2", "#hex3"],\n` +
    `  "styleGuide": "整体风格指南"\n` +
    `}\n只输出 JSON。`,
    {
      outputSchema: {
        type: "object",
        properties: {
          mainImagePrompt: { type: "string" },
          posterConcept: { type: "string" },
          videoStoryboard: { type: "array", items: { type: "string" } },
          colorPalette: { type: "array", items: { type: "string" } },
          styleGuide: { type: "string" },
        },
        required: ["mainImagePrompt", "posterConcept", "videoStoryboard", "colorPalette", "styleGuide"],
        additionalProperties: false,
      },
    }
  );

  return JSON.parse(turn.finalResponse ?? "{}") as DesignBrief;
}
