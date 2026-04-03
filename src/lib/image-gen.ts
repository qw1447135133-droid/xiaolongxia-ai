// 图片生成模块 - 支持多个后端
// 优先级: inference.sh (Seedream 4.5 / Nano Banana) → SiliconFlow Seedream → 占位图
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";

export type ImageModel = "seedream-4-5" | "nano-banana" | "seedream-3-0";

// 检测可用的图片生成后端
function detectBackend(): "infsh" | "siliconflow" | "none" {
  if (process.env.INFSH_API_KEY) return "infsh";
  if (process.env.SILICONFLOW_API_KEY) return "siliconflow";
  return "none";
}

// inference.sh REST API 调用
// API 文档: https://inference.sh/docs/api/rest/tasks
async function generateViaInfsh(prompt: string, model: ImageModel = "seedream-4-5"): Promise<string> {
  const apiKey = process.env.INFSH_API_KEY!;

  // 映射 model 到 app ID
  const appId: Record<ImageModel, string> = {
    "seedream-4-5": "bytedance/seedream-4-5",
    "nano-banana":  "google/gemini-3-pro-image-preview",  // nano banana = gemini native image
    "seedream-3-0": "bytedance/seedream-3-0-t2i",
  };

  // 提交任务
  const submitRes = await fetch("https://api.inference.sh/v1/tasks", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      app: appId[model],
      input: { prompt },
    }),
  });

  if (!submitRes.ok) {
    const err = await submitRes.text();
    throw new Error(`inference.sh submit failed: ${submitRes.status} ${err}`);
  }

  const { task_id } = await submitRes.json() as { task_id: string };

  // 轮询任务结果（最多等 120s）
  for (let i = 0; i < 40; i++) {
    await sleep(3000);
    const pollRes = await fetch(`https://api.inference.sh/v1/tasks/${task_id}`, {
      headers: { "Authorization": `Bearer ${apiKey}` },
    });
    if (!pollRes.ok) continue;

    const data = await pollRes.json() as {
      status: string;
      output?: { images?: Array<{ url: string }> };
    };

    if (data.status === "completed" && data.output?.images?.[0]?.url) {
      return data.output.images[0].url;
    }
    if (data.status === "failed") {
      throw new Error("inference.sh task failed");
    }
  }
  throw new Error("inference.sh task timeout");
}

// SiliconFlow Seedream API
async function generateViaSiliconFlow(prompt: string): Promise<string> {
  const apiKey = process.env.SILICONFLOW_API_KEY!;

  const res = await fetch("https://api.siliconflow.cn/v1/images/generations", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "Pro/FLUX.1-schnell",  // SiliconFlow 支持的图片模型
      prompt,
      image_size: "1024x1024",
      num_inference_steps: 20,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`SiliconFlow image gen failed: ${res.status} ${err}`);
  }

  const data = await res.json() as { images?: Array<{ url: string }> };
  const url = data.images?.[0]?.url;
  if (!url) throw new Error("No image URL in response");
  return url;
}

// 下载图片到本地 public 目录，返回本地路径
async function downloadImage(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download image: ${res.status}`);

  const buffer = Buffer.from(await res.arrayBuffer());
  const filename = `${randomUUID()}.png`;
  const dir = join(process.cwd(), "public", "generated");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, filename), buffer);
  return `/generated/${filename}`;
}

// 主入口：生成图片，返回可访问的 URL
export async function generateImage(prompt: string): Promise<string> {
  const backend = detectBackend();

  let remoteUrl: string;

  switch (backend) {
    case "infsh": {
      const model = (process.env.IMAGE_MODEL as ImageModel | undefined) ?? "seedream-4-5";
      remoteUrl = await generateViaInfsh(prompt, model);
      break;
    }
    case "siliconflow":
      remoteUrl = await generateViaSiliconFlow(prompt);
      break;
    default:
      // 无 API key 时返回占位图（用 picsum）
      console.warn("[image-gen] No API key configured, using placeholder");
      return `https://picsum.photos/seed/${encodeURIComponent(prompt.slice(0, 20))}/512/512`;
  }

  // 下载到本地，避免外链过期
  try {
    return await downloadImage(remoteUrl);
  } catch {
    // 下载失败时直接返回远程 URL
    return remoteUrl;
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
