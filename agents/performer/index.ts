// 戏精龙虾 - 数字人视频与多平台发布
import { Codex } from "@openai/codex-sdk";
import { ModelRouter } from "../../core/index.js";

export type Platform = "tiktok" | "douyin" | "instagram" | "youtube_shorts";

export interface VideoScript {
  hook: string;           // 前3秒钩子
  script: string;         // 完整脚本
  captions: string[];     // 字幕分段
  hashtags: string[];     // 话题标签
  postingTime: string;    // 建议发布时间
  platform: Platform;
}

export async function runPerformer(
  codex: Codex,
  productInfo: string,
  platform: Platform = "tiktok"
): Promise<VideoScript> {
  const thread = codex.startThread({
    skipGitRepoCheck: true,
  } as any);

  const platformGuide: Record<Platform, string> = {
    tiktok: "TikTok（英文，15-60秒，年轻用户）",
    douyin: "抖音（中文，15-60秒，国内用户）",
    instagram: "Instagram Reels（英文，30秒，视觉优先）",
    youtube_shorts: "YouTube Shorts（英文，60秒，信息量大）",
  };

  const turn = await thread.run(
    `你是戏精龙虾，短视频内容专家，平台：${platformGuide[platform]}。\n` +
    `为以下商品创作视频脚本，输出 JSON：\n"${productInfo}"\n\n` +
    `{\n` +
    `  "hook": "前3秒吸引眼球的开场白",\n` +
    `  "script": "完整视频脚本",\n` +
    `  "captions": ["字幕段落1", "字幕段落2", "字幕段落3"],\n` +
    `  "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5"],\n` +
    `  "postingTime": "建议发布时间（如：周二 19:00-21:00）",\n` +
    `  "platform": "${platform}"\n` +
    `}\n只输出 JSON。`,
    {
      outputSchema: {
        type: "object",
        properties: {
          hook: { type: "string" },
          script: { type: "string" },
          captions: { type: "array", items: { type: "string" } },
          hashtags: { type: "array", items: { type: "string" } },
          postingTime: { type: "string" },
          platform: { type: "string" },
        },
        required: ["hook", "script", "captions", "hashtags", "postingTime", "platform"],
        additionalProperties: false,
      },
    }
  );

  return JSON.parse(turn.finalResponse ?? "{}") as VideoScript;
}
