# Hermes Dispatch Prototype

This prototype treats Hermes as the orchestration role, but uses a dedicated `codex` planning session as the planner brain and `codex`, `claude`, and `gemini` as external executors.

## Files

- `prototypes/hermes-dispatch/run.mjs`: CLI entrypoint.
- `prototypes/hermes-dispatch/config.example.json`: JSON config override example.
- `prototypes/hermes-dispatch/sample-plan.json`: Manual plan for testing without Hermes.

## Expected Flow

1. A dedicated Codex planner session receives the top-level request and returns a JSON plan.
2. The dispatcher validates task ids, dependencies, executors, and working directories.
3. Each task is dispatched to `codex`, `claude`, or `gemini` using non-interactive CLI mode.
4. Task prompts, stdout, stderr, and summaries are persisted under `output/hermes-dispatch/<timestamp>/`.
5. The dedicated Codex planner conversation is persisted in `output/hermes-dispatch/planner-sessions/default.json`, so later planner runs can resume the same planning context.
6. If you provide a different `planner.profileId` and `planner.sessionStateFile`, you can maintain multiple isolated Codex planner brains in parallel.
7. Planner and executor models can be overridden per profile via `planner.model` and `executors.<name>.model`.

## Default Routing

- `codex`: backend work, server logic, APIs, data flow, and engineering implementation.
- `gemini`: frontend work, UI, interaction, pages, and presentation polish.
- `claude`: code gap-filling, review, fallback fixes, edge-case checks, and doc completion.
- If a request includes both backend and frontend, the planner should prefer splitting it into `codex` for backend, `gemini` for frontend, and `claude` for gap-filling and review.
- During plan normalization, obviously mismatched tasks are also reassigned back to this fixed routing, so manual plan files do not easily drift away from the same backend/frontend/review split.

## Parallel Dispatch

- The planner can now attach `writeTargets` to each task to declare the files or folders it expects to modify.
- Hermes will run ready tasks in parallel only when their `writeTargets` do not overlap.
- If a task omits `writeTargets`, Hermes falls back to conservative behavior and treats same-workdir tasks as conflicting.
- Tasks can also carry `canUseSubagents: true` so the target executor is explicitly allowed to use its own internal subagents or worker delegation when the runtime supports it.

## Run Control

- Each run now writes a `control.json` file alongside `plan.json`, `progress.json`, and `results.json`.
- The runtime supports `cancel-run` for the whole dispatch and `stop-task` for a currently running executor task.
- When a task is stopped, Hermes marks that task as `cancelled` and automatically cancels downstream tasks that depend on it, avoiding scheduler deadlocks.
- `progress.json` now exposes `runStatus` plus task-level `cancelled` states so the VS Code workbench can render live stop/cancel feedback.

## Commands

Generate a Codex-brain plan and execute it:

```bash
node prototypes/hermes-dispatch/run.mjs "为当前仓库设计一个多代理调度 MVP"
```

Only generate the plan:

```bash
node prototypes/hermes-dispatch/run.mjs --plan-only "把任务拆给 codex、claude、gemini"
```

Execute a manual plan file without the planner:

```bash
node prototypes/hermes-dispatch/run.mjs --plan-file prototypes/hermes-dispatch/sample-plan.json
```

Use a config override:

```bash
node prototypes/hermes-dispatch/run.mjs --config prototypes/hermes-dispatch/config.example.json "你的任务"
```

## Current Limits

- The planner defaults to `codex exec --full-auto --skip-git-repo-check`, so `codex` must be installed and available in `PATH`.
- Planner session reuse depends on the local Codex CLI session store plus the configured `planner.sessionStateFile` such as `output/hermes-dispatch/planner-sessions/default.json`.
- Multiple planner slots are supported by pointing each slot at its own `planner.sessionStateFile`, such as `output/hermes-dispatch/planner-sessions/research.json`.
- `codex` and `claude` models are passed as CLI `--model`; `gemini` model is injected per run via `GEMINI_MODEL`.
- `gemini` is invoked in plain `-p` mode because JSON output and write-capable non-interactive flows vary across versions.
- Parallel execution is disabled by default because the current prototype assumes a shared repo working tree.
- There is no automatic git worktree isolation yet.
