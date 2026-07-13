# DHP Claude Code Start Package

This package is optimized for starting development of **D Hospitality Platform MVP** in Claude Code.

## What this package is for

Use it to start development of:

- PMS Core;
- Booking Core;
- Availability Engine;
- Rate Calculation Engine;
- Channel Manager MVP.

It is intentionally scoped. It does not ask Claude Code to build the whole enterprise platform at once.

## How to use

1. Create an empty Git repository.
2. Copy all files from this package into the repo root.
3. Start Claude Code in the repo root.
4. Ask Claude Code to read `CLAUDE.md`.
5. Then paste the first prompt from:

```text
prompts/001_sprint_1_foundation.md
```

## Recommended first instruction to Claude Code

```text
Read CLAUDE.md and prompts/001_sprint_1_foundation.md. Start Sprint 1 only.
```

## Important files

- `CLAUDE.md` — primary Claude Code instruction file.
- `planning/DEVELOPMENT_PLAN.md` — sprint plan.
- `planning/TASKS.md` — detailed backlog.
- `planning/DECISIONS.md` — architecture decisions.
- `planning/DEFINITION_OF_DONE.md` — completion checklist.
- `docs/` — selected PMS and Channel Manager specs.
- `prompts/` — ready-to-paste prompts by sprint.
- `openapi/dhp-mvp.openapi.yaml` — starter OpenAPI skeleton.
- `database/schema-notes.md` — database guidance.

## Important rule

Do not ask Claude Code to “build PMS and Channel Manager” in one prompt.

Start with Sprint 1. Then move step by step.
