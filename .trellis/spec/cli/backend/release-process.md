# Release Process

> Source-managed release, versioning, and provenance rules for this fork.

## Version Invariants

The CLI and Core packages share one fork compatibility version. The first fork
release is `1.0.0`; upstream release numbers are historical ingress versions,
not fork targets.

| Invariant | Rule |
| --- | --- |
| Shared version | `packages/cli/package.json` and `packages/core/package.json` have the same `version`. |
| Optional Git tag | A tag `v<version>`, when used, matches both package versions. |
| Workspace dependency | CLI source uses `workspace:*` for Core. |
| Migration ownership | New manifests use fork versions; imported upstream migrations are copied or re-authored under the next fork version. |
| Provenance | Every selected upstream import is recorded in `UPSTREAM_SYNC.md`. |

Run the local preflight before a release:

```bash
node packages/cli/scripts/release-preflight.js check-versions
pnpm test
pnpm lint
pnpm typecheck
```

## Source Distribution

This fork is used from a source checkout. It does not publish packages, query
package registries for versions, or provide a self-installing `trellis upgrade`
command. Updating the checkout and rebuilding the CLI are maintainer actions
outside the CLI command surface.

## Release Workflow

`packages/cli/scripts/release.js` runs tests, excludes `.trellis/` from its
pre-release staging sweep, bumps both package manifests atomically, verifies
their equality, and can create a local Git tag. It must not add package-registry
checks or publication steps.

The `.trellis/` exclusion is required: repository dogfood state, task files,
workspace drafts, and runtime artifacts must never be swept into a release
commit.

```js
run("git add -A -- ':!.trellis'");
```

## Imported Upstream Changes

Before accepting an upstream change, decide whether it affects generated
consumer files. If it does, add a fork-versioned migration manifest and test a
consumer fixture. Record the upstream commit or area and its compatibility
impact in `UPSTREAM_SYNC.md`.
