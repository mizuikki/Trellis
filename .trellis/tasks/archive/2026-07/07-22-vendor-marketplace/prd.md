# Vendor upstream Marketplace into Trellis fork

## Goal

Replace the fork-only `marketplace` git submodule with a normal, first-party
`marketplace/` directory in `mizuikki/Trellis`, using a pinned snapshot of
`https://github.com/mindfold-ai/marketplace`. Eliminate the need to maintain or
push a separate Marketplace fork while preserving the catalog and workflow
features consumed by this repository.

## Background

- The current `.gitmodules` entry points `marketplace` at
  `https://github.com/mizuikki/marketplace.git` only so GitHub Checks can
  initialize the submodule.
- This fork does not intend to maintain or synchronize a separate Marketplace
  repository.
- Main-repository tests and specifications already read
  `marketplace/workflows/**` directly, so Marketplace content is a product and
  CI dependency rather than an independently released package.
- On 2026-07-22, upstream `main` was reverified at
  `758398b89e159f4b6658383dd26c484da423ba93` (tree
  `784f1a11f1a01aa0469333889e4e123620452807`) with 160 files. This is the
  snapshot to import.
- The current fork submodule differs from that upstream snapshot only in
  `workflows/native/workflow.md`; the fork copy is byte-identical to the
  bundled native workflow and must be restored after the baseline import.
- The upstream repository contains no `LICENSE`, `COPYING`, or `NOTICE` file,
  and GitHub reports no detected license. Its initial commit
  `76a36ea573ed1ff00712f91a326061cc59d34958` explicitly says the content was
  migrated from the AGPL-3.0-licensed Trellis monorepo; comparison with the
  pre-extraction `marketplace/` tree shows only the expected `index.json` path
  normalization. The accepted policy is to treat the snapshot as AGPL-derived
  content governed by this repository's root `LICENSE`, while documenting the
  missing standalone upstream license notice instead of implying that one
  exists.
- `docs-site` remains a git submodule.

## Requirements

1. Import one reviewed upstream Marketplace snapshot into the existing
   `marketplace/` path as ordinary files tracked by the Trellis repository.
2. Remove only the Marketplace entry and gitlink from `.gitmodules` / the Git
   index; do not alter the `docs-site` submodule contract.
3. Do not use `git subtree`, preserve upstream history, add automatic sync, or
   retain an embedded `.git` directory.
4. Add `marketplace/VENDORED_FROM.md` containing the upstream URL, pinned commit,
   import date, license/provenance notes, and a statement that future changes
   are owned by this fork with no upstream-sync promise.
5. Preserve every file from the pinned snapshot before applying explicit,
   reviewable fork adjustments.
6. Apply only the fork adjustments required for repository correctness:
   - `marketplace/workflows/native/workflow.md` remains byte-identical to the
     bundled native workflow.
   - TDD and channel-driven workflows retain the invariants asserted by current
     tests/specs.
   - Marketplace README/install URLs describe
     `mizuikki/Trellis/marketplace`.
7. Point the CLI's default Marketplace registry/index source at the vendored
   catalog under `mizuikki/Trellis/main/marketplace`; explicit custom registry
   options remain supported.
8. Ensure release staging includes Marketplace changes in the owning
   main-repository commit; remove Marketplace-specific submodule ordering and
   push instructions.
9. Remove the pre-commit hook's Marketplace submodule initialization and make
   CI path filters match files below `marketplace/**` after the gitlink becomes
   a directory.
10. Update repository topology, workflow-marketplace, release, and docs-sync
   specifications so they describe Marketplace as a vendored directory.
11. CI may continue initializing submodules for `docs-site`, but a fresh
    checkout must not fetch or require a Marketplace repository.
12. Keep existing catalog IDs and paths stable; do not redesign or rename
    Marketplace entries as part of this migration.
13. Verify the upstream content's licensing/provenance is compatible with
    distribution under this repository before shipping the imported snapshot.
14. This task only performs the Marketplace topology/ownership migration. The
    `design.md` / `implement.md` authoring feature in
    `tmp/design-implement-authoring-templates/` consumes this migration later
    and is not implemented here.

## Acceptance Criteria

- [x] `.gitmodules` declares `docs-site` but not `marketplace`.
- [x] `git ls-files --stage marketplace` contains ordinary file modes and no
      mode `160000` gitlink.
- [x] `marketplace/` contains the complete manifest of the pinned upstream
      snapshot and no nested `.git`.
- [x] `marketplace/VENDORED_FROM.md` records the exact source URL/commit,
      import date, provenance/license result, and no-sync policy.
- [x] Any post-import fork differences are limited to documented URL,
      provenance, and workflow-contract adjustments.
- [x] The native workflow remains byte-identical to the bundled workflow; TDD
      and channel workflow regression contracts pass.
- [x] Default template/registry URLs resolve to
      `mizuikki/Trellis/main/marketplace`; custom registries still work.
- [x] `packages/cli/scripts/release.js` no longer excludes `marketplace`.
- [x] `.husky/pre-commit` no longer initializes Marketplace as a submodule,
      and CI watches `marketplace/**` file changes.
- [x] Specs no longer describe Marketplace as a submodule or require a
      Marketplace push before release.
- [x] A clean checkout plus normal CI initialization needs only the remaining
      `docs-site` submodule.
- [x] CLI typecheck, lint, build, and tests pass.
- [x] The later authoring-guidance plan identifies this task as a completed
      prerequisite and treats `marketplace/workflows/**` as same-repository
      mirrors.

## Out of Scope

- Implementing the design/implement authoring feature.
- Maintaining a fork of `mindfold-ai/marketplace`.
- Automatic or periodic upstream synchronization.
- Preserving Marketplace commit history with `git subtree`.
- Redesigning the catalog, correcting unrelated template content, or adding
  new Marketplace entries.
- Removing or vendoring the `docs-site` submodule.
