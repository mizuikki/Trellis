# Design - Fork-local version management

## Boundary

This task changes the source distribution used to deploy Trellis to consumer
projects. Its scope is the CLI/core package versions, update/session templates,
migration metadata, release scripts and CI, source-oriented documentation, and
their tests.

The root `.trellis/` directory is an existing dogfood deployment at `0.6.2`.
It is not an input fixture, migration target, or version source for this work.
No command may update it. Tests use temporary consumer-project directories.

The existing package names and the `trellis` binary name remain unchanged. In
a single-maintainer source checkout, changing them would create import and
template churn without making version detection more reliable.

## Mechanisms and Decisions

### Fork Compatibility Version

`1.0.0` becomes the first fork-owned compatibility version. Both package
manifests remain in exact lockstep, and `constants/version.ts` continues to
derive the running CLI version from the CLI package manifest. `init` and
`update` therefore stamp consumer projects with `1.0.0` without a second
version source.

The existing semver comparator remains the ordering authority. An external
consumer at `0.6.x` is lower than `1.0.0`, so its first update naturally
traverses the existing `0.6.x` manifests before reaching a new `1.0.0`
manifest. Future fork changes must use versions greater than `1.0.0`; imported
upstream migration actions are copied or re-authored under the relevant fork
version rather than retaining an upstream version key.

### Consumer Update Flow

`trellis update` keeps only the project-versus-running-CLI comparison:

```text
consumer .trellis/.version -> compare with source CLI VERSION
  older -> collect version-range migrations and update templates -> write VERSION
  equal -> no-op
  newer -> reject unless --allow-downgrade
```

The command must remove the npm `latest` fetch and its display/warning path.
It must not globally configure a proxy merely for that deleted request. Proxy
configuration remains available where an explicitly configured template
registry actually needs network access.

The `1.0.0` manifest records the fork boundary and source-checkout update
instructions. Existing `0.6.x` migration entries remain intact so `--migrate`
still applies their file moves/deletes exactly once. The new boundary manifest
contains only fork-owned metadata/actions; it does not touch the source
repository's own `.trellis/` directory.

### Session and Upgrade Surface

Generated `session_context.py` must no longer spawn `trellis --version` from
`PATH`, parse a banner, or create an update-check marker. In a source checkout
that command can resolve a different global CLI, so the result is not a valid
fork compatibility signal. The actual source CLI's startup check remains the
authoritative local mismatch notice when the maintainer invokes the source
entrypoint.

Remove the `trellis upgrade` command and its npm-install implementation/tests.
The active source documentation states that updating the fork is an external
checkout operation (for example, selecting a Git revision and rebuilding),
not a CLI mutation. This task does not automate `git pull`, build, or source
checkout changes.

### Release and Provenance

Retain one local release invariant: CLI and Core must have the same version.
Remove npm existence, dist-tag, packed-publication, and public-registry
visibility checks, plus the public npm publish workflow. Local version bumping
and optional Git tagging may remain, provided neither contacts npm nor claims
publication.

Add root-level `UPSTREAM_SYNC.md` as the human-maintained provenance ledger.
It records the fork baseline, the source version, each selectively imported
upstream commit or release area, and deliberately excluded upstream surfaces.
It is not read by update/migration runtime code.

## Compatibility and Migration

The one-time `0.6.x -> 1.0.0` path is an upgrade, never a downgrade. A consumer
with pending historical file migrations must run `trellis update --migrate`
under the existing gate. An already updated `1.0.0` consumer is a no-op; it
must not reapply historical actions. Consumer projects with a version greater
than `1.0.0` retain the existing `--allow-downgrade` escape hatch.

Historical manifests may contain historical npm installation notes. Active
user-facing commands, source documentation, and the new fork-boundary
manifest must instead describe source-managed updates. Do not rewrite
historical migration behavior merely to edit archival release prose.

## Risks, Compatibility, and Failure Modes

- Removing the npm fetch must not remove proxy support for registry-backed
  template refreshes. Keep proxy setup narrowly attached to those paths.
- A fork release below or equal to its upstream base would break the migration
  ordering contract. `1.0.0` avoids that boundary collision.
- Removing `upgrade` is intentionally breaking for scripts that call it; the
  `1.0.0` manifest and active documentation must make the replacement clear.
- Updating the repository root would corrupt the task's control case. All
  update coverage must use isolated fixtures and assertions on the root stamp.
- Future upstream imports can introduce migrations. Their actions require
  fork-version manifests and an entry in `UPSTREAM_SYNC.md` before release.

## Test Strategy

Use function-level update integration tests in temporary directories. Cover a
`0.6.x` consumer upgraded with `--migrate`, a repeated no-op update, and the
existing downgrade refusal. Unit/regression coverage verifies that generated
session context has no subprocess/PATH-based update probe and that a normal
`update` does not call npm's `latest` endpoint. Release-script tests retain the
Core/CLI equality failure and remove registry/publication expectations.
