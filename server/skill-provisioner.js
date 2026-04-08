import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const CATALOG_PATH = path.join("src", "generated", "skills-catalog.json");
const CREATE_SKILL_SCRIPT = path.join("scripts", "create-local-skill.mjs");
const SYNC_SKILLS_SCRIPT = path.join("scripts", "sync-skill-catalog.mjs");
const AGENT_SKILL_DOCUMENTS_DIR = path.join("output", "agent-skill-documents");
const AGENT_IDS = ["orchestrator", "explorer", "writer", "designer", "performer", "greeter"];

const STOPWORDS = new Set([
  "帮我", "请帮我", "一下", "一个", "这个", "那个", "需要", "生成", "整理", "处理", "执行", "完成", "自动", "自动化",
  "please", "help", "make", "build", "create", "write", "need", "with", "from", "into",
]);

function tokenizeTask(task) {
  return Array.from(new Set(
    String(task || "")
      .toLowerCase()
      .match(/[a-z0-9]+|[\u4e00-\u9fa5]{2,8}/g) ?? [],
  ))
    .map(token => token.trim())
    .filter(token => token && !STOPWORDS.has(token));
}

async function loadSkillCatalog(repoRoot) {
  const filePath = path.join(repoRoot, CATALOG_PATH);
  if (!existsSync(filePath)) return [];
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

function buildSkillHaystack(skill) {
  const zh = skill?.locales?.["zh-CN"] ?? {};
  const en = skill?.locales?.en ?? {};
  return [
    skill?.id,
    skill?.category,
    skill?.sourceLabel,
    ...(Array.isArray(skill?.tags) ? skill.tags : []),
    ...(Array.isArray(skill?.recommendedAgents) ? skill.recommendedAgents : []),
    zh.name,
    zh.short,
    zh.description,
    zh.dispatch,
    zh.typicalTasks,
    zh.outputs,
    en.name,
    en.short,
    en.description,
    en.dispatch,
    en.typicalTasks,
    en.outputs,
  ]
    .filter(Boolean)
    .map(value => String(value).toLowerCase())
    .join("\n");
}

function scoreSkill(skill, task, agentId) {
  const haystack = buildSkillHaystack(skill);
  const tokens = tokenizeTask(task);
  let score = 0;

  for (const token of tokens) {
    if (haystack.includes(token)) score += token.length >= 4 ? 3 : 2;
  }

  if (Array.isArray(skill?.recommendedAgents) && skill.recommendedAgents.includes(agentId)) {
    score += 2;
  }

  if (skill?.sourceType === "built-in" || skill?.sourceType === "local") score += 1;
  return score;
}

function inferSkillCategory(task) {
  const text = String(task || "").toLowerCase();
  if (/(word|docx|excel|xlsx|ppt|pptx|文档|文件|报告|表格|简报|簡報)/i.test(text)) return "documents";
  if (/(浏览器|browser|页面|网页|前端|ui|界面|layout|组件)/i.test(text)) return "automation";
  if (/(图片|设计|截图|海报|视觉|image|screenshot)/i.test(text)) return "visual";
  return "automation";
}

function inferSkillIcon(task) {
  const text = String(task || "").toLowerCase();
  if (/(excel|xlsx|表格|试算表|試算表|csv)/i.test(text)) return "sheet";
  if (/(ppt|pptx|简报|簡報|slides|presentation)/i.test(text)) return "slides";
  if (/(word|docx|文档|文件|报告|報告)/i.test(text)) return "doc";
  if (/(截图|screenshot|视觉|图像|图片|image)/i.test(text)) return "camera";
  if (/(浏览器|browser|网页|页面|web)/i.test(text)) return "globe";
  return "spark";
}

function inferSkillAccent(task) {
  const text = String(task || "").toLowerCase();
  if (/(excel|xlsx|表格|试算表|試算表|csv)/i.test(text)) return "#22c55e";
  if (/(ppt|pptx|简报|簡報|slides|presentation)/i.test(text)) return "#f97316";
  if (/(word|docx|文档|文件|报告|報告)/i.test(text)) return "#fb7185";
  if (/(浏览器|browser|网页|页面|web)/i.test(text)) return "#38bdf8";
  return "#a78bfa";
}

function inferSkillId(task) {
  const tokens = tokenizeTask(task)
    .map(token => String(token || "").toLowerCase())
    .map(token => token.replace(/[^a-z0-9]+/g, "-"))
    .map(token => token.replace(/-+/g, "-").replace(/^-|-$/g, ""))
    .filter(Boolean)
    .slice(0, 4);
  const category = inferSkillCategory(task);
  const slug = tokens.length > 0 ? tokens.join("-") : `${category}-${Date.now()}`;
  const normalized = String(slug || "auto-skill")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || `auto-skill-${Date.now()}`;
}

function inferSkillName(task) {
  const compact = String(task || "").replace(/\s+/g, " ").trim();
  return compact.length > 18 ? `${compact.slice(0, 18)}能力` : `${compact || "自动补齐"}能力`;
}

function shouldAutoCreateSkill(task) {
  const text = String(task || "").trim();
  if (!text) return false;
  return [
    /(?:缺少|没有|缺乏|欠缺).{0,8}(?:技能|skill|工具|tool|流程|能力)/i,
    /(?:需要|新增|补齐|補齊|创建|建立|安装|安裝).{0,10}(?:技能|skill|工具|tool|流程)/i,
    /(?:can you|need|missing).{0,18}(?:skill|tool|workflow|capability)/i,
  ].some(pattern => pattern.test(text));
}

function buildSkillPrompt(catalog, skillIds = []) {
  const skills = (Array.isArray(skillIds) ? skillIds : [])
    .map(skillId => catalog.find(skill => skill.id === skillId))
    .filter(Boolean)
    .slice(0, 6);

  if (skills.length === 0) return "";

  const lines = skills.map((skill) => {
    const copy = skill.locales?.["zh-CN"] ?? skill.locales?.en ?? {};
    return `- ${copy.name || skill.id}：${copy.dispatch || copy.description || "按该技能的典型流程执行"} 输出：${copy.outputs || "产出可交付结果"}`;
  });

  return `\n\n【本次任务命中的技能】\n${lines.join("\n")}\n以上技能是系统在任务开始前自动扫描命中的流程包，优先复用这些技能对应的步骤、产出结构和工具策略。`;
}

function listCatalogSkillIds(catalog) {
  return Array.from(new Set(
    (Array.isArray(catalog) ? catalog : [])
      .map(skill => String(skill?.id || "").trim())
      .filter(Boolean),
  ));
}

function ensureAgentConfig(settings, agentId, allSkillIds) {
  const current = settings.agentConfigs?.[agentId] ?? {};
  settings.agentConfigs = {
    ...settings.agentConfigs,
    [agentId]: {
      ...current,
      id: agentId,
      name: String(current?.name || agentId),
      emoji: String(current?.emoji || ""),
      personality: String(current?.personality || ""),
      model: String(current?.model || ""),
      providerId: String(current?.providerId || ""),
      skills: allSkillIds,
    },
  };
  return settings.agentConfigs[agentId];
}

function buildAgentSkillDocumentPayload(catalog, agentId) {
  return {
    agentId,
    updatedAt: new Date().toISOString(),
    totalSkills: catalog.length,
    skills: catalog.map((skill) => {
      const zh = skill?.locales?.["zh-CN"] ?? skill?.locales?.en ?? {};
      return {
        id: skill.id,
        category: skill.category,
        sourceType: skill.sourceType,
        sourceLabel: skill.sourceLabel,
        recommended: Array.isArray(skill?.recommendedAgents) && skill.recommendedAgents.includes(agentId),
        tags: Array.isArray(skill?.tags) ? skill.tags : [],
        name: zh.name || skill.id,
        short: zh.short || "",
        description: zh.description || "",
        dispatch: zh.dispatch || "",
        outputs: zh.outputs || "",
      };
    }),
  };
}

async function writeAgentSkillDocument(repoRoot, agentId, payload) {
  const directoryPath = path.join(repoRoot, AGENT_SKILL_DOCUMENTS_DIR);
  await fs.mkdir(directoryPath, { recursive: true });
  const filePath = path.join(directoryPath, `${agentId}.json`);
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return filePath;
}

function selectTaskMatchedSkills(catalog, task, agentId, limit = 4) {
  return catalog
    .map(skill => ({ skill, score: scoreSkill(skill, task, agentId) }))
    .filter(item => item.score >= 4)
    .sort((left, right) => right.score - left.score || left.skill.id.localeCompare(right.skill.id))
    .slice(0, limit)
    .map(item => item.skill.id);
}

function runNodeScript(repoRoot, relativeScriptPath, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(repoRoot, relativeScriptPath), ...args], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => {
      stdout += String(chunk || "");
    });
    child.stderr.on("data", chunk => {
      stderr += String(chunk || "");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(stderr.trim() || stdout.trim() || `script exited with code ${code}`));
    });
  });
}

export async function autoProvisionAgentSkills({
  repoRoot,
  settings,
  agentId,
  task,
}) {
  const catalog = await loadSkillCatalog(repoRoot);
  const allSkillIds = listCatalogSkillIds(catalog);
  ensureAgentConfig(settings, agentId, allSkillIds);
  const matchedSkillIds = selectTaskMatchedSkills(catalog, task, agentId);

  if (!settings?.skillProvisioning?.enabled && settings?.skillProvisioning?.enabled !== undefined) {
    return {
      matchedSkillIds,
      createdSkillIds: [],
      skillPrompt: buildSkillPrompt(catalog, matchedSkillIds),
    };
  }
  let createdSkillIds = [];

  if (matchedSkillIds.length === 0 && shouldAutoCreateSkill(task) && settings?.skillProvisioning?.autoCreateLocalSkills !== false) {
    const inferredId = inferSkillId(task);
    const alreadyExists = catalog.some(skill => skill.id === inferredId);
    if (!alreadyExists) {
      await runNodeScript(repoRoot, CREATE_SKILL_SCRIPT, [
        "--id", inferredId,
        "--name", inferSkillName(task),
        "--category", inferSkillCategory(task),
        "--icon", inferSkillIcon(task),
        "--accent", inferSkillAccent(task),
        "--description", `Auto-provisioned from task: ${String(task || "").slice(0, 90)}`,
        "--dispatch", "当现有技能覆盖不足时自动装配，并优先服务当前任务的执行。",
        "--typicalTasks", String(task || "").slice(0, 120),
        "--outputs", "新的本地技能说明、执行流程提示和目录同步结果。",
        "--sourceLabel", "Auto Provisioned Skill",
        "--recommendedAgents", agentId,
      ]);
      await runNodeScript(repoRoot, SYNC_SKILLS_SCRIPT, []);
      createdSkillIds = [inferredId];
    } else {
      createdSkillIds = [inferredId];
    }
  }

  const refreshedCatalog = createdSkillIds.length > 0 ? await loadSkillCatalog(repoRoot) : catalog;
  const refreshedAllSkillIds = listCatalogSkillIds(refreshedCatalog);
  ensureAgentConfig(settings, agentId, refreshedAllSkillIds);
  const nextMatchedSkillIds = createdSkillIds.length > 0
    ? createdSkillIds
    : (matchedSkillIds.length > 0 ? matchedSkillIds : selectTaskMatchedSkills(refreshedCatalog, task, agentId));

  return {
    matchedSkillIds: nextMatchedSkillIds,
    createdSkillIds,
    skillPrompt: buildSkillPrompt(refreshedCatalog, nextMatchedSkillIds),
  };
}

export async function buildAgentSkillPrompt({ repoRoot, settings, agentId, task = "" }) {
  const catalog = await loadSkillCatalog(repoRoot);
  const skillIds = selectTaskMatchedSkills(catalog, task, agentId);
  return buildSkillPrompt(catalog, skillIds);
}

export async function syncAgentSkillDocuments({ repoRoot, settings, catalog: providedCatalog = null }) {
  const catalog = Array.isArray(providedCatalog) ? providedCatalog : await loadSkillCatalog(repoRoot);
  const allSkillIds = listCatalogSkillIds(catalog);
  const previousSnapshot = JSON.stringify(
    AGENT_IDS.map(agentId => settings?.agentConfigs?.[agentId]?.skills ?? []),
  );

  const documents = {};
  for (const agentId of AGENT_IDS) {
    ensureAgentConfig(settings, agentId, allSkillIds);
    documents[agentId] = await writeAgentSkillDocument(
      repoRoot,
      agentId,
      buildAgentSkillDocumentPayload(catalog, agentId),
    );
  }

  const nextSnapshot = JSON.stringify(
    AGENT_IDS.map(agentId => settings?.agentConfigs?.[agentId]?.skills ?? []),
  );

  return {
    changed: previousSnapshot !== nextSnapshot,
    allSkillIds,
    documents,
  };
}
