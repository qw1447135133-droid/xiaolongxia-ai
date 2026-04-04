# Hermes Dispatch Prototype

This prototype treats Hermes as the planner and uses `codex`, `claude`, and `gemini` as external executors.

## Files

- `prototypes/hermes-dispatch/run.mjs`: CLI entrypoint.
- `prototypes/hermes-dispatch/config.example.json`: JSON config override example.
- `prototypes/hermes-dispatch/sample-plan.json`: Manual plan for testing without Hermes.

## Expected Flow

1. Hermes receives the top-level request and returns a JSON plan.
2. The dispatcher validates task ids, dependencies, executors, and working directories.
3. Each task is dispatched to `codex`, `claude`, or `gemini` using non-interactive CLI mode.
4. Task prompts, stdout, stderr, and summaries are persisted under `output/hermes-dispatch/<timestamp>/`.

## Commands

Generate a Hermes plan and execute it:

```bash
node prototypes/hermes-dispatch/run.mjs "为当前仓库设计一个多代理调度 MVP"
```

Only generate the plan:

```bash
node prototypes/hermes-dispatch/run.mjs --plan-only "把任务拆给 codex、claude、gemini"
```

Execute a manual plan file without Hermes:

```bash
node prototypes/hermes-dispatch/run.mjs --plan-file prototypes/hermes-dispatch/sample-plan.json
```

Use a config override:

```bash
node prototypes/hermes-dispatch/run.mjs --config prototypes/hermes-dispatch/config.example.json "你的任务"
```

## Current Limits

- The planner defaults to `hermes chat -q`, so Hermes must be installed and available in `PATH`.
- `gemini` is invoked in plain `-p` mode because JSON output and write-capable non-interactive flows vary across versions.
- Parallel execution is disabled by default because the current prototype assumes a shared repo working tree.
- There is no automatic git worktree isolation yet.
