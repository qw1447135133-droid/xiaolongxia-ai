#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();

const defaultConfig = {
  planner: {
    profileId: "default",
    label: "codex-brain",
    command: "codex",
    args: ["exec", "--full-auto", "--skip-git-repo-check"],
    resumeArgs: ["exec", "resume", "--full-auto", "--skip-git-repo-check"],
    model: "",
    promptMode: "argument",
    sessionStateFile: "output/hermes-dispatch/planner-sessions/default.json",
    cwd: ".",
  },
  dispatch: {
    defaultWorkdir: ".",
    maxParallel: 3,
    allowSharedWorkdirParallel: false,
    outputRoot: "output/hermes-dispatch",
  },
  executors: {
    codex: {
      command: "codex",
      args: ["exec", "--full-auto", "--skip-git-repo-check"],
      model: "",
      promptMode: "argument",
      cwd: ".",
    },
    claude: {
      command: "claude",
      args: ["--print", "--dangerously-skip-permissions"],
      model: "",
      promptMode: "argument",
      cwd: ".",
    },
    gemini: {
      command: "gemini",
      args: ["-p"],
      model: "",
      promptMode: "argument",
      cwd: ".",
    },
  },
};

const CONTROL_FILE_NAME = "control.json";
const CONTROL_POLL_INTERVAL_MS = 800;

function printUsage() {
  console.log(`Hermes -> Codex/Claude/Gemini dispatch prototype

Usage:
  node prototypes/hermes-dispatch/run.mjs "任务描述"
  node prototypes/hermes-dispatch/run.mjs --plan-file prototypes/hermes-dispatch/sample-plan.json

Options:
  --config <file>       Load a JSON config override
  --plan-file <file>    Skip Hermes planning and execute the given plan JSON
  --plan-only           Generate and print the plan without dispatching
  --output-dir <dir>    Override run artifact directory
  --help                Show this help
`);
}

function parseArgs(argv) {
  const options = {
    configPath: null,
    planFile: null,
    planOnly: false,
    outputDir: null,
    instruction: "",
  };

  const rest = [];
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--help" || value === "-h") {
      printUsage();
      process.exit(0);
    }
    if (value === "--config") {
      options.configPath = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (value === "--plan-file") {
      options.planFile = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (value === "--plan-only") {
      options.planOnly = true;
      continue;
    }
    if (value === "--output-dir") {
      options.outputDir = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    rest.push(value);
  }

  options.instruction = rest.join(" ").trim();
  return options;
}

function mergeConfig(base, patch) {
  if (Array.isArray(base) || Array.isArray(patch)) {
    return patch;
  }
  const next = { ...base };
  for (const [key, value] of Object.entries(patch ?? {})) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      base &&
      typeof base[key] === "object" &&
      !Array.isArray(base[key])
    ) {
      next[key] = mergeConfig(base[key], value);
      continue;
    }
    next[key] = value;
  }
  return next;
}

async function loadConfig(configPath) {
  if (!configPath) {
    return structuredClone(defaultConfig);
  }
  const resolved = path.resolve(repoRoot, configPath);
  const text = await fsp.readFile(resolved, "utf8");
  return mergeConfig(structuredClone(defaultConfig), JSON.parse(text));
}

async function ensureDir(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
}

function resolveFromRoot(inputPath, fallback = ".") {
  return path.resolve(repoRoot, inputPath ?? fallback);
}

function normalizeCommandValue(command) {
  const trimmed = String(command || "").trim();
  return trimmed.replace(/^"(.*)"$/, "$1");
}

function isExplicitCommandPath(command) {
  const normalized = normalizeCommandValue(command);
  return /[\\/]/.test(normalized) || /^[a-zA-Z]:/.test(normalized);
}

function resolveCommandForExecution(command) {
  const normalized = normalizeCommandValue(command);
  if (!normalized) {
    return "";
  }

  if (!isExplicitCommandPath(normalized)) {
    return normalized;
  }

  if (/^[a-zA-Z]:/.test(normalized) || normalized.startsWith("\\\\")) {
    return normalized;
  }

  return path.resolve(repoRoot, normalized);
}

function getCommandFamily(command) {
  return path.basename(normalizeCommandValue(command))
    .toLowerCase()
    .replace(/\.(cmd|exe|bat|ps1)$/i, "");
}

function findBundledCodexExecutable() {
  if (process.platform !== "win32") {
    return "";
  }

  const extensionsRoot = path.join(os.homedir(), ".vscode", "extensions");
  if (!fs.existsSync(extensionsRoot)) {
    return "";
  }

  const candidates = fs.readdirSync(extensionsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^openai\.chatgpt-/i.test(entry.name))
    .map((entry) => path.join(extensionsRoot, entry.name, "bin", "windows-x86_64", "codex.exe"))
    .filter((filePath) => fs.existsSync(filePath))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);

  return candidates[0] || "";
}

function formatUnavailableCommandMessage(role, command) {
  const normalized = normalizeCommandValue(command);
  const family = getCommandFamily(normalized);
  const locationHint = isExplicitCommandPath(normalized)
    ? "configured path"
    : "PATH";

  if (family === "codex") {
    return `${role} command "${normalized}" is not available via ${locationHint}. The Codex VS Code extension is not the same as the codex CLI; install the Codex CLI or point Hermes to an actual codex executable.`;
  }

  return `${role} command "${normalized}" is not available via ${locationHint}.`;
}

const bundledCodexExecutable = findBundledCodexExecutable();
if (bundledCodexExecutable) {
  defaultConfig.planner.command = bundledCodexExecutable;
  defaultConfig.executors.codex.command = bundledCodexExecutable;
}

function timestampId() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function buildPlannerPrompt(instruction, config) {
  const workdir = config.dispatch.defaultWorkdir || ".";
  return `你现在扮演 Hermes 的主控大脑，但执行载体是一个独立的 Codex 规划会话。你的职责是把用户请求拆解并分配给 3 个外部编码执行器：codex、claude、gemini。

约束：
1. 只输出 JSON，不要输出解释，不要输出 Markdown。
2. JSON 结构必须是：
{
  "summary": "一句话概述",
  "tasks": [
    {
      "id": "task-1",
      "title": "短标题",
      "executor": "codex|claude|gemini",
      "objective": "给该执行器的完整任务说明",
      "workdir": "${workdir}",
      "dependsOn": [],
      "writeTargets": ["相对文件或目录路径"],
      "canUseSubagents": true
    }
  ]
}
3. task id 必须唯一，dependsOn 只能引用前面出现过的 task id。
4. 默认按下面这套固定职责分工，不要随意改：
   - codex: 后端任务、服务端逻辑、接口、数据流、工程实现
   - gemini: 前端任务、UI、交互、页面表现、前端体验
   - claude: 代码查漏补缺、review、兜底修正、边界核对、补文档
5. 任务拆分时优先遵循领域而不是泛泛的能力标签：
   - 只要是后端主任务，优先分给 codex
   - 只要是前端主任务，优先分给 gemini
   - 如果需要做代码查漏补缺、遗漏扫描、风险复核、补丁兜底，优先分给 claude
6. 如果请求同时包含前后端，优先拆成“后端 codex” + “前端 gemini” + “查漏补缺 claude” 这样的结构。
7. 如果任务不适合拆分，就只返回 1 个任务，但仍要按上面的固定职责选 executor。
8. 每个 task 尽量提供 writeTargets，列出预计会改动的相对文件或目录路径，用于并行调度时判断是否冲突；如果确实无法判断，再写 []。
9. 如果某个任务本身很复杂、还可以在执行器内部继续拆分子问题，就把 canUseSubagents 设为 true；否则设为 false。
10. workdir 使用相对路径，默认 "${workdir}"。

用户请求：
${instruction}`;
}

function extractJsonBlock(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    return fenced[1].trim();
  }

  const start = text.indexOf("{");
  if (start === -1) {
    throw new Error("Planner output does not contain JSON.");
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  throw new Error("Planner output contains an incomplete JSON object.");
}

function inferExecutorFromTask(task) {
  const titleText = String(task.title ?? "").toLowerCase();
  const objectiveText = String(task.objective ?? "").toLowerCase();

  const routingRules = {
    claude: [
      "查漏补缺",
      "兜底",
      "复核",
    "review",
    "补文档",
    "文档",
    "边界",
    "风险",
    "遗漏扫描",
    "gap-filling",
    "fallback",
      "audit",
      "edge case",
      "edge-case",
      "regression",
    ],
    gemini: [
      "前端",
      "frontend",
      "ui",
    "页面",
    "page",
    "交互",
    "样式",
    "style",
    "css",
    "组件",
    "component",
      "视觉",
      "布局",
      "layout",
      "体验",
    ],
    codex: [
      "后端",
      "backend",
      "服务端",
    "server",
    "接口",
    "api",
    "数据流",
    "data flow",
    "service",
    "数据库",
    "database",
      "middleware",
      "路由",
      "route",
      "工程实现",
    ],
  };

  const scoreRole = (keywords) => {
    let score = 0;
    for (const keyword of keywords) {
      if (titleText.includes(keyword)) {
        score += 4;
      }
      if (objectiveText.includes(keyword)) {
        score += 1;
      }
    }
    return score;
  };

  const scoredRoles = Object.entries(routingRules)
    .map(([executor, keywords]) => ({ executor, score: scoreRole(keywords) }))
    .sort((left, right) => right.score - left.score);

  if (scoredRoles[0] && scoredRoles[0].score > 0) {
    return scoredRoles[0].executor;
  }

  return "";
}

function normalizeWriteTarget(value) {
  return String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.?\//, "")
    .replace(/\/+/g, "/")
    .replace(/\/$/, "");
}

function normalizePlan(rawPlan, config) {
  if (!rawPlan || typeof rawPlan !== "object") {
    throw new Error("Plan must be a JSON object.");
  }
  const tasks = Array.isArray(rawPlan.tasks) ? rawPlan.tasks : [];
  if (tasks.length === 0) {
    throw new Error("Plan does not contain any tasks.");
  }

  const knownExecutors = new Set(Object.keys(config.executors));
  const seenIds = new Set();

  const normalizedTasks = tasks.map((task, index) => {
    const id = String(task.id ?? `task-${index + 1}`).trim();
    const title = String(task.title ?? task.objective ?? id).trim();
    const objective = String(task.objective ?? "").trim();
    const workdir = String(task.workdir ?? config.dispatch.defaultWorkdir ?? ".").trim();
    const dependsOn = Array.isArray(task.dependsOn)
      ? task.dependsOn.map((value) => String(value).trim()).filter(Boolean)
      : [];
    const writeTargets = Array.isArray(task.writeTargets)
      ? task.writeTargets.map((value) => normalizeWriteTarget(value)).filter(Boolean)
      : [];
    const canUseSubagents = Boolean(task.canUseSubagents);
    const requestedExecutor = String(task.executor ?? "").trim();
    const inferredExecutor = inferExecutorFromTask({ title, objective });
    const executor = inferredExecutor || requestedExecutor;

    if (!id) {
      throw new Error(`Task ${index + 1} is missing an id.`);
    }
    if (seenIds.has(id)) {
      throw new Error(`Duplicate task id: ${id}`);
    }
    if (requestedExecutor && !knownExecutors.has(requestedExecutor)) {
      throw new Error(`Task ${id} uses unknown executor "${requestedExecutor}".`);
    }
    if (!knownExecutors.has(executor)) {
      throw new Error(`Task ${id} uses unknown executor "${executor}".`);
    }
    if (!objective) {
      throw new Error(`Task ${id} is missing an objective.`);
    }
    if (requestedExecutor && inferredExecutor && requestedExecutor !== inferredExecutor) {
      console.warn(`[Hermes routing] task "${id}" reassigned from ${requestedExecutor} to ${inferredExecutor} based on fixed routing rules.`);
    }

    seenIds.add(id);
    return { id, title, executor, objective, workdir, dependsOn, writeTargets, canUseSubagents };
  });

  for (const task of normalizedTasks) {
    for (const dependency of task.dependsOn) {
      if (!seenIds.has(dependency)) {
        throw new Error(`Task ${task.id} depends on unknown task "${dependency}".`);
      }
    }
  }

  return {
    summary: String(rawPlan.summary ?? "").trim(),
    tasks: normalizedTasks,
  };
}

function buildExecutorPrompt(plan, task) {
  const dependencyNotes = task.dependsOn.length
    ? `依赖任务：${task.dependsOn.join(", ")}`
    : "依赖任务：无";

  return `你是被主控调度的执行器，请只完成你自己的任务。

总任务摘要：
${plan.summary || "未提供"}

当前任务：
- ID: ${task.id}
- 标题: ${task.title}
- ${dependencyNotes}
- 工作目录: ${task.workdir}
- 预计改动范围: ${task.writeTargets.length > 0 ? task.writeTargets.join(", ") : "未声明，默认按可能冲突处理"}
- 允许子代理: ${task.canUseSubagents ? "是" : "否"}

任务目标：
${task.objective}

执行要求：
1. 如果需要改文件，直接在工作目录内完成。
2. 不要重复规划整个项目，只完成当前任务范围。
3. 如果任务较复杂且你的运行时支持子代理、并行 worker 或内部任务拆分，可以在不越权、不与其他任务争抢同一批文件的前提下使用子代理推进；如果不支持，就正常单线程完成。
4. 尽量把改动限制在上面声明的 writeTargets 范围内；如果实际需要越出该范围，先在最终 NOTES 里明确说明。
5. 最终输出使用下面的文本格式，方便主控汇总：
STATUS: DONE|BLOCKED
SUMMARY: 一段简短总结
ARTIFACTS:
- 列出修改的文件或关键产物
NOTES:
- 额外说明或阻塞信息`;
}

function buildExecutorArgs(executorConfig, prompt, workdir) {
  const baseArgs = Array.isArray(executorConfig.args) ? [...executorConfig.args] : [];
  const mode = executorConfig.promptMode ?? "argument";
  const model = String(executorConfig.model ?? "").trim();
  const env = {};
  const commandFamily = getCommandFamily(executorConfig.command);

  if (commandFamily === "codex" && !baseArgs.includes("-C") && !baseArgs.includes("--cd")) {
    baseArgs.push("-C", workdir);
  }

  if (commandFamily === "claude" && !baseArgs.includes("--add-dir")) {
    baseArgs.push("--add-dir", workdir);
  }

  if (model && (commandFamily === "codex" || commandFamily === "claude")) {
    baseArgs.push("--model", model);
  }

  if (model && commandFamily === "gemini") {
    env.GEMINI_MODEL = model;
  }

  if (mode === "stdin") {
    return { args: baseArgs, stdin: prompt, env };
  }

  return { args: [...baseArgs, prompt], stdin: null, env };
}

function buildPlannerArgs(plannerConfig, prompt, workdir) {
  const baseArgs = Array.isArray(plannerConfig.args) ? [...plannerConfig.args] : [];
  const mode = plannerConfig.promptMode ?? "argument";
  const model = String(plannerConfig.model ?? "").trim();
  const commandFamily = getCommandFamily(plannerConfig.command);

  if (commandFamily === "codex" && !baseArgs.includes("-C") && !baseArgs.includes("--cd")) {
    baseArgs.push("-C", workdir);
  }

  if (model && commandFamily === "codex") {
    baseArgs.push("--model", model);
  }

  if (mode === "stdin") {
    return { args: baseArgs, stdin: prompt };
  }

  return { args: [...baseArgs, prompt], stdin: null };
}

function buildPlannerResumeArgs(plannerConfig, sessionId, prompt) {
  const baseArgs = Array.isArray(plannerConfig.resumeArgs) ? [...plannerConfig.resumeArgs] : ["exec", "resume"];
  const mode = plannerConfig.promptMode ?? "argument";
  const model = String(plannerConfig.model ?? "").trim();
  const commandFamily = getCommandFamily(plannerConfig.command);
  const args = [...baseArgs, sessionId];

  if (model && commandFamily === "codex") {
    args.push("--model", model);
  }

  if (mode === "stdin") {
    return { args, stdin: prompt };
  }

  return { args: [...args, prompt], stdin: null };
}

function buildPlannerSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["summary", "tasks"],
    properties: {
      summary: { type: "string" },
      tasks: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "title", "executor", "objective", "workdir", "dependsOn"],
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            executor: { type: "string", enum: ["codex", "claude", "gemini"] },
            objective: { type: "string" },
            workdir: { type: "string" },
            dependsOn: {
              type: "array",
              items: { type: "string" },
            },
            writeTargets: {
              type: "array",
              items: { type: "string" },
            },
            canUseSubagents: { type: "boolean" },
          },
        },
      },
    },
  };
}

function extractPlannerSessionId(...chunks) {
  for (const chunk of chunks) {
    const text = String(chunk || "");
    const match = text.match(/session id:\s*([0-9a-f-]{8,})/i);
    if (match) {
      return match[1];
    }

    const sessionMetaMatch = text.match(/"id":"([0-9a-f-]{8,})"/i);
    if (sessionMetaMatch) {
      return sessionMetaMatch[1];
    }
  }
  return "";
}

async function readPlannerState(statePath) {
  try {
    const text = await fsp.readFile(statePath, "utf8");
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

async function writePlannerState(statePath, payload) {
  await ensureDir(path.dirname(statePath));
  await fsp.writeFile(statePath, JSON.stringify(payload, null, 2), "utf8");
}

async function commandExists(command) {
  const normalized = normalizeCommandValue(command);
  const resolved = resolveCommandForExecution(normalized);

  if (!resolved) {
    return false;
  }

  if (isExplicitCommandPath(normalized)) {
    return fs.existsSync(resolved);
  }

  const locator = process.platform === "win32" ? "where" : "which";
  return new Promise((resolve) => {
    const child = spawn(locator, [normalized], { stdio: "ignore" });
    child.on("close", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

async function runProcess(command, args, options = {}) {
  const {
    cwd = repoRoot,
    stdin = null,
    env = process.env,
    onStdout = null,
    onStderr = null,
    onSpawn = null,
  } = options;

  return new Promise((resolve, reject) => {
    const child = spawn(resolveCommandForExecution(command), args, {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
    });

    if (typeof onSpawn === "function") {
      onSpawn(child);
    }

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      if (typeof onStdout === "function") {
        onStdout(chunk);
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      if (typeof onStderr === "function") {
        onStderr(chunk);
      }
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr, code });
        return;
      }
      reject(new Error(`${command} exited with code ${code}\n${stderr || stdout}`));
    });

    if (stdin) {
      child.stdin.write(stdin);
    }
    child.stdin.end();
  });
}

function buildControlFilePath(runDir) {
  return path.join(runDir, CONTROL_FILE_NAME);
}

function createEmptyControlState() {
  return {
    updatedAt: new Date().toISOString(),
    runAction: null,
    runReason: null,
    stopTasks: [],
  };
}

function normalizeControlState(payload) {
  const stopTasks = Array.isArray(payload?.stopTasks)
    ? payload.stopTasks
      .map((entry) => {
        const taskId = String(entry?.taskId || "").trim();
        if (!taskId) {
          return null;
        }

        return {
          taskId,
          reason: String(entry?.reason || "").trim() || null,
          requestedAt: String(entry?.requestedAt || "").trim() || new Date().toISOString(),
        };
      })
      .filter(Boolean)
    : [];

  const runAction = String(payload?.runAction || "").trim().toLowerCase();
  return {
    updatedAt: String(payload?.updatedAt || "").trim() || new Date().toISOString(),
    runAction: runAction === "cancel" ? "cancel" : null,
    runReason: String(payload?.runReason || "").trim() || null,
    stopTasks,
  };
}

async function ensureControlState(runDir) {
  const controlPath = buildControlFilePath(runDir);
  if (!fs.existsSync(controlPath)) {
    await fsp.writeFile(controlPath, JSON.stringify(createEmptyControlState(), null, 2), "utf8");
  }
  return controlPath;
}

async function readControlState(controlPath) {
  try {
    const text = await fsp.readFile(controlPath, "utf8");
    return normalizeControlState(JSON.parse(text));
  } catch {
    return createEmptyControlState();
  }
}

async function killProcessTree(pid) {
  if (!pid || !Number.isFinite(pid)) {
    return;
  }

  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const child = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
        stdio: "ignore",
        shell: false,
      });
      child.on("close", () => resolve());
      child.on("error", () => resolve());
    });
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {}

  await new Promise((resolve) => setTimeout(resolve, 250));

  try {
    process.kill(pid, "SIGKILL");
  } catch {}
}

async function generatePlan(instruction, config, runDir) {
  const plannerConfig = config.planner ?? {};
  const command = plannerConfig.command ?? "hermes";
  const commandFamily = getCommandFamily(command);
  const exists = await commandExists(command);
  if (!exists) {
    throw new Error(formatUnavailableCommandMessage("Planner", command));
  }

  const plannerPrompt = buildPlannerPrompt(instruction, config);
  await fsp.writeFile(path.join(runDir, "planner-prompt.txt"), plannerPrompt, "utf8");
  const plannerSchemaPath = path.join(runDir, "planner-schema.json");
  const plannerLastMessagePath = path.join(runDir, "planner-last-message.txt");
  const plannerStatePath = resolveFromRoot(plannerConfig.sessionStateFile, path.join(config.dispatch.outputRoot, "planner-session.json"));
  await fsp.writeFile(plannerSchemaPath, JSON.stringify(buildPlannerSchema(), null, 2), "utf8");

  const plannerCwd = resolveFromRoot(plannerConfig.cwd, ".");
  const existingPlannerState = await readPlannerState(plannerStatePath);
  const previousSessionId = String(existingPlannerState?.sessionId || "").trim();

  let invocationMode = "fresh";
  let plannerInvocation;
  if (commandFamily === "codex" && previousSessionId) {
    invocationMode = "resume";
    plannerInvocation = buildPlannerResumeArgs(plannerConfig, previousSessionId, plannerPrompt);
  } else {
    plannerInvocation = buildPlannerArgs(plannerConfig, plannerPrompt, plannerCwd);
  }

  const { args, stdin } = plannerInvocation;
  if (commandFamily === "codex") {
    if (invocationMode === "fresh") {
      args.push("--output-schema", plannerSchemaPath);
    }
    args.push("--output-last-message", plannerLastMessagePath);
  }

  const plannerMeta = {
    profileId: String(plannerConfig.profileId ?? "default"),
    label: String(plannerConfig.label ?? command),
    model: String(plannerConfig.model ?? "").trim() || null,
    command,
    cwd: String(plannerConfig.cwd ?? "."),
    mode: invocationMode,
    previousSessionId: previousSessionId || null,
    sessionStateFile: String(plannerConfig.sessionStateFile ?? ""),
    executorModels: {
      codex: String(config.executors?.codex?.model ?? "").trim() || null,
      claude: String(config.executors?.claude?.model ?? "").trim() || null,
      gemini: String(config.executors?.gemini?.model ?? "").trim() || null,
    },
  };
  await fsp.writeFile(path.join(runDir, "planner-meta.json"), JSON.stringify(plannerMeta, null, 2), "utf8");

  let result;
  try {
    result = await runProcess(command, args, { cwd: plannerCwd, stdin });
  } catch (error) {
    if (error instanceof Error) {
      await fsp.writeFile(path.join(runDir, "planner-error.txt"), error.message, "utf8");
    }
    throw error;
  }

  await fsp.writeFile(path.join(runDir, "planner-stdout.txt"), result.stdout, "utf8");
  await fsp.writeFile(path.join(runDir, "planner-stderr.txt"), result.stderr, "utf8");

  const currentSessionId = extractPlannerSessionId(result.stdout, result.stderr, previousSessionId);
  const nextPlannerMeta = {
    ...plannerMeta,
    sessionId: currentSessionId || previousSessionId || null,
  };
  await fsp.writeFile(path.join(runDir, "planner-meta.json"), JSON.stringify(nextPlannerMeta, null, 2), "utf8");
  if (commandFamily === "codex" && (currentSessionId || previousSessionId)) {
    await writePlannerState(plannerStatePath, {
      label: nextPlannerMeta.label,
      command,
      cwd: plannerCwd,
      sessionId: currentSessionId || previousSessionId,
      updatedAt: new Date().toISOString(),
    });
  }

  const plannerText = fs.existsSync(plannerLastMessagePath)
    ? await fsp.readFile(plannerLastMessagePath, "utf8")
    : result.stdout;
  const plan = normalizePlan(JSON.parse(extractJsonBlock(plannerText)), config);
  await fsp.writeFile(path.join(runDir, "plan.json"), JSON.stringify(plan, null, 2), "utf8");
  return plan;
}

async function loadPlanFromFile(planFile, config, runDir) {
  const planPath = path.resolve(repoRoot, planFile);
  const planText = await fsp.readFile(planPath, "utf8");
  const plan = normalizePlan(JSON.parse(planText), config);
  await fsp.writeFile(
    path.join(runDir, "planner-meta.json"),
    JSON.stringify(
      {
        profileId: null,
        label: "sample-plan",
        model: null,
        command: "sample-plan",
        cwd: ".",
        mode: "manual",
        sessionId: null,
        sessionStateFile: null,
        executorModels: {
          codex: null,
          claude: null,
          gemini: null,
        },
      },
      null,
      2,
    ),
    "utf8",
  );
  await fsp.writeFile(path.join(runDir, "plan.json"), JSON.stringify(plan, null, 2), "utf8");
  return plan;
}

function createDispatchState(plan) {
  return {
    completed: new Set(),
    failed: new Set(),
    cancelled: new Set(),
    running: new Map(),
    activeChildren: new Map(),
    handledStopTasks: new Set(),
    killRequestedTasks: new Set(),
    requestedTaskStops: new Map(),
    outputs: [],
    runStatus: "running",
    cancelRequested: false,
    cancelReason: null,
    taskMeta: new Map(
      plan.tasks.map((task) => [
        task.id,
        {
          status: "queued",
          startedAt: null,
          finishedAt: null,
          durationMs: null,
          error: null,
        },
      ]),
    ),
  };
}

function createProgressSnapshot(plan, state) {
  const tasks = plan.tasks.map((task) => {
    const meta = state.taskMeta.get(task.id) || {};
    return {
      id: task.id,
      title: task.title,
      executor: task.executor,
      workdir: task.workdir,
      dependsOn: task.dependsOn,
      writeTargets: task.writeTargets,
      canUseSubagents: task.canUseSubagents,
      status: meta.status || "queued",
      startedAt: meta.startedAt || null,
      finishedAt: meta.finishedAt || null,
      durationMs: meta.durationMs || null,
      error: meta.error || null,
    };
  });

  const summary = tasks.reduce((accumulator, task) => {
    accumulator.total += 1;
    accumulator[task.status] = (accumulator[task.status] || 0) + 1;
    return accumulator;
  }, {
    total: 0,
    queued: 0,
    running: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
  });

  return {
    updatedAt: new Date().toISOString(),
    runStatus: state.runStatus || "running",
    cancelRequested: Boolean(state.cancelRequested),
    currentTaskIds: tasks.filter((task) => task.status === "running").map((task) => task.id),
    currentExecutors: tasks.filter((task) => task.status === "running").map((task) => task.executor),
    summary,
    tasks,
  };
}

async function persistDispatchState(plan, state, runDir) {
  await Promise.all([
    fsp.writeFile(path.join(runDir, "progress.json"), JSON.stringify(createProgressSnapshot(plan, state), null, 2), "utf8"),
    fsp.writeFile(path.join(runDir, "results.json"), JSON.stringify(state.outputs, null, 2), "utf8"),
  ]);
}

function pathScopesOverlap(left, right) {
  if (!left || !right) {
    return false;
  }

  return left === right
    || left.startsWith(`${right}/`)
    || right.startsWith(`${left}/`);
}

function tasksConflict(leftTask, rightTask, config) {
  const leftWorkdir = resolveFromRoot(leftTask.workdir, config.dispatch.defaultWorkdir);
  const rightWorkdir = resolveFromRoot(rightTask.workdir, config.dispatch.defaultWorkdir);

  if (leftWorkdir !== rightWorkdir) {
    return false;
  }

  const leftTargets = Array.isArray(leftTask.writeTargets) ? leftTask.writeTargets : [];
  const rightTargets = Array.isArray(rightTask.writeTargets) ? rightTask.writeTargets : [];

  if (leftTargets.length === 0 || rightTargets.length === 0) {
    return !config.dispatch.allowSharedWorkdirParallel;
  }

  return leftTargets.some((leftTarget) => rightTargets.some((rightTarget) => pathScopesOverlap(leftTarget, rightTarget)));
}

function selectReadyTasks(plan, state, config) {
  if (state.cancelRequested) {
    return [];
  }

  const ready = [];
  const activeTasks = Array.from(state.running.values());

  for (const task of plan.tasks) {
    if (
      state.completed.has(task.id)
      || state.failed.has(task.id)
      || state.cancelled.has(task.id)
      || state.running.has(task.id)
    ) {
      continue;
    }
    const depsReady = task.dependsOn.every((dependency) => state.completed.has(dependency));
    if (!depsReady) {
      continue;
    }

    const hasConflict = [...activeTasks, ...ready].some((activeTask) => tasksConflict(task, activeTask, config));
    if (hasConflict) {
      continue;
    }

    ready.push(task);
    if (ready.length >= (config.dispatch.maxParallel ?? 1)) {
      break;
    }
  }
  return ready;
}

function cascadeCancelledDependents(plan, state) {
  let changed = false;
  let shouldScan = true;

  while (shouldScan) {
    shouldScan = false;
    for (const task of plan.tasks) {
      if (
        state.completed.has(task.id)
        || state.failed.has(task.id)
        || state.cancelled.has(task.id)
        || state.running.has(task.id)
      ) {
        continue;
      }

      const blockedDependency = task.dependsOn.find((dependency) => (
        state.failed.has(dependency) || state.cancelled.has(dependency)
      ));
      if (!blockedDependency) {
        continue;
      }

      const blockedMeta = state.taskMeta.get(blockedDependency) || {};
      const reason = blockedMeta.error
        ? `依赖 ${blockedDependency} 未完成：${blockedMeta.error}`
        : `依赖 ${blockedDependency} 已终止，当前任务一并取消`;

      state.cancelled.add(task.id);
      state.taskMeta.set(task.id, {
        ...(state.taskMeta.get(task.id) || {}),
        status: "cancelled",
        finishedAt: Date.now(),
        durationMs: null,
        error: reason,
      });
      state.outputs.push({
        status: "cancelled",
        taskId: task.id,
        executor: task.executor,
        title: task.title,
        error: reason,
        startedAt: null,
        finishedAt: Date.now(),
        durationMs: null,
      });
      changed = true;
      shouldScan = true;
    }
  }

  return changed;
}

function markQueuedTasksCancelled(plan, state, reason) {
  const finishedAt = Date.now();

  for (const task of plan.tasks) {
    if (
      state.completed.has(task.id)
      || state.failed.has(task.id)
      || state.cancelled.has(task.id)
      || state.running.has(task.id)
    ) {
      continue;
    }

    state.cancelled.add(task.id);
    state.taskMeta.set(task.id, {
      ...(state.taskMeta.get(task.id) || {}),
      status: "cancelled",
      finishedAt,
      durationMs: null,
      error: reason,
    });
    state.outputs.push({
      status: "cancelled",
      taskId: task.id,
      executor: task.executor,
      title: task.title,
      error: reason,
      startedAt: null,
      finishedAt,
      durationMs: null,
    });
  }
}

async function applyRuntimeControls(plan, state, runDir) {
  const controlState = await readControlState(buildControlFilePath(runDir));
  let changed = false;

  if (controlState.runAction === "cancel" && !state.cancelRequested) {
    state.cancelRequested = true;
    state.cancelReason = controlState.runReason || "Run cancelled from workbench.";
    state.runStatus = "cancelling";
    changed = true;
  }

  for (const entry of controlState.stopTasks) {
    if (state.handledStopTasks.has(entry.taskId)) {
      continue;
    }
    state.handledStopTasks.add(entry.taskId);

    if (!state.requestedTaskStops.has(entry.taskId)) {
      state.requestedTaskStops.set(entry.taskId, entry.reason || "Task stopped from workbench.");
    }

    const child = state.activeChildren.get(entry.taskId);
    if (child && child.pid && !state.killRequestedTasks.has(entry.taskId)) {
      state.killRequestedTasks.add(entry.taskId);
      await killProcessTree(child.pid);
      changed = true;
    }
  }

  if (state.cancelRequested) {
    for (const [taskId, child] of state.activeChildren.entries()) {
      if (!state.requestedTaskStops.has(taskId)) {
        state.requestedTaskStops.set(taskId, state.cancelReason || "Run cancelled from workbench.");
      }
      if (child && child.pid && !state.killRequestedTasks.has(taskId)) {
        state.killRequestedTasks.add(taskId);
        await killProcessTree(child.pid);
        changed = true;
      }
    }
  }

  if (changed) {
    await persistDispatchState(plan, state, runDir);
  }
}

async function syncTaskStopOnSpawn(taskId, state) {
  const child = state.activeChildren.get(taskId);
  if (!child || !child.pid || state.killRequestedTasks.has(taskId)) {
    return false;
  }

  const shouldStop = state.cancelRequested || state.requestedTaskStops.has(taskId);
  if (!shouldStop) {
    return false;
  }

  state.killRequestedTasks.add(taskId);
  await killProcessTree(child.pid);
  return true;
}

async function executeTask(plan, task, config, runDir, state) {
  const executorConfig = config.executors[task.executor];
  if (!executorConfig) {
    throw new Error(`Missing executor configuration for ${task.executor}.`);
  }

  const exists = await commandExists(executorConfig.command);
  if (!exists) {
    throw new Error(formatUnavailableCommandMessage(`Executor ${task.executor}`, executorConfig.command));
  }

  const taskDir = path.join(runDir, task.id);
  await ensureDir(taskDir);
  const stdoutPath = path.join(taskDir, "stdout.txt");
  const stderrPath = path.join(taskDir, "stderr.txt");
  await Promise.all([
    fsp.writeFile(stdoutPath, "", "utf8"),
    fsp.writeFile(stderrPath, "", "utf8"),
  ]);
  const stdoutStream = fs.createWriteStream(stdoutPath, { flags: "a" });
  const stderrStream = fs.createWriteStream(stderrPath, { flags: "a" });

  const workdir = resolveFromRoot(task.workdir || executorConfig.cwd, config.dispatch.defaultWorkdir);
  const prompt = buildExecutorPrompt(plan, task);
  await fsp.writeFile(path.join(taskDir, "prompt.txt"), prompt, "utf8");

  const { args, stdin, env } = buildExecutorArgs(executorConfig, prompt, workdir);
  console.log(`-> ${task.id} [${task.executor}] ${task.title}`);

  const startedAt = Date.now();
  let result;
  try {
    result = await runProcess(executorConfig.command, args, {
      cwd: workdir,
      stdin,
      env: { ...process.env, ...(executorConfig.env ?? {}), ...env },
      onStdout: (chunk) => stdoutStream.write(chunk),
      onStderr: (chunk) => stderrStream.write(chunk),
      onSpawn: async (child) => {
        state.activeChildren.set(task.id, child);
        await syncTaskStopOnSpawn(task.id, state);
      },
    });
  } finally {
    state.activeChildren.delete(task.id);
    stdoutStream.end();
    stderrStream.end();
  }

  const finishedAt = Date.now();
  await fsp.writeFile(
    path.join(taskDir, "result.json"),
    JSON.stringify(
      {
        taskId: task.id,
        executor: task.executor,
        title: task.title,
        workdir,
        startedAt,
        finishedAt,
        durationMs: finishedAt - startedAt,
      },
      null,
      2,
    ),
    "utf8",
  );

  return {
    taskId: task.id,
    executor: task.executor,
    title: task.title,
    workdir,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
    startedAt,
    finishedAt,
    durationMs: finishedAt - startedAt,
  };
}

async function dispatchPlan(plan, config, runDir) {
  const state = createDispatchState(plan);
  await persistDispatchState(plan, state, runDir);
  const controlPath = await ensureControlState(runDir);
  void controlPath;

  const controlTimer = setInterval(() => {
    applyRuntimeControls(plan, state, runDir).catch((error) => {
      console.error(error.message || error);
    });
  }, CONTROL_POLL_INTERVAL_MS);

  try {
    while (state.completed.size + state.failed.size + state.cancelled.size < plan.tasks.length) {
      await applyRuntimeControls(plan, state, runDir);
      cascadeCancelledDependents(plan, state);

      if (state.cancelRequested && state.running.size === 0) {
        markQueuedTasksCancelled(plan, state, state.cancelReason || "Run cancelled from workbench.");
        cascadeCancelledDependents(plan, state);
        state.runStatus = "cancelled";
        await persistDispatchState(plan, state, runDir);
        break;
      }

      const ready = selectReadyTasks(plan, state, config);
      if (ready.length === 0) {
        const blocked = plan.tasks
          .filter((task) => !state.completed.has(task.id) && !state.failed.has(task.id) && !state.cancelled.has(task.id))
          .map((task) => task.id);

        if (state.cancelRequested) {
          if (state.running.size === 0) {
            markQueuedTasksCancelled(plan, state, state.cancelReason || "Run cancelled from workbench.");
            cascadeCancelledDependents(plan, state);
            state.runStatus = "cancelled";
            await persistDispatchState(plan, state, runDir);
            break;
          }
          continue;
        }

        throw new Error(`Dispatch deadlocked. Remaining tasks: ${blocked.join(", ")}`);
      }

      for (const task of ready) {
        state.running.set(task.id, task);
        state.taskMeta.set(task.id, {
          ...(state.taskMeta.get(task.id) || {}),
          status: "running",
          startedAt: Date.now(),
          finishedAt: null,
          durationMs: null,
          error: null,
        });
      }
      await persistDispatchState(plan, state, runDir);

      const settled = await Promise.allSettled(
        ready.map((task) => executeTask(plan, task, config, runDir, state)),
      );

      settled.forEach((result, index) => {
        const task = ready[index];
        const existingMeta = state.taskMeta.get(task.id) || {};
        state.running.delete(task.id);
        state.activeChildren.delete(task.id);
        state.killRequestedTasks.delete(task.id);
        if (result.status === "fulfilled") {
          state.completed.add(task.id);
          state.outputs.push({ status: "fulfilled", ...result.value });
          state.taskMeta.set(task.id, {
            ...(state.taskMeta.get(task.id) || {}),
            status: "completed",
            startedAt: result.value.startedAt,
            finishedAt: result.value.finishedAt,
            durationMs: result.value.durationMs,
            error: null,
          });
          console.log(`<- ${task.id} [${task.executor}] done`);
          return;
        }

        const stopReason = state.requestedTaskStops.get(task.id);
        if (stopReason) {
          const finishedAt = Date.now();
          state.cancelled.add(task.id);
          state.outputs.push({
            status: "cancelled",
            taskId: task.id,
            executor: task.executor,
            title: task.title,
            error: stopReason,
            startedAt: existingMeta.startedAt || null,
            finishedAt,
            durationMs: existingMeta.startedAt ? finishedAt - existingMeta.startedAt : null,
          });
          state.taskMeta.set(task.id, {
            ...existingMeta,
            status: "cancelled",
            finishedAt,
            durationMs: existingMeta.startedAt ? finishedAt - existingMeta.startedAt : null,
            error: stopReason,
          });
          console.log(`<- ${task.id} [${task.executor}] cancelled`);
          return;
        }

        state.failed.add(task.id);
        state.outputs.push({
          status: "rejected",
          taskId: task.id,
          executor: task.executor,
          title: task.title,
          error: String(result.reason?.message ?? result.reason),
        });
        state.taskMeta.set(task.id, {
          ...existingMeta,
          status: "failed",
          finishedAt: Date.now(),
          error: String(result.reason?.message ?? result.reason),
        });
        console.log(`<- ${task.id} [${task.executor}] failed`);
      });
      await applyRuntimeControls(plan, state, runDir);
      cascadeCancelledDependents(plan, state);
      await persistDispatchState(plan, state, runDir);
    }
  } finally {
    clearInterval(controlTimer);
  }

  if (!state.cancelRequested) {
    if (state.failed.size > 0) {
      state.runStatus = "failed";
    } else if (state.cancelled.size > 0) {
      state.runStatus = "cancelled";
    } else {
      state.runStatus = "completed";
    }
  } else if (state.runStatus !== "cancelled") {
    state.runStatus = "cancelled";
  }

  await persistDispatchState(plan, state, runDir);
  return state;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.planFile && !options.instruction) {
    printUsage();
    process.exit(1);
  }

  const config = await loadConfig(options.configPath);
  const runDir = options.outputDir
    ? path.resolve(repoRoot, options.outputDir)
    : path.resolve(repoRoot, config.dispatch.outputRoot, timestampId());
  await ensureDir(runDir);

  const plan = options.planFile
    ? await loadPlanFromFile(options.planFile, config, runDir)
    : await generatePlan(options.instruction, config, runDir);

  console.log(JSON.stringify(plan, null, 2));
  await persistDispatchState(plan, createDispatchState(plan), runDir);

  if (options.planOnly) {
    return;
  }

  const state = await dispatchPlan(plan, config, runDir);
  const results = state.outputs;
  const summary = {
    runDir,
    total: plan.tasks.length,
    status: state.runStatus,
    completed: results.filter((item) => item.status === "fulfilled").length,
    failed: results.filter((item) => item.status === "rejected").length,
    cancelled: results.filter((item) => item.status === "cancelled").length,
  };
  await fsp.writeFile(path.join(runDir, "summary.json"), JSON.stringify(summary, null, 2), "utf8");

  if (summary.failed > 0) {
    process.exitCode = 1;
  } else if (summary.status === "cancelled") {
    process.exitCode = 130;
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});

