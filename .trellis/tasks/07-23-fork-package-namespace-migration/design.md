# Design - Fork package namespace migration

## Boundary

The active fork identity changes from `@mindfoldhq/trellis` and
`@mindfoldhq/trellis-core` to `@mizuikki/trellis` and
`@mizuikki/trellis-core`.

In scope are current package metadata, workspace dependency resolution,
TypeScript imports, root development scripts, release-maintenance text,
bundled templates, dogfood platform copies, and active specs. The migration
also removes active instructions that invoke or inspect upstream npm packages.

The task does not alter package versions, command names, `.trellis/` layout,
or installed-consumer migration behavior. It leaves historical manifests,
archived tasks, journals, and explicit upstream provenance unchanged.

License and attribution are outside the naming migration: retain
`AGPL-3.0-only`, the license file, upstream attribution, and
`author: "Mindfold LLC"`. Package metadata may add `mizuikki` as a fork
maintainer/contributor without presenting the fork as the original author.

## Mechanisms and Decisions

Update both workspace package `name` fields and the CLI's `workspace:*` Core
dependency together. Replace all source imports of the Core package and every
pnpm `--filter` reference with the fork namespace. Regenerate
`pnpm-lock.yaml` through pnpm rather than editing importer/package keys by
hand.

Treat runtime-facing documentation separately from historical text:

- Current source templates and their dogfood copies must describe source
  checkout/build usage and the fork namespace where a package identity is
  necessary.
- Current operational specs and scripts must use fork package names but retain
  release/version checks that still apply to the source-maintained project.
- Historical manifests remain unedited because their npm/package references
  describe releases already made by upstream.

Do not run `trellis update` in this repository to refresh dogfood files: the
root deployment deliberately remains on `0.6.2`, while the source CLI is
`1.0.0`. Update the tracked dogfood files in the same change as their current
template/source counterparts.

## Risks, Compatibility, and Failure Modes

Changing a workspace package name can leave stale lockfile importer keys or
unresolved Core imports. Regenerating the lockfile and running build/typecheck
detects both before release.

Bulk text replacement can corrupt historical evidence or turn internal package
references into npm installation instructions. Scope searches to active files,
review migration manifests separately, and classify every remaining upstream
reference as historical or explicit provenance.

Dogfood copies can drift from bundled source templates. Verify every
runtime-facing active reference after editing; do not use the root updater as a
shortcut because it would violate the fork-version boundary.

Rollback is a source revert of the namespace migration commit. No consumer
state is changed because this fork has no npm distribution path.

## Test Strategy

Run package build, lint, typecheck, and the complete test suite after lockfile
regeneration. Use scoped repository searches to verify that active code and
runtime templates no longer contain executable upstream npm guidance, while
historical/provenance files retain intentional references.
