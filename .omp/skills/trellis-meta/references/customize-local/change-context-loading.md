# Change Local Context Loading

Context loading determines when AI reads workflow, task, spec, research, workspace, and git status. Read this page when the user says "AI does not know the current task," "the agent did not read specs," or "there is too much/too little context."

## Read These Files First

1. `.trellis/workflow.md`
2. `.trellis/scripts/get_context.py`
3. `.trellis/scripts/common/session_context.py`
4. `.trellis/scripts/common/task_context.py`
5. `.trellis/scripts/common/active_task.py`
6. Current platform hooks or agent files
7. The current task's `implement.jsonl` / `check.jsonl`

## Context Sources

| Source | Purpose |
| --- | --- |
| `.trellis/workflow.md` | Workflow and next-action hints. |
| `.trellis/tasks/<task>/prd.md` | Current task requirements. |
| `.trellis/tasks/<task>/design.md` | Complex task technical design. |
| `.trellis/tasks/<task>/implement.md` | Complex task execution plan. |
| `.trellis/tasks/<task>/implement.jsonl` | Candidate spec/research index for reason-based implementation reads. |
| `.trellis/tasks/<task>/check.jsonl` | Candidate spec/research index for reason-based checking reads. |
| `.trellis/spec/` | Project specs. |
| `.trellis/workspace/` | Session records. |
| git status | Current working tree changes. |

## Common Needs And Edit Points

| Need | Edit point |
| --- | --- |
| Inject more/less information in new sessions | `session_context.py` or the platform `session-start` hook. |
| Change hints on each user input | `[workflow-state:STATUS]` block in `.trellis/workflow.md`. The `inject-workflow-state` hook is parser-only and reads the block verbatim. |
| Agent did not read specs | Task JSONL, agent prelude, `inject-subagent-context` hook. |
| Active task is lost | `active_task.py` and platform session identity propagation. |
| Change JSONL validation rules | `task_context.py`. |

## JSONL Rules

`implement.jsonl` / `check.jsonl` are the key context loading interface:

```jsonl
{"file": ".trellis/spec/backend/index.md", "reason": "Backend conventions"}
{"file": ".trellis/tasks/04-28-x/research/api.md", "reason": "API research"}
```

Include only spec/research files. Do not put code files that will be modified into these manifests; agents read code files themselves during implementation.

## Change Session Context

If the user wants every new session to see more project state, edit:

- `.trellis/scripts/common/session_context.py`
- the corresponding platform `session-start` hook

Context cannot grow without bound. Prefer injecting indexes and paths so the AI can read detailed files on demand.

## Change Sub-Agent Context

First determine which mode the platform uses:

- hook push: edit the `inject-subagent-context` hook.
- agent pull: edit the read steps in the corresponding `trellis-implement` / `trellis-check` agent file.

In both modes, make sure the agent ultimately reads:

1. active task
2. the corresponding JSONL as a candidate index
3. relevant spec/research selected by each entry's reason, using targeted or ranged reads for large sources
4. `prd.md`
5. `design.md` if present
6. `implement.md` if present

For eager hook/plugin modes, preserve the default bounds: 128 KiB aggregate task context, 64 KiB per task artifact, 32 KiB per rendered manifest index, 256 KiB per manifest source read, and 256 rendered entries. Referenced source bodies must remain on disk until selected on demand.

## Troubleshooting Order

```bash
python3 ./.trellis/scripts/task.py current --source
python3 ./.trellis/scripts/task.py list-context <task>
python3 ./.trellis/scripts/task.py validate <task>
python3 ./.trellis/scripts/get_context.py --mode packages
```

Confirm the task and JSONL are correct before editing hooks/agents.
