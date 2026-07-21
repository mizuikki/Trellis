# Implementation Plan

## Preconditions And Review Gates

- [x] Re-read `prd.md`, `design.md`, the bounded-context section in the platform-integration spec, unit-test conventions, and the cross-platform guide.
- [x] Confirm the branch still contains the original bounded-context implementation and has no overlapping uncommitted runtime changes.
- [x] Before editing existing symbols, follow the repository's required impact-analysis policy unless the user explicitly keeps GitNexus disabled for the implementation turn.

## Implementation

- [x] Add failing shared-hook tests for lone-surrogate reasons, emoji-boundary reasons, replacement-expanded artifact output, and cross-type duplicate targets.
- [x] Harden the shared Python reason normalizer, artifact reader, and dedup key without changing hook routing or warnings.
- [x] Add equivalent failing Pi, OMP, and OpenCode fixtures.
- [x] Apply code-point-safe reason truncation, post-decode byte enforcement, and path-only deduplication to each JavaScript/TypeScript runtime.
- [x] Synchronize the affected runtime sections into tracked dogfood copies while preserving unrelated platform-specific differences.

## Verification

- [x] Run focused shared-hook, Pi, OMP, and OpenCode template tests.
- [x] Run the bounded-context and generated-output cases in `packages/cli/test/regression.test.ts`.
- [x] Run `pnpm lint`, `pnpm typecheck`, and `pnpm --filter @mindfoldhq/trellis lint:py`.
- [x] Run the CLI test suite and verify all existing payload ceilings and body-exclusion assertions still pass.
- [x] Confirm every invalid-input probe produces valid UTF-8 and no result exceeds its declared byte budget.

## Review And Rollback

- [x] Review canonical-template and dogfood-copy diffs separately for unintended drift.
- [x] Verify only the expected bounded-context symbols and execution paths changed before commit, using the repository-required change detection unless GitNexus remains explicitly disabled.
- [x] Keep the hardening changes in a focused commit so they can be reverted without undoing the original metadata-index migration.
