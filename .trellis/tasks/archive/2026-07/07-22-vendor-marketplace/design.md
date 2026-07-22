# Vendor upstream Marketplace into Trellis fork

## Overview

Replace the `marketplace` gitlink with a reviewed copy of upstream commit
`758398b89e159f4b6658383dd26c484da423ba93`, then apply a deliberately small
fork overlay. Marketplace becomes main-repository product content; `docs-site`
remains the only submodule declared by `.gitmodules`.

## Source Baseline and Provenance

- Source: `https://github.com/mindfold-ai/marketplace`
- Commit: `758398b89e159f4b6658383dd26c484da423ba93`
- Tree: `784f1a11f1a01aa0469333889e4e123620452807`
- Import date: 2026-07-22
- Baseline manifest: 160 ordinary files, excluding upstream `.git` metadata
- License policy: the upstream repository has no standalone license notice,
  but its initial commit records extraction from the AGPL-3.0 Trellis
  monorepo. The vendored copy is treated as AGPL-derived and governed by the
  root Trellis `LICENSE`; `VENDORED_FROM.md` must state both the lineage and
  the missing upstream notice without claiming separate upstream licensing.

The import is a content snapshot, not a history-preserving merge. A temporary
clone/archive is used only to obtain and verify the pinned tree. No nested
`.git`, subtree metadata, remote, or synchronization mechanism enters the
repository.

## Repository Topology

The conversion has three coordinated parts:

1. Remove only the Marketplace section from `.gitmodules` and remove the
   `marketplace` mode-`160000` entry from the main repository index.
2. Materialize the 160 upstream files at `marketplace/` as mode-`100644`
   tracked files, with no `marketplace/.git` path.
3. Remove assumptions that `marketplace` can be initialized or represented by
   one path-level gitlink: the pre-commit hook drops its submodule command and
   CI changes its filter from `marketplace` to `marketplace/**`.

The existing `docs-site` `.gitmodules` entry, gitlink, checkout behavior, and
release ordering remain unchanged.

## Fork Overlay

The baseline import is verified before these explicit same-repository changes:

| File | Fork adjustment |
| --- | --- |
| `marketplace/README.md` | Point the install example at `mizuikki/Trellis/marketplace`. |
| `marketplace/workflows/native/workflow.md` | Replace the upstream copy with the current bundled `packages/cli/src/templates/trellis/workflow.md` byte-for-byte. |
| `marketplace/VENDORED_FROM.md` | Record source URL, commit/tree, date, 160-file baseline, AGPL provenance decision, modifications, and no-sync ownership policy. |

`index.json`, catalog IDs, template paths, TDD workflow, channel-driven
workflow, skills, and spec content remain exactly as imported.

## Registry Contract

The two default sources in `packages/cli/src/utils/template-fetcher.ts` move
together:

- index URL:
  `https://raw.githubusercontent.com/mizuikki/Trellis/main/marketplace/index.json`
- giget source: `gh:mizuikki/Trellis/marketplace`

Callers continue using `TEMPLATE_INDEX_URL` and the existing optional
`indexUrl`, registry source, and repository source arguments. No parsing or
custom-registry behavior changes. Tests must assert the fork-owned default and
retain existing custom GitHub/GitLab/self-hosted coverage.

## Release and Maintenance Contract

`packages/cli/scripts/release.js` continues excluding `docs-site` and
`.trellis` from its broad pre-release stage, but stops excluding `marketplace`.
Consequently, a Marketplace edit is committed in the same repository commit
that owns it and has no separate push prerequisite.

Release guidance in `.trellis/spec/cli/backend/release-process.md` and the two
live `create-manifest` command/skill copies must describe only `docs-site` as a
submodule. Historical migration manifests, archived tasks, and journals remain
unchanged because they document past topology.

Repository topology, workflow marketplace, and docs-sync specs are updated to
state that Marketplace mirrors are same-repository files. The later plan under
`tmp/design-implement-authoring-templates/` already treats this migration as a
separate prerequisite and is verified, not implemented, by this task.

## Compatibility

- Fresh clones still initialize `docs-site` through existing recursive
  submodule checkout settings.
- Existing Marketplace IDs and relative paths remain stable.
- Published CLI behavior changes only for the default registry owner/path.
- Explicit custom registry and workflow marketplace sources retain their
  current behavior.
- No migration is needed in initialized user projects because the repository
  topology is a source/CI concern, not a generated project layout.

## Verification Strategy

Verify the baseline with the pinned Git tree and a sorted path manifest before
applying the overlay. After edits, compare against the baseline while allowing
only the three overlay files listed above. Then verify Git modes, absence of
nested metadata, native workflow byte parity, workflow invariants, URLs,
release staging text, CI/pre-commit topology, and spec consistency.

Run focused CLI tests first, followed by root typecheck, lint, build, and the
full test suite. A fresh temporary clone of the resulting worktree or commit is
used to prove that Marketplace files exist without initializing a Marketplace
submodule while `docs-site` remains the sole submodule dependency.

## Rollback

Before conversion, preserve the current submodule worktree in a temporary
backup rather than deleting it. If baseline verification fails, restore the
gitlink and `.gitmodules` entry before continuing. After conversion, rollback
is a normal main-repository revert; no Marketplace remote or submodule commit
must be repaired.
