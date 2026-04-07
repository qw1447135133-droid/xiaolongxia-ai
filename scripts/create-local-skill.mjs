import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKILLS_DIR = path.join(ROOT, "skills");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const id = normalizeId(args.id || args.name);
  if (!id) {
    throw new Error("Usage: npm run skills:create -- --id my-skill --name \"My Skill\" --category automation");
  }

  const name = args.name || id;
  const folder = path.join(SKILLS_DIR, id);
  await fs.mkdir(folder, { recursive: false });

  const skillJson = {
    id,
    order: Number(args.order || 999),
    category: args.category || "automation",
    sourceType: args.sourceType || "local",
    sourceLabel: args.sourceLabel || "Local Skill",
    accent: args.accent || "#38bdf8",
    icon: args.icon || "spark",
    tags: args.tags ? args.tags.split(",").map(item => item.trim()).filter(Boolean) : [],
    recommendedAgents: args.recommendedAgents
      ? args.recommendedAgents.split(",").map(item => item.trim()).filter(Boolean)
      : [],
    locales: {
      "zh-CN": buildLocalePayload(args, name),
      "zh-TW": buildLocalePayload(args, name),
      en: buildLocalePayload(args, name),
      ja: buildLocalePayload(args, name),
    },
  };

  const markdown = `---\nname: ${name}\ndescription: ${args.description || `${name} skill`}\n---\n\n# ${name}\n\n## Trigger\n\n- Add the concrete trigger conditions for this skill.\n\n## Typical Work\n\n- Describe the main workflow.\n\n## Outputs\n\n- Describe the expected outputs and artifacts.\n`;

  await fs.writeFile(path.join(folder, "skill.json"), `${JSON.stringify(skillJson, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(folder, "SKILL.md"), markdown, "utf8");

  console.log(`Created skill scaffold at ${path.relative(ROOT, folder)}`);
  console.log("Run `npm run skills:sync` to refresh the in-app catalog.");
}

function buildLocalePayload(args, name) {
  const short = args.short || `${name} capability`;
  const description = args.description || `${name} skill`;
  return {
    name,
    short,
    description,
    dispatch: args.dispatch || "Describe how the dispatcher should pick this skill.",
    typicalTasks: args.typicalTasks || "List the common tasks for this skill.",
    outputs: args.outputs || "List the outputs produced by this skill.",
  };
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[index + 1] : "true";
    result[key] = value;
    if (value !== "true") index += 1;
  }
  return result;
}

function normalizeId(value) {
  if (!value) return "";
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
