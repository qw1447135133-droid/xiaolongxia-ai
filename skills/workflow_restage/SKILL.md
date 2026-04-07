---
name: workflow_restage
description: Restage failed, blocked, or manually taken-over runs into resumable workflows or chat handoff tasks.
---

# Workflow Restage

## Trigger

- Use when a run needs to resume after failure, approval, or manual takeover.

## Typical Work

- Rebuild the working context from the interruption point.
- Turn it into the next resumable workflow or chat step.

## Outputs

- Resume context, next-step instructions, and retry guidance.
