import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const nextBin = resolve(repoRoot, "node_modules/next/dist/bin/next");
const nextRoot = resolve(repoRoot, ".next");
const maxAttempts = 2;

function runNextBuild() {
  return spawnSync(process.execPath, [nextBin, "build"], {
    cwd: repoRoot,
    env: process.env,
    encoding: "utf8",
  });
}

function shouldRetryBuild(result) {
  const combinedOutput = `${result.stdout || ""}\n${result.stderr || ""}`;
  return (
    /ENOENT: no such file or directory, rename .*\.next[\\/](?:export|server|cache)[\\/].*/i.test(combinedOutput)
    || /ENOTEMPTY: directory not empty, rmdir .*\.next[\\/](?:export|cache)/i.test(combinedOutput)
  );
}

async function resetNextArtifacts() {
  if (existsSync(nextRoot)) {
    await rm(nextRoot, { recursive: true, force: true });
  }
}

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  const result = runNextBuild();
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.status === 0) {
    process.exit(0);
  }

  if (attempt < maxAttempts && shouldRetryBuild(result)) {
    console.warn(`[build-next] 检测到 Windows 下 .next/500.html 重命名偶发问题，准备清理产物后重试 (${attempt}/${maxAttempts})...`);
    await resetNextArtifacts();
    continue;
  }

  process.exit(typeof result.status === "number" ? result.status : 1);
}
