# Implementation Plan

## Preconditions And Review Gates

- [ ] Before editing each existing function/class/method, run GitNexus upstream impact analysis and record direct callers, affected processes, and risk. Warn before proceeding on HIGH or CRITICAL results.
- [ ] Re-read the current task requirements, the backend platform-integration/quality specs, unit-test specs, and cross-platform/code-reuse guides.
- [ ] Confirm no unrelated changes overlap the generated templates or tracked dogfood copies.

## Runtime Implementation

- [ ] Add focused failing tests for bounded metadata indexes and artifact/aggregate limits before changing runtime behavior.
- [ ] Update `packages/cli/src/templates/shared-hooks/inject-subagent-context.py` to use bounded byte reads, metadata-only manifest indexes, entry/source caps, and path-bearing notices for implement/check/finish context.
- [ ] Update `packages/cli/src/templates/pi/extensions/trellis/index.ts.txt` with the validated bounded-reader/index behavior and cover file/directory/legacy-entry compatibility.
- [ ] Update `packages/cli/src/templates/omp/extensions/trellis/index.ts.txt` so both main-session and sub-agent task context obey the same contract.
- [ ] Update OpenCode's context utility and injection plugin to build bounded manifest indexes and task artifacts without referenced bodies.
- [ ] Search all generated integration sources again for eager JSONL body reads; either migrate every remaining consumer or document why it is not an injection producer.

## Guidance And Generated Files

- [ ] Update canonical `packages/cli/src/templates/trellis/{workflow.md,agents/*.md}` guidance from wholesale reads to reason-based selection and targeted/ranged reads.
- [ ] Update per-platform implement/check fallback or pull definitions, including JSON/TOML variants, so no generated instruction requires every manifest entry to be read wholesale.
- [ ] Update bundled `trellis-meta` context-loading/architecture references to describe bounded artifacts and manifest indexes.
- [ ] Synchronize only the corresponding tracked dogfood copies (`.trellis/`, configured platform assets, and `.agents/skills/`) while preserving unrelated local/template differences.

## Verification

- [ ] Run focused shared-hook tests, including Python import probes with oversized UTF-8 fixtures.
- [ ] Run `pnpm --filter @mindfoldhq/trellis test -- packages/cli/test/templates/shared-hooks.test.ts packages/cli/test/templates/pi.test.ts packages/cli/test/templates/omp.test.ts packages/cli/test/templates/opencode.test.ts` or the repository-equivalent focused Vitest command.
- [ ] Run relevant `packages/cli/test/regression.test.ts` cases for generated/installed hook and agent contracts.
- [ ] Run `pnpm lint`, `pnpm typecheck`, and the CLI test suite required by the package specs.
- [ ] Confirm synthetic 2 MiB body markers are absent and every rendered payload is within its declared UTF-8 byte budget.
- [ ] Run GitNexus `detect_changes({scope: "compare", base_ref: "main"})`; verify only expected symbols and execution flows are affected before commit.

## Rollback Points

- [ ] Keep runtime behavior changes separable from guidance/dogfood synchronization in reviewable commits.
- [ ] If one platform cannot meet parity without destabilizing task resolution, revert that platform's runtime change and keep the task in progress; do not ship a partially documented mixed contract.
