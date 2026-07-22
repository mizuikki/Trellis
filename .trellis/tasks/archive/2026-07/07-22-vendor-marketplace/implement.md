# Implementation Plan

## 1. Pin and Stage the Baseline

- [x] Re-run `git ls-remote` for upstream `main` and require
      `758398b89e159f4b6658383dd26c484da423ba93`.
- [x] Fetch/clone the exact commit into a temporary directory; verify tree
      `784f1a11f1a01aa0469333889e4e123620452807` and the sorted 160-file
      manifest.
- [x] Preserve the current Marketplace submodule worktree in a recoverable
      temporary backup.
- [x] Remove the Marketplace gitlink from the main index, retain the
      `docs-site` gitlink, and materialize the upstream snapshot without its
      `.git` metadata.
- [x] Verify the materialized baseline matches the pinned commit before any
      fork edits.

## 2. Apply the Reviewed Fork Overlay

- [x] Update `marketplace/README.md` to install from
      `mizuikki/Trellis/marketplace`.
- [x] Copy `packages/cli/src/templates/trellis/workflow.md` over
      `marketplace/workflows/native/workflow.md` and verify byte identity.
- [x] Add `marketplace/VENDORED_FROM.md` with source URL, commit/tree, import
      date, baseline count, AGPL lineage/missing-notice disclosure, explicit
      fork modifications, and no-upstream-sync policy.
- [x] Compare the final Marketplace tree to upstream and require that only
      `README.md`, `workflows/native/workflow.md`, and the added provenance
      file differ.

## 3. Remove Submodule Assumptions

- [x] Remove only the Marketplace section from `.gitmodules`.
- [x] Remove Marketplace initialization from `.husky/pre-commit`.
- [x] Change both CI Marketplace path filters to `marketplace/**`; retain
      recursive submodule checkout for `docs-site`.
- [x] Confirm `git ls-files --stage marketplace` has no mode `160000`,
      `.gitmodules` still declares `docs-site`, and `marketplace/.git` does not
      exist.

## 4. Point Defaults at the Vendored Catalog

- [x] Update the default index URL and giget source in
      `packages/cli/src/utils/template-fetcher.ts` to
      `mizuikki/Trellis/main/marketplace`.
- [x] Add focused assertions for the default URL/source while retaining the
      existing custom-registry test coverage.
- [x] Run the template fetcher and workflow resolver test files.

## 5. Align Release and Documentation Contracts

- [x] Remove only `:!marketplace` from the pre-release stage command in
      `packages/cli/scripts/release.js`; keep `:!docs-site` and `:!.trellis`.
- [x] Update `.codex/skills/create-manifest/SKILL.md` and
      `.claude/commands/trellis/create-manifest.md` so the submodule preflight
      names only `docs-site`.
- [x] Update `.trellis/spec/tech/repo/index.md` for the vendored topology.
- [x] Update `.trellis/spec/cli/backend/commands-workflow.md` for
      same-repository Marketplace mirrors and fork-owned defaults.
- [x] Update `.trellis/spec/cli/backend/release-process.md` so Marketplace is
      staged normally and has no separate push ordering.
- [x] Update `.trellis/spec/docs-site/docs/sync-on-change.md` so workflow
      mirror edits are same-repository changes.
- [x] Verify `tmp/design-implement-authoring-templates/{prd,design,implement}.md`
      still names this topology migration as a separate prerequisite; do not
      implement that later feature.
- [x] Leave archived tasks, journals, and historical migration changelogs
      unchanged.

## 6. Verification

- [x] Run `git diff --check` and review every changed path. The sole warning is
      inherited byte-for-byte from pinned upstream at
      `marketplace/specs/electron-fullstack/backend/text-input.md:19`; it is
      intentionally preserved outside the reviewed overlay.
- [x] Run Marketplace manifest/overlay checks, Git mode checks, URL scans, and
      `cmp marketplace/workflows/native/workflow.md packages/cli/src/templates/trellis/workflow.md`.
- [x] Run focused tests:
      `pnpm --filter @mindfoldhq/trellis test -- test/templates/trellis.test.ts test/utils/template-fetcher.test.ts test/utils/workflow-resolver.test.ts`.
- [x] Run `pnpm typecheck`.
- [x] Run `pnpm lint`.
- [x] Run `pnpm build`.
- [x] Run `pnpm test`.
- [x] Validate a fresh temporary checkout: Marketplace files are present
      before submodule initialization, recursive initialization requires only
      `docs-site`, and Marketplace tests pass.
- [x] Search live files for stale Marketplace submodule/fork URLs and classify
      any hits as intentional history or defects.

## Risk and Rollback Gates

- Baseline pin/tree/manifest mismatch: stop before replacing the gitlink.
- Unexpected post-import diff outside the three overlay files: restore the
  temporary backup and investigate before continuing.
- Native/TDD/channel workflow regression: restore the bundled native mirror or
  pinned upstream variant as appropriate; do not edit unrelated catalog files.
- Registry regression: revert only the two default constants/tests; custom
  registry parsing must remain untouched.
- Release or topology regression: revert the owning main-repository changes;
  never recreate or push a fork-owned Marketplace submodule as a workaround.
