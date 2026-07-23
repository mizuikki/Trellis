# Design - Sync upstream to v0.6.8

## Boundary

This task selectively imports the Kimi Code platform behavior introduced by
upstream commit `bfa7f99d` and records the evaluated upstream `v0.6.8` release
boundary at `dc68f5a9`.

The import covers the TypeScript platform registry and configurator, Kimi
templates, CLI selection, generated Python runtime integration, workflow
classification, platform documentation, and regression coverage. It does not
merge tag `v0.6.8` or import upstream package versions, release manifests,
publish automation, the docs-site gitlink, or the Marketplace gitlink.
`README_CN.md` remains deleted. Package names remain under `@mizuikki` and
both packages remain versioned `1.0.0`.

## Platform Registration and Template Flow

Kimi is registered as an agent-capable, pull-based platform with config root
`.kimi-code`, no project-level hooks, and shared Agent Skills support.

```text
trellis init --kimi
  -> InitOptions.kimi and AI_TOOLS.kimi
  -> configureKimi()
  -> neutral workflow/bundled skills in .agents/skills/
  -> Kimi commands and role prompts in .kimi-code/skills/
  -> the same collected paths enter template hash tracking
```

The session-boundary commands are rendered as Kimi skills named
`trellis-start`, `trellis-continue`, and `trellis-finish-work`. Kimi role
instructions for implement, check, and research are also installed as skills.
Implement/check receive the existing pull-based context prelude; research
remains standalone. All files written to `.agents/skills/` use the neutral
resolver so Kimi, Codex, Gemini, and Pi cannot produce last-writer-wins
differences.

The Kimi template collector and configurator must produce byte-identical
content for every managed path. The existing shared configurator helpers are
sufficient; no new generic abstraction is introduced.

## Runtime and Workflow Contracts

The generated Python runtime adds `kimi` everywhere an agent-capable platform
is explicitly enumerated: active-task platform recognition, task-context
manifest seeding, configuration-directory detection, command/skill paths,
CLI executable naming, run/resume commands, and adapter validation. Live
dogfood Python files under `.trellis/scripts/` remain byte-identical to their
canonical template twins.

Current official Kimi behavior defines these command contracts:

- Non-interactive run: `kimi -p <prompt>`. Prompt mode already applies the
  automatic permission policy and cannot be combined with `--yolo`.
- Resume by ID: `kimi --session <session-id>`.
- Manual skill invocation prefix: `/skill:trellis-`.
- Project skill roots: `.kimi-code/skills/` and `.agents/skills/`.
- Built-in sub-agents: `coder`, `explore`, and `plan`.

The workflow template and live dogfood workflow add Kimi to pull-based
sub-agent dispatch marker blocks without replacing the fork's current Trellis
planning and lifecycle wording. Canonical and live workflow files must remain
byte-identical after the edit.

## Provenance and Generated Copies

`UPSTREAM_SYNC.md` records that `v0.6.8` was evaluated and that Kimi support
from `bfa7f99d` was accepted with the corrected current CLI invocation. It also
records that the version, release manifest, publish workflow, docs-site, and
Marketplace gitlink changes were excluded or already satisfied.

Where upstream changed generated `trellis-meta` copies, the canonical bundled
template remains authoritative. Kimi-specific wording is added there first and
then synchronized only to the dogfood platform copies that the repository
tracks. The vendored Marketplace contents and provenance remain unchanged.

## Risks, Compatibility, and Failure Modes

- Copying the upstream `kimi -p <prompt> --yolo` command would fail against
  the current Kimi CLI because those flags are mutually exclusive. Use the
  documented prompt-only form and assert the exact argument list.
- Platform registry changes can silently omit a parallel Python enumeration.
  Explicit regression coverage and live/template twin comparisons guard this.
- Shared `.agents/skills/` output can churn by platform if rendered with a
  platform-specific command prefix. Kimi must use neutral shared resolution.
- Blind conflict resolution could restore fork-incompatible versions,
  publishing, submodules, or stale workflow contracts. Validate these
  invariants directly after the selective import.
- If the adapted import proves unsafe, the entire task commit can be reverted;
  no consumer migration, version bump, or repository topology change is part
  of this task.

## Test Strategy

Focused tests cover Kimi registry metadata, platform detection, init/update
output, Kimi template structure, neutral shared-skill parity, Python adapter
commands, and workflow/template parity. The final gate runs lint, type-check,
build, and the complete test suite. Structural checks verify package identity,
deleted publish/docs-site surfaces, the vendored Marketplace, provenance, and
the absence of conflict markers or temporary merge paths.
