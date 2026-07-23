# Sync upstream to v0.6.8

## Goal

Selectively bring the valuable Kimi Code support from upstream `v0.6.8` into
the fork while preserving the fork-owned distribution, compatibility version,
workflow contracts, and repository topology established after the `0.6.7`
baseline.

## Background

- The task is tracked at `.trellis/tasks/07-23-sync-upstream-v0-6-8` on
  branch `sync/upstream-v0.6.8`, based on `main` at `be25b841`.
- Upstream tag `v0.6.8` resolves to `dc68f5a9`. From the shared ancestor
  `a0d749e9`, the fork has 35 unique commits and the tag has five.
- Of those five upstream commits, `bfa7f99d` adds Kimi Code support,
  `65a83d7d` fixes CI ordering already present in the fork, and the remaining
  three change upstream release metadata, package versions, or publishing.
- A full trial merge reports 21 conflicts across generated skill copies,
  workflow text, CI/publish policy, package versions, deleted submodules, and
  the fork's vendored Marketplace.
- The fork packages use the `@mizuikki` namespace and version `1.0.0`.
  `UPSTREAM_SYNC.md` defines upstream `0.6.7` as the baseline and keeps
  upstream provenance separate from fork compatibility versions.
- Current official Kimi documentation confirms `.kimi-code/skills/` and
  `.agents/skills/`, the `/skill:<name>` invocation form, the built-in
  `coder`/`explore`/`plan` sub-agents, and `kimi --session <id>`. It also
  confirms that prompt mode already uses automatic permissions and rejects
  the upstream commit's `-p <prompt> --yolo` combination.

## Requirements

- R1: Selectively import and adapt Kimi Code support from `bfa7f99d`; do not
  merge the complete `v0.6.8` tag.
- R2: Add first-class Kimi registry, CLI selection, configurator, templates,
  generated Python runtime support, workflow classification, documentation,
  and regression coverage.
- R3: Use current valid Kimi CLI contracts, including `kimi -p <prompt>` for
  non-interactive execution and `kimi --session <id>` for resume.
- R4: Keep shared `.agents/skills/` output neutral and byte-identical across
  platform configurators; keep Kimi-private commands and role instructions in
  `.kimi-code/skills/`.
- R5: Keep live dogfood workflow/Python files consistent with their canonical
  package templates without replacing fork-specific planning behavior.
- R6: Preserve `@mizuikki` package names and the `1.0.0` compatibility line.
- R7: Preserve the source-only distribution policy and repository topology:
  do not restore public npm publishing/update behavior, `trellis upgrade`,
  `README_CN.md`, the docs-site submodule, or a Marketplace gitlink.
- R8: Record `dc68f5a9` as the evaluated release boundary and `bfa7f99d` as
  the accepted adapted import in `UPSTREAM_SYNC.md`, including the surfaces
  that were excluded or already satisfied.
- R9: Validate focused Kimi behavior followed by lint, type-check, build, the
  complete test suite, generated-twin checks, and fork invariant checks.

## Acceptance Criteria

- [x] `trellis init --kimi` and update tracking produce the expected
  `.kimi-code/skills/` and neutral `.agents/skills/` files.
- [x] Kimi is recognized by the TypeScript and generated Python platform
  registries, task context seeding, detection, and CLI adapter paths.
- [x] The Kimi non-interactive command is exactly `kimi -p <prompt>` without
  `--yolo`, and resume is `kimi --session <id>`.
- [x] Kimi template/configurator output and live/canonical workflow/Python
  twins are byte-consistent and covered by focused tests.
- [x] CLI and Core remain named `@mizuikki/trellis` and
  `@mizuikki/trellis-core`, both versioned `1.0.0`.
- [x] Public publish/self-upgrade surfaces remain deleted; `docs-site` and
  `README_CN.md` remain absent; `marketplace/` remains a normal vendored
  directory; the historical `0.6.8` migration manifest remains unchanged.
- [x] `UPSTREAM_SYNC.md` records the evaluated `v0.6.8` boundary, accepted
  Kimi import, excluded commits/surfaces, and compatibility impact.
- [x] No conflict markers or temporary merge paths remain, and lint,
  type-check, build, focused tests, and the full test suite pass.

## Out of Scope

- Changing the fork compatibility version from `1.0.0` to `0.6.8`.
- Importing upstream release manifests, package bumps, publishing automation,
  docs-site or Marketplace gitlinks, or commits newer than `v0.6.8`.
- Updating the root dogfood deployment as a consumer project.
- Adding Kimi project-level hooks or custom agent definitions that the
  approved upstream integration does not require.

## Key Decisions

- The user approved the selective Kimi import and exclusion of the other four
  upstream-only commits.
- The fork adapts upstream behavior when current official Kimi contracts have
  changed; provenance is preserved in `UPSTREAM_SYNC.md` rather than through a
  noisy full-tag merge.
- Canonical fork templates and policies win over conflicting generated or
  release-oriented upstream files.
