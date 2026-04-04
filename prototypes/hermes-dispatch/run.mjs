#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();

const defaultConfig = {
  planner: {
    command: "hermes",
    args: ["chat", "-q"],
    cwd: ".",
  },
  dispatch: {
    defaultWorkdir: ".",
    maxParallel: 1,
    allowSharedWorkdirParallel: false,
    outputRoot: "output/hermes-dispatch",
  },
  executors: {
    codex: {
      command: "codex",
      args: ["exec", "--full-auto", "--skip-git-repo-check"],
      promptMode: "argument",
      cwd: ".",
    },
    claude: {
      command: "claude",
      args: ["--print", "--dangerously-skip-permissions"],
      promptMode: "argument",
      cwd: ".",
    },
    gemini: {
      command: "gemini",
      args: ["-p"],
      promptMode: "argument",
      cwd: ".",
    },
  },
};

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

function timestampId() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function buildPlannerPrompt(instruction, config) {
  const workdir = config.dispatch.defaultWorkdir || ".";
  return `你现在扮演一个任务总控，负责把用户请求拆解并分配给 3 个外部编码执行器：codex、claude、gemini。

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
      "dependsOn": []
    }
  ]
}
3. task id 必须唯一，dependsOn 只能引用前面出现过的 task id。
4. 优先按能力分工：
   - codex: 大改动、代码实现、重构
   - claude: 分析、review、补文档、细化方案
   - gemini: 检索、总结、横向比较、辅助实现
5. 如果任务不适合拆分，就只返回 1 个任务。
6. workdir 使用相对路径，默认 "${workdir}"。

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
    const executor = String(task.executor ?? "").trim();
    const objective = String(task.objective ?? "").trim();
    const workdir = String(task.workdir ?? config.dispatch.defaultWorkdir ?? ".").trim();
    const dependsOn = Array.isArray(task.dependsOn)
      ? task.dependsOn.map((value) => String(value).trim()).filter(Boolean)
      : [];

    if (!id) {
      throw new Error(`Task ${index + 1} is missing an id.`);
    }
    if (seenIds.has(id)) {
      throw new Error(`Duplicate task id: ${id}`);
    }
    if (!knownExecutors.has(executor)) {
      throw new Error(`Task ${id} uses unknown executor "${executor}".`);
    }
    if (!objective) {
      throw new Error(`Task ${id} is missing an objective.`);
    }

    seenIds.add(id);
    return { id, title, executor, objective, workdir, dependsOn };
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

任务目标：
${task.objective}

执行要求：
1. 如果需要改文件，直接在工作目录内完成。
2. 不要重复规划整个项目，只完成当前任务范围。
3. 最终输出使用下面的文本格式，方便主控汇总：
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

  if (executorConfig.command === "codex" && !baseArgs.includes("-C") && !baseArgs.includes("--cd")) {
    baseArgs.push("-C", workdir);
  }

  if (executorConfig.command === "claude" && !baseArgs.includes("--add-dir")) {
    baseArgs.push("--add-dir", workdir);
  }

  if (mode === "stdin") {
    return { args: baseArgs, stdin: prompt };
  }

  return { args: [...baseArgs, prompt], stdin: null };
}

async function commandExists(command) {
  const locator = process.platform === "win32" ? "where" : "which";
  return new Promise((resolve) => {
    const child = spawn(locator, [command], { stdio: "ignore" });
    child.on("close", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

async function runProcess(command, args, options = {}) {
  const {
    cwd = repoRoot,
    stdin = null,
    env = process.env,
  } = options;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
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

async function generatePlan(instruction, config, runDir) {
  const plannerConfig = config.planner ?? {};
  const command = plannerConfig.command ?? "hermes";
  const exists = await commandExists(command);
  if (!exists) {
    throw new Error(`Planner command "${command}" is not available in PATH.`);
  }

  const plannerPrompt = buildPlannerPrompt(instruction, config);
  await fsp.writeFile(path.join(runDir, "planner-prompt.txt"), plannerPrompt, "utf8");

  const plannerArgs = [...(plannerConfig.args ?? []), plannerPrompt];
  const plannerCwd = resolveFromRoot(plannerConfig.cwd, ".");
  const result = await runProcess(command, plannerArgs, { cwd: plannerCwd });

  await fsp.writeFile(path.join(runDir, "planner-stdout.txt"), result.stdout, "utf8");
  await fsp.writeFile(path.join(runDir, "planner-stderr.txt"), result.stderr, "utf8");

  const plan = normalizePlan(JSON.parse(extractJsonBlock(result.stdout)), config);
  await fsp.writeFile(path.join(runDir, "plan.json"), JSON.stringify(plan, null, 2), "utf8");
  return plan;
}

async function loadPlanFromFile(planFile, config, runDir) {
  const planPath = path.resolve(repoRoot, planFile);
  const planText = await fsp.readFile(planPath, "utf8");
  const plan = normalizePlan(JSON.parse(planText), config);
  await fsp.writeFile(path.join(runDir, "plan.json"), JSON.stringify(plan, null, 2), "utf8");
  return plan;
}

function selectReadyTasks(plan, state, config) {
  const ready = [];
  const activeWorkdirs = new Set(
    Array.from(state.running.values()).map((task) => resolveFromRoot(task.workdir, config.dispatch.defaultWorkdir)),
  );

  for (const task of plan.tasks) {
    if (state.completed.has(task.id) || state.failed.has(task.id) || state.running.has(task.id)) {
      continue;
    }
    const depsReady = task.dependsOn.every((dependency) => state.completed.has(dependency));
    if (!depsReady) {
      continue;
    }

    const taskWorkdir = resolveFromRoot(task.workdir, config.dispatch.defaultWorkdir);
    if (!config.dispatch.allowSharedWorkdirParallel && activeWorkdirs.has(taskWorkdir)) {
      continue;
    }

    ready.push(task);
    activeWorkdirs.add(taskWorkdir);
    if (ready.length >= (config.dispatch.maxParallel ?? 1)) {
      break;
    }
  }
  return ready;
}

async function executeTask(plan, task, config, runDir) {
  const executorConfig = config.executors[task.executor];
  if (!executorConfig) {
    throw new Error(`Missing executor configuration for ${task.executor}.`);
  }

  const exists = await commandExists(executorConfig.command);
  if (!exists) {
    throw new Error(`Executor command "${executorConfig.command}" is not available in PATH.`);
  }

  const taskDir = path.join(runDir, task.id);
  await ensureDir(taskDir);

  const workdir = resolveFromRoot(task.workdir || executorConfig.cwd, config.dispatch.defaultWorkdir);
  const prompt = buildExecutorPrompt(plan, task);
  await fsp.writeFile(path.join(taskDir, "prompt.txt"), prompt, "utf8");

  const { args, stdin } = buildExecutorArgs(executorConfig, prompt, workdir);
  console.log(`-> ${task.id} [${task.executor}] ${task.title}`);

  const startedAt = Date.now();
  const result = await runProcess(executorConfig.command, args, {
    cwd: workdir,
    stdin,
    env: { ...process.env, ...(executorConfig.env ?? {}) },
  });

  const finishedAt = Date.now();
  await fsp.writeFile(path.join(taskDir, "stdout.txt"), result.stdout, "utf8");
  await fsp.writeFile(path.join(taskDir, "stderr.txt"), result.stderr, "utf8");
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
  const state = {
    completed: new Set(),
    failed: new Set(),
    running: new Map(),
  };
  const outputs = [];

  while (state.completed.size + state.failed.size < plan.tasks.length) {
    const ready = selectReadyTasks(plan, state, config);
    if (ready.length === 0) {
      const blocked = plan.tasks
        .filter((task) => !state.completed.has(task.id) && !state.failed.has(task.id))
        .map((task) => task.id);
      throw new Error(`Dispatch deadlocked. Remaining tasks: ${blocked.join(", ")}`);
    }

    for (const task of ready) {
      state.running.set(task.id, task);
    }

    const settled = await Promise.allSettled(
      ready.map((task) => executeTask(plan, task, config, runDir)),
    );

    settled.forEach((result, index) => {
      const task = ready[index];
      state.running.delete(task.id);
      if (result.status === "fulfilled") {
        state.completed.add(task.id);
        outputs.push({ status: "fulfilled", ...result.value });
        console.log(`<- ${task.id} [${task.executor}] done`);
        return;
      }

      state.failed.add(task.id);
      outputs.push({
        status: "rejected",
        taskId: task.id,
        executor: task.executor,
        title: task.title,
        error: String(result.reason?.message ?? result.reason),
      });
      console.log(`<- ${task.id} [${task.executor}] failed`);
    });
  }

  await fsp.writeFile(path.join(runDir, "results.json"), JSON.stringify(outputs, null, 2), "utf8");
  return outputs;
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

  if (options.planOnly) {
    return;
  }

  const results = await dispatchPlan(plan, config, runDir);
  const summary = {
    runDir,
    completed: results.filter((item) => item.status === "fulfilled").length,
    failed: results.filter((item) => item.status === "rejected").length,
  };
  await fsp.writeFile(path.join(runDir, "summary.json"), JSON.stringify(summary, null, 2), "utf8");

  if (summary.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
