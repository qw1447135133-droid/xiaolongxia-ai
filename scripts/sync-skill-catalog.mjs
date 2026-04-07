import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKILLS_DIR = path.join(ROOT, "skills");
const OUTPUT_DIR = path.join(ROOT, "src", "generated");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "skills-catalog.json");
const REQUIRED_LOCALES = ["zh-CN", "zh-TW", "en", "ja"];
const REQUIRED_TEXT_FIELDS = ["name", "short", "description", "dispatch", "typicalTasks", "outputs"];

async function main() {
  const skills = await loadSkills();
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(skills, null, 2)}\n`, "utf8");
  console.log(`Synced ${skills.length} skills -> ${path.relative(ROOT, OUTPUT_FILE)}`);
}

async function loadSkills() {
  try {
    const entries = await fs.readdir(SKILLS_DIR, { withFileTypes: true });
    const directories = entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
    const skills = [];

    for (const directory of directories) {
      const skill = await loadSingleSkill(directory);
      skills.push(skill);
    }

    return skills.sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999) || a.id.localeCompare(b.id));
  } catch (error) {
    if (isNotFound(error)) return [];
    throw error;
  }
}

async function loadSingleSkill(directory) {
  const folder = path.join(SKILLS_DIR, directory);
  const skillMetaPath = path.join(folder, "skill.json");
  const skillMarkdownPath = path.join(folder, "SKILL.md");
  const [metaRaw, markdownRaw] = await Promise.all([
    fs.readFile(skillMetaPath, "utf8"),
    fs.readFile(skillMarkdownPath, "utf8"),
  ]);

  const meta = JSON.parse(metaRaw);
  const frontmatter = parseFrontmatter(markdownRaw);
  const id = typeof meta.id === "string" && meta.id.trim() ? meta.id.trim() : directory;
  const locales = normalizeLocales(meta.locales ?? {}, frontmatter);

  const skill = {
    id,
    order: typeof meta.order === "number" ? meta.order : 9999,
    category: normalizeString(meta.category, "automation"),
    sourceType: normalizeString(meta.sourceType, "local"),
    sourceLabel: normalizeString(meta.sourceLabel, frontmatter.name || directory),
    accent: normalizeString(meta.accent, "#94a3b8"),
    icon: normalizeString(meta.icon, "spark"),
    tags: Array.isArray(meta.tags) ? meta.tags.map(item => String(item).trim()).filter(Boolean) : [],
    recommendedAgents: Array.isArray(meta.recommendedAgents)
      ? meta.recommendedAgents.map(item => String(item).trim()).filter(Boolean)
      : [],
    sourceUrl: typeof meta.sourceUrl === "string" && meta.sourceUrl.trim() ? meta.sourceUrl.trim() : undefined,
    locales,
  };

  validateSkill(skill, folder);
  return skill;
}

function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return {};

  const result = {};
  for (const line of match[1].split("\n")) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) continue;
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, "");
    if (key) result[key] = value;
  }
  return result;
}

function normalizeLocales(rawLocales, frontmatter) {
  const base = rawLocales["zh-CN"] ?? {};
  const descriptionFallback = typeof frontmatter.description === "string" ? frontmatter.description.trim() : "";
  const nameFallback = typeof frontmatter.name === "string" ? frontmatter.name.trim() : "";
  const normalized = {};

  for (const locale of REQUIRED_LOCALES) {
    const raw = rawLocales[locale] ?? {};
    normalized[locale] = {};
    for (const field of REQUIRED_TEXT_FIELDS) {
      const value = raw[field] ?? base[field] ?? (field === "name" ? nameFallback : descriptionFallback);
      normalized[locale][field] = String(value ?? "").trim();
    }
  }

  return normalized;
}

function validateSkill(skill, folder) {
  if (!skill.id) {
    throw new Error(`Skill in ${folder} is missing id.`);
  }

  for (const locale of REQUIRED_LOCALES) {
    const localePayload = skill.locales?.[locale];
    if (!localePayload) {
      throw new Error(`Skill ${skill.id} is missing locale ${locale}.`);
    }
    for (const field of REQUIRED_TEXT_FIELDS) {
      if (!localePayload[field]) {
        throw new Error(`Skill ${skill.id} is missing ${locale}.${field}.`);
      }
    }
  }
}

function normalizeString(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function isNotFound(error) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
