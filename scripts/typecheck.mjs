import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const nextTypesEntry = resolve(repoRoot, ".next/types/app/layout.ts");
const nextBin = resolve(repoRoot, "node_modules/next/dist/bin/next");
const tscBin = resolve(repoRoot, "node_modules/typescript/bin/tsc");
const tsconfigPath = resolve(repoRoot, "tsconfig.json");

function runNodeScript(scriptPath, args = []) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
  });
  if (typeof result.status === "number") {
    return result.status;
  }
  return 1;
}

function shouldEnsureNextTypes() {
  if (!existsSync(tsconfigPath)) return false;
  try {
    const raw = readFileSync(tsconfigPath, "utf8");
    const parsed = JSON.parse(raw);
    const includes = Array.isArray(parsed?.include) ? parsed.include.map((item) => String(item)) : [];
    return includes.includes(".next/types/**/*.ts");
  } catch {
    return false;
  }
}

const ensureNextTypes = shouldEnsureNextTypes() && process.env.TYPECHECK_SKIP_BUILD !== "1";

if (ensureNextTypes) {
  console.log(
    existsSync(nextTypesEntry)
      ? "[typecheck] 先执行 next build，确保 .next/types 与当前 app 路由保持一致..."
      : "[typecheck] .next/types 缺失，先执行 next build 生成类型产物...",
  );
  const buildStatus = runNodeScript(nextBin, ["build"]);
  if (buildStatus !== 0) {
    process.exit(buildStatus);
  }
}

console.log("[typecheck] 开始执行 TypeScript 检查...");
const typecheckStatus = runNodeScript(tscBin, ["--noEmit"]);
process.exit(typecheckStatus);
