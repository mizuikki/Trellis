# Implementation Plan

## Preconditions And Review Gates

- [ ] Re-read `prd.md`, `design.md`, the bounded-context section in the platform-integration spec, unit-test conventions, and the cross-platform guide.
- [ ] Confirm the branch still contains the original bounded-context implementation and has no overlapping uncommitted runtime changes.
- [ ] Before editing existing symbols, follow the repository's required impact-analysis policy unless the user explicitly keeps GitNexus disabled for the implementation turn.

## Implementation

- [ ] Add failing shared-hook tests for lone-surrogate reasons, emoji-boundary reasons, replacement-expanded artifact output, and cross-type duplicate targets.
- [ ] Harden the shared Python reason normalizer, artifact reader, and dedup key without changing hook routing or warnings.
- [ ] Add equivalent failing Pi, OMP, and OpenCode fixtures.
- [ ] Apply code-point-safe reason truncation, post-decode byte enforcement, and path-only deduplication to each JavaScript/TypeScript runtime.
- [ ] Synchronize the affected runtime sections into tracked dogfood copies while preserving unrelated platform-specific differences.

## Verification

- [ ] Run focused shared-hook, Pi, OMP, and OpenCode template tests.
- [ ] Run the bounded-context and generated-output cases in `packages/cli/test/regression.test.ts`.
- [ ] Run `pnpm lint`, `pnpm typecheck`, and `pnpm --filter @mindfoldhq/trellis lint:py`.
- [ ] Run the CLI test suite and verify all existing payload ceilings and body-exclusion assertions still pass.
- [ ] Confirm every invalid-input probe produces valid UTF-8 and no result exceeds its declared byte budget.

## Review And Rollback

- [ ] Review canonical-template and dogfood-copy diffs separately for unintended drift.
- [ ] Verify only the expected bounded-context symbols and execution paths changed before commit, using the repository-required change detection unless GitNexus remains explicitly disabled.
- [ ] Keep the hardening changes in a focused commit so they can be reverted without undoing the original metadata-index migration.
