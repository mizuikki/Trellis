# Fork package namespace migration

## Goal

Replace the fork's active `@mindfoldhq/trellis` and
`@mindfoldhq/trellis-core` package identities with
`@mizuikki/trellis` and `@mizuikki/trellis-core`, so source development,
workspace dependencies, generated guidance, and diagnostics no longer imply
that this fork installs or publishes the upstream npm packages.

## Confirmed Facts

- The fork is source-managed, does not publish npm packages, and uses the
  `1.0.0` compatibility line. The preceding fork-local version-management task
  deliberately removed public npm update and publishing behavior.
- The CLI and Core package names, the CLI workspace dependency, root pnpm
  filters, `.lintstagedrc`, and `pnpm-lock.yaml` still use the upstream
  namespace.
- Active source, dogfood platform files, bundled templates, and specs contain
  upstream package names and historical npm-install guidance. A repository
  search excluding archived tasks and journals finds 115 matching files.
- Archived tasks, journals, historical migration manifests, and
  `UPSTREAM_SYNC.md` are provenance records. Rewriting their upstream package
  references would make past behavior and selective-sync evidence inaccurate.

## Requirements

- Rename both active workspace package identities consistently:
  `@mindfoldhq/trellis` -> `@mizuikki/trellis` and
  `@mindfoldhq/trellis-core` -> `@mizuikki/trellis-core`.
- Update internal imports, workspace dependency declarations, pnpm filters,
  lockfile entries, development tooling, and active package-facing docs to use
  the fork namespace.
- Remove active runtime/template instructions that install, execute, publish,
  or inspect the upstream npm packages; replace them with source-checkout and
  build guidance where that behavior is still described.
- Preserve historical/provenance references in archived work records and
  upstream-sync evidence.
- Preserve AGPLv3 licensing, upstream copyright/attribution, and existing
  `author: "Mindfold LLC"` metadata. Add `mizuikki` only as fork maintainer
  metadata where useful; do not replace legal provenance.

## Acceptance Criteria

- [x] `packages/cli` and `packages/core` use the fork namespace, their
  workspace relationship resolves, and TypeScript imports compile.
- [x] Root scripts, lint-staged commands, and the lockfile use the fork
  namespace.
- [x] Active templates and dogfood files contain no executable upstream npm
  install, `npx`, publish, registry, or package-version instructions.
- [x] Archived tasks, journals, historical manifests, and explicit upstream
  provenance remain untouched.
- [x] `AGPL-3.0-only`, `author: "Mindfold LLC"`, license text, and upstream
  attribution remain intact; package metadata identifies `mizuikki` only as
  fork maintainer/contributor.
- [x] Repository checks pass, and a scoped search confirms remaining
  `@mindfoldhq/trellis` references are historical or explicit provenance only.

## Out of Scope

- Publishing either fork package to npm or providing compatibility aliases.
- Changing the Trellis command name, project directory names, or migration
  version line.
- Rewriting historical records merely to remove upstream branding.

## Notes

- This is expected to be a complex task because it crosses package metadata,
  imports, lockfile state, templates, generated dogfood mirrors, and specs.
