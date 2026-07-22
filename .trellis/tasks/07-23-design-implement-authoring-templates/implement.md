# Implement — design.md / implement.md Authoring Guidance

> Planning docs under `tmp/` only — not a formal Trellis task.

## Ordered Checklist

### Phase 0 — Lock contract

- [x] 0.1 Adopt Core/Triggered/Optional authoring semantics with same-repository vendored Marketplace ownership; create does not seed design/implement.
- [x] 0.2 Semantic IDs (`D-BOUND` … `I-EXIT`) are **product-internal vocabulary and test labels only** — not runtime schema; not required permanently in user task files.
- [x] 0.3 Product CLI is only `task.py scaffold <task> design|implement|all`. **No** `create --complex`.
- [x] 0.4 Dual-layer: `task.py start` is the machine state-transition hard gate for every present design/implement artifact; SessionStart provides matching deterministic diagnostics; agent/workflow guidance classifies lightweight vs complex and applies artifact/jsonl requirements. Runtime does not infer complexity or parse Semantic IDs, headings, or prose.
- [x] 0.5 Exact lifecycle token is `<!-- trellis:scaffold-unfilled -->`; every canonical scaffold contains it exactly once and `task.py start` rejects it.
- [x] 0.6 Scaffold writes only to a validated non-symlink live direct child of `.trellis/tasks/` containing non-symlink regular UTF-8/parseable object `task.json` with non-empty string `title`; reject malformed metadata and archive/outside/nested/symlink escapes before writes.
- [x] 0.7 Never overwrite existing paths; regular files (including empty) are `skipped_exists`, non-regular types are hard errors; exclusive create; deterministic per-target results and final exit code for `all`.
- [x] 0.8 `common/task_artifacts.py` is the only scaffold-body source and owns the artifact lifecycle; brainstorm invokes the CLI and contains rubric only.
- [x] 0.9 Product surface English-only; no Chinese section catalogs in shipped scaffold/guidance.
- [x] 0.10 jsonl curated semantics unchanged; D-RISK/I-ROLL and D-TEST/I-VAL split per design §3.8.
- [x] 0.11 I-LOG / I-MULTI stay out of global default skeleton; triggered D-FLOW/D-CONTRACT cannot be omitted when applicable.
- [x] 0.12 Marketplace-merge prerequisite completed in `d01aee69`: normal tracked `marketplace/`, provenance pinned to upstream `758398b89e159f4b6658383dd26c484da423ba93`, fork-owned registry URLs, no Marketplace submodule entry, and no release exclusion.
- [x] 0.13 Use a dedicated typed `common/task_artifacts.py` deep module instead of expanding the existing 882-line `task_store.py`; keep `task_store.py` responsible for task CRUD and default `prd.md` only.
- [x] 0.14 Shipped command guidance uses `{{PYTHON_CMD}}`; concurrency guarantees cover exclusive target-file creation under a stable parent-directory assumption, with task-directory revalidation before each target create.

### Phase 1 — Helper and CLI (MVP)

- [x] 1.1 Add `common/task_artifacts.py` with typed `ArtifactKind`, readiness/result records, and `_default_design_content` / `_default_implement_content` as the only canonical scaffold-body definitions; each body emits the exact sentinel once plus optional ID comments.
- [x] 1.2 Implement `cmd_scaffold` through the artifact module: `scaffold <task> design|implement|all`; keep `task.py` as parser/dispatch.
- [x] 1.3 Add the scaffold-specific live-task resolver to `task_artifacts.py`: exact direct-child name first, then collect a unique suffix match (never first-match wins), or resolve a supplied path; require the safe boundary plus valid task metadata/title contract without changing the legacy resolver semantics used by other commands.
- [x] 1.4 Snapshot and revalidate the same non-symlink resolved task directory before each target operation, then exclusive-create the target in one operation; existing regular file (including empty) → `skipped_exists`; directory/symlink/other non-regular type → `error_invalid_target`; never truncate, follow, or replace. Document the stable-parent-directory assumption for the final syscall window.
- [x] 1.5 After task validation, print one filename result per target; successes to stdout, errors to stderr. `all` processes `design.md` then `implement.md` and attempts both even after a first-target error. Return 0 iff all results are `created|skipped_exists`, 1 for task/per-target failures, and argparse's 2 for syntax errors.
- [x] 1.6 Add reusable artifact-readiness detection to `task_artifacts.py`: any present design/implement path must be non-symlink regular, UTF-8 readable, non-whitespace, and free of the exact standalone sentinel in its first five physical lines; no whole-body search, body hash, heading check, or Semantic-ID parsing.
- [x] 1.7 Register `task.py` usage/import/parser/dispatch/help; skeleton is a prompt, sentinel must remain until Core review passes.
- [x] 1.8 Update `cmd_start` to reject any present invalid/empty/sentinel-bearing `design.md` / `implement.md` before status, hook, or active-pointer mutation.
- [x] 1.9 Do **not** implement `create --complex`.

### Phase 2 — Skill, workflow, and dual-layer wording

- [x] 2.1 brainstorm (all exact consumers/mirrors in matrix): Core/Triggered/Optional tables, anti-fill, archetype tips, D/I boundaries, UI DESIGN.md ≠ tech design.md; invoke `{{PYTHON_CMD}} ./.trellis/scripts/task.py scaffold <task> all` for missing complex artifacts rather than embedding/writing duplicate skeleton bytes.
- [x] 2.2 Authoring rubric: reject invalid/empty/header-sentinel artifacts as planning-ready; remove each sentinel only after that artifact's Core/triggered semantics pass review; no H2-name lint.
- [x] 2.3 workflow.md: lightweight vs complex; dual-layer readiness wording; jsonl ≠ implement; short; English.
- [x] 2.4 Shared/Codex/Copilot session-start, OpenCode session-utils, continue/start guidance, and tracked dogfood outputs: detect invalid/empty/header-sentinel artifacts and route to “scaffold/artifact present but not ready; fill and review Core”; never call them complete.
- [x] 2.5 Apply the exact **Source → consumer → tracked output** matrix below; Marketplace workflow changes are committed in this repository.

### Phase 3 — Tests

- [x] 3.1 create → no design/implement.
- [x] 3.2 scaffold with explicit task → English skeleton + exact stdout result; second call reports `skipped_exists`; original bytes unchanged.
- [x] 3.3 missing CLI argument → exit 2; unknown/ambiguous/invalid-boundary/malformed-task-json/missing-title task → exit 1 + stderr; no target writes.
- [x] 3.4 `all` with one file present, one missing → creates missing only; reports both.
- [x] 3.5 existing **empty** file is not overwritten.
- [x] 3.6 existing directory/symlink/other non-regular target is not followed/replaced and returns `error_invalid_target`; outside/archive/nested/symlink-escape task paths fail before writes.
- [x] 3.7 concurrent/exclusive create: no silent clobber; loser reports `skipped_exists` only for a resulting regular file, otherwise `error_invalid_target`.
- [x] 3.8 `all` continues after one per-target hard error, emits one result for both targets on the defined stream, and returns 1.
- [x] 3.9 canonical bodies contain the sentinel exactly once below the title; `task.py start` rejects invalid/empty/header-sentinel artifacts without status/hook/pointer mutation, ignores later literal mentions, and succeeds for filled regular files after header-marker removal.
- [x] 3.10 shared/Codex/Copilot/OpenCode SessionStart plus continue guidance report artifact-pending for invalid/empty/header-sentinel states and never report them complete.
- [x] 3.11 Semantic-ID parity across rubric consumers; no complete scaffold-body duplicate in brainstorm sources.
- [x] 3.12 Scoped check: **new** scaffold constants + guidance blocks only — no Chinese section catalog (not whole-repo vague grep).
- [x] 3.13 no fixed-H2-set assertions; no permanent user-doc ID requirement tests.
- [x] 3.14 package test / typecheck / lint + **`pnpm --filter @mindfoldhq/trellis lint:py`**.
- [x] 3.15 regression still covers brainstorm triple + workflow jsonl gates where applicable.
- [x] 3.16 configurator/render tests prove scaffold commands become `python` on Windows and `python3` elsewhere; no shipped `python3` literal is introduced in placeholder-capable guidance.
- [x] 3.17 parent-directory revalidation is covered independently from target-file create races; tests do not claim portable protection against an adversarial replacement in the final syscall window.

### Phase 4 — Spec and wrap-up

- [x] 4.1 Update exact `.trellis/spec` paths in the matrix: task artifact semantics, mandatory sentinel/start gate, safe scaffold writes, public CLI signature, and workflow-state wording/status-writer behavior.
- [x] 4.2 Update the exact trellis-meta `task-system.md` and `change-workflow.md` source/dogfood paths in the matrix.
- [x] 4.3 Manual smoke: lightweight create; safe scaffold; start blocked by sentinel; fill/review Core; remove sentinel; empty Optional deleted; start succeeds.
- [x] 4.4 Confirm Marketplace workflow files are normal main-repository changes, not a dirty submodule or pointer update.
- [x] 4.5 Formal product task: check → commit (this `tmp/` set is not the product ship).

## Completed prerequisite evidence

Marketplace vendoring is repository baseline, not authoring-feature implementation scope. Commit `d01aee69` completed it. Recheck these paths for regressions; do not edit or roll them back unless a regression is found:

| Contract | Completed source/consumer paths | Evidence |
|----------|---------------------------------|----------|
| Vendored Marketplace topology and defaults | `.gitmodules`; `.husky/pre-commit`; `.github/workflows/ci.yml`; `marketplace/README.md`; `marketplace/VENDORED_FROM.md`; `marketplace/index.json`; `packages/cli/src/utils/template-fetcher.ts`; `packages/cli/scripts/release.js`; `.claude/commands/trellis/create-manifest.md`; `.codex/skills/create-manifest/SKILL.md`; `.trellis/spec/tech/repo/index.md`; `.trellis/spec/cli/backend/release-process.md`; `.trellis/spec/cli/backend/commands-workflow.md`; `.trellis/spec/docs-site/docs/sync-on-change.md`; `packages/cli/test/utils/template-fetcher.test.ts`; `packages/cli/test/utils/download-with-strategy.test.ts` | No Marketplace gitlink/submodule; pinned provenance; fork-owned defaults; release/pre-commit/CI use same-repository files; focused URL/source tests. `.github/workflows/publish.yml` was reviewed as verification-only and required no change. |

## Active source → consumer → tracked output matrix

Update every path named below when its row applies. A product change may mark a path N/A only by recording the path and reason in the implementation summary; phrases such as “other adapters” or “dogfood copies” are not substitutes for this matrix.

| Contract | Authoritative/product source paths | Other exact product consumers | Tracked outputs | Verification |
|----------|------------------------------------|-------------------------------|-----------------|--------------|
| Canonical artifact lifecycle + CLI | New `packages/cli/src/templates/trellis/scripts/common/task_artifacts.py`; `packages/cli/src/templates/trellis/scripts/task.py`; `packages/cli/src/templates/trellis/index.ts` | `task.py start` and scaffold dispatch import the artifact module; `task_store.py` retains only task CRUD/default PRD ownership | New `.trellis/scripts/common/task_artifacts.py`; `.trellis/scripts/task.py` | Typed result/readiness tests; source/dogfood byte parity; dedicated scaffold integration tests; template registration assertion |
| Brainstorm semantic rubric (not scaffold bytes) | `packages/cli/src/templates/common/skills/brainstorm.md` | `packages/cli/src/templates/codex/skills/brainstorm/SKILL.md`; `packages/cli/src/templates/copilot/prompts/brainstorm.prompt.md` | `.agents/skills/trellis-brainstorm/SKILL.md`; `.claude/skills/trellis-brainstorm/SKILL.md`; `.cursor/skills/trellis-brainstorm/SKILL.md`; `.omp/skills/trellis-brainstorm/SKILL.md`; `.opencode/skills/trellis-brainstorm/SKILL.md`; `.pi/skills/trellis-brainstorm/SKILL.md` | Semantic-ID/rubric parity; assert no full canonical scaffold body in any brainstorm source |
| Native workflow contract | `packages/cli/src/templates/trellis/workflow.md` | `marketplace/workflows/native/workflow.md` (same-repository vendored mirror) | `.trellis/workflow.md` | Existing bundled↔native equality test; source/dogfood parity |
| Alternate workflow contract | `marketplace/workflows/tdd/workflow.md`; `marketplace/workflows/channel-driven-subagent-dispatch/workflow.md` (same-repository files) | None | None | Assert both variants contain the sentinel/readiness contract where they describe planning |
| SessionStart sentinel routing | `packages/cli/src/templates/shared-hooks/session-start.py`; `packages/cli/src/templates/codex/hooks/session-start.py`; `packages/cli/src/templates/copilot/hooks/session-start.py`; `packages/cli/src/templates/opencode/lib/session-utils.js` | `packages/cli/src/templates/opencode/plugins/session-start.js` calls the OpenCode utility; no logic duplication expected | `.claude/hooks/session-start.py`; `.cursor/hooks/session-start.py`; `.codex/hooks/session-start.py`; `.opencode/lib/session-utils.js`; `.opencode/plugins/session-start.js` | Shared/Codex/Copilot/OpenCode routing tests; generated-output parity/normalization tests |
| Continue/start authoring route | `packages/cli/src/templates/common/commands/continue.md`; `packages/cli/src/templates/common/commands/start.md`; `packages/cli/src/templates/codex/skills/start/SKILL.md`; `packages/cli/src/templates/copilot/prompts/start.prompt.md` | None | `.agents/skills/trellis-continue/SKILL.md`; `.claude/commands/trellis/continue.md`; `.cursor/commands/trellis-continue.md`; `.omp/commands/trellis-continue.md`; `.opencode/commands/trellis/continue.md`; `.pi/prompts/trellis-continue.md`; `.agents/skills/trellis-start/SKILL.md` | Render/configurator assertions for sentinel-pending wording |
| Trellis-meta task documentation | `packages/cli/src/templates/common/bundled-skills/trellis-meta/references/local-architecture/task-system.md`; `packages/cli/src/templates/common/bundled-skills/trellis-meta/references/customize-local/change-workflow.md` | None | `.agents/skills/trellis-meta/references/local-architecture/task-system.md`; `.agents/skills/trellis-meta/references/customize-local/change-workflow.md`; `.claude/skills/trellis-meta/references/local-architecture/task-system.md`; `.claude/skills/trellis-meta/references/customize-local/change-workflow.md`; `.cursor/skills/trellis-meta/references/local-architecture/task-system.md`; `.cursor/skills/trellis-meta/references/customize-local/change-workflow.md`; `.omp/skills/trellis-meta/references/local-architecture/task-system.md`; `.omp/skills/trellis-meta/references/customize-local/change-workflow.md`; `.opencode/skills/trellis-meta/references/local-architecture/task-system.md`; `.opencode/skills/trellis-meta/references/customize-local/change-workflow.md`; `.pi/skills/trellis-meta/references/local-architecture/task-system.md`; `.pi/skills/trellis-meta/references/customize-local/change-workflow.md` | Bundled-skill render parity |
| Project CLI/spec contract | `.trellis/spec/cli/backend/script-conventions.md`; `.trellis/spec/cli/backend/filesystem-safety.md`; `.trellis/spec/cli/backend/workflow-state-contract.md`; `.trellis/spec/cli/backend/index.md` | None | None | Spec review plus tests required by those documents |
| Tests | New `packages/cli/test/scripts/task-scaffold.integration.test.ts`; existing `packages/cli/test/regression.test.ts`; `packages/cli/test/templates/shared-hooks.test.ts`; `packages/cli/test/templates/codex.test.ts`; `packages/cli/test/templates/copilot.test.ts`; `packages/cli/test/templates/opencode.test.ts`; `packages/cli/test/templates/trellis.test.ts`; `packages/cli/test/configurators/index.test.ts` | None | None | Commands in Validation |

## Validation

| Check | How |
|-------|-----|
| marketplace baseline regression | no marketplace entry in `.gitmodules`; no mode `160000` at `marketplace`; provenance pins upstream `758398b89e159f4b6658383dd26c484da423ba93`; registry URLs target `mizuikki/Trellis/main/marketplace`; release staging includes marketplace; no authoring-feature diff reverts these files |
| create | harness: no design/implement |
| scaffold happy path | explicit validated live task; canonical English skeleton; one exact header sentinel; exact stdout result; rc 0 |
| scaffold skip | regular file, including empty, exists; bytes unchanged; exact stdout `skipped_exists`; rc 0; empty skip warns that readiness is still blocked |
| scaffold invalid target | directory/symlink/other non-regular path unchanged; `error_invalid_target`; rc non-zero |
| scaffold all partial | one missing created; one skipped; rc 0 |
| scaffold all hard error | both attempted after per-target errors; successes on stdout/errors on stderr; rc 1 |
| scaffold bad task | missing syntax → rc 2; unknown/ambiguous/outside/archive/nested/symlink-escape/non-regular-or-malformed-task.json/missing-title → rc 1 before writes |
| exclusive create | no clobber under concurrent create; loser is `skipped_exists` |
| start gate | non-regular/symlink/unreadable/non-UTF-8/empty/header-sentinel artifacts block before status/hook/pointer mutation; later literal mention is inert; filled regular files without the header marker permit the pre-existing flow |
| wording | all exact SessionStart/continue/start/brainstorm consumers report scaffold-pending, not complete |
| single scaffold source | only `task_artifacts.py` contains the complete canonical bodies; brainstorm invokes CLI through `{{PYTHON_CMD}}` |
| Semantic IDs | parity as rubric labels; runtime does not parse them |
| EN-only new product text | scoped to new scaffold + guidance constants |
| compile + lint:py | see commands below |
| regression | full filter test set as project requires |

```bash
python3 -m py_compile packages/cli/src/templates/trellis/scripts/common/task_store.py
python3 -m py_compile packages/cli/src/templates/trellis/scripts/common/task_artifacts.py
python3 -m py_compile packages/cli/src/templates/trellis/scripts/task.py
pnpm --filter @mindfoldhq/trellis lint:py
pnpm --filter @mindfoldhq/trellis test
pnpm --filter @mindfoldhq/trellis typecheck
pnpm --filter @mindfoldhq/trellis lint
```

## Rollback

| Path | Risk | Rollback |
|------|------|----------|
| Marketplace baseline | authoring change accidentally restores submodule-era behavior | stop and repair the regression; feature rollback must retain `d01aee69` topology and must not recreate a Marketplace submodule |
| `task_artifacts.py` / `task.py` | create accidentally scaffolds or scaffold escapes task boundary | keep create ≠ scaffold; remove scaffold dispatch, registered artifact module, and helpers together |
| brainstorm + mirrors | planning too heavy / duplicate scaffold bytes | retain rubric only; call CLI |
| session-start / continue / `task.py start` | false “artifacts complete” | keep invalid/empty/header-sentinel checks synchronized |
| workflow.md | SessionStart bloat | short contract only |
| tests lock H2 / permanent IDs | reintroduce rigidity | remove those asserts |

Full feature `git revert` is safe only after locating sentinel-bearing task artifacts. Before rollback, fill/review each artifact and remove the sentinel, or explicitly accept that the old runtime will no longer block it. No `task.json` migration.

## Document readiness (this tmp scheme only)

These checkboxes track **scheme document completeness**, not product ship readiness.

- [x] prd: requirements, AC, and decided CLI/sentinel/path/exit/source/Marketplace contracts
- [x] design: mandatory sentinel §3.7, Marketplace ownership §3.10, safe CLI contract, D/I split, ID policy, overwrite/exit rules
- [x] implement: exact-path matrix, prerequisite gate, validation, single scaffold source, no open product behavior
- [ ] Product implementation: open formal Trellis task when ready to code
- [ ] Product jsonl: curate on sub-agent platforms during real implement

## Explicit non-goals

- Do not ship Chinese or bilingual product templates.
- Do not require user task files to keep semantic-ID comments permanently.
- Do not treat semantic IDs as runtime schema.
- Do not implement `create --complex`.
- Do not put execution-log / multi-agent review into default scaffold.
- Do not build a heading-name linter (English or Chinese).
