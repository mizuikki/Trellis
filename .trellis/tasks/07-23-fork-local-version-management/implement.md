# Implement - Fork-local version management

## Ordered Checklist

- [ ] Update `packages/cli/package.json` and `packages/core/package.json` to
  `1.0.0`, retaining their exact-version lockstep and workspace development
  dependency.
- [ ] Add `packages/cli/src/migrations/manifests/1.0.0.json` describing the
  fork boundary and source-managed upgrade guidance. Do not add a migration
  action that addresses this repository's root `.trellis/` deployment.
- [ ] Remove the npm-latest request, related output, and npm-only proxy setup
  from `commands/update.ts`, while preserving proxy setup at actual configured
  registry-fetch call sites.
- [ ] Remove the PATH-based version probe, parsing helpers, marker writes, and
  text hint from the generated session-context template and its regression
  coverage.
- [ ] Remove `trellis upgrade` wiring, its npm-install implementation, and
  its command tests. Replace current source-facing guidance with checkout and
  build guidance without automating source mutations.
- [ ] Simplify release scripts and package scripts to retain local CLI/Core
  version equality and version bumps while removing npm continuity, publish,
  pack-for-publication, dist-tag, and registry visibility behavior. Remove the
  public publish workflow.
- [ ] Add `UPSTREAM_SYNC.md` with the baseline, fork version policy, required
  record format for selective imports, and explicitly excluded npm surfaces.
- [ ] Update active README/help/spec/template documentation that instructs a
  user to install or upgrade the upstream public npm package. Preserve
  historical migration semantics rather than mass-editing old manifests.
- [ ] Add/adjust tests, then run focused checks followed by the CLI suite and
  repository type/lint checks.

## Validation

| Scenario | Command or fixture | Expected result |
| --- | --- | --- |
| Existing consumer upgrade | Temporary initialized project stamped `0.6.2`; `update({ force: true, migrate: true })` | Historical eligible migrations run, templates update, and `.version` becomes `1.0.0`. |
| Idempotent fork update | Repeat the same update in that fixture | No pending migrations and no re-applied historical actions. |
| Downgrade guard | Consumer stamp greater than `1.0.0`; default update | Update refuses and preserves the stamp. |
| No npm version lookup | Normal `update` fixture with mocked `fetch` | No request to npm's `latest` endpoint. |
| No PATH session probe | Generated session-context regression fixture | No `trellis --version` subprocess, update marker, or hint. |
| Release invariant | Release-preflight test with unequal package versions | Fails before any release-side mutation. |

Run:

```bash
pnpm --filter @mindfoldhq/trellis test -- test/commands/update.integration.test.ts
pnpm --filter @mindfoldhq/trellis test -- test/regression.test.ts
pnpm --filter @mindfoldhq/trellis test
pnpm lint
pnpm typecheck
```

Use temporary test directories only. Do not run `trellis update` in the
repository root; verify `git diff -- .trellis/.version` remains empty.

## Rollback

- Before applying the fork-boundary update to any consumer project, back up
  that project's `.trellis/` directory through the existing update backup
  mechanism and preview with `trellis update --dry-run --migrate`.
- Revert the source commit(s) containing the `1.0.0` boundary, release-script
  changes, and templates together if validation fails; do not manually lower a
  consumer's `.trellis/.version` after files have been updated.
- Restore a consumer project from its `.trellis/.backup-<timestamp>/` backup
  if a migration is cancelled after file changes.

## Task-specific Exit Criteria

- The root `.trellis/.version` remains `0.6.2` and no root-consumer update was
  run.
- `1.0.0` is the sole first fork target and Core/CLI versions match exactly.
- A `0.6.x` temporary consumer fixture crosses the boundary once without any
  npm request or PATH-dependent session check.
- The source tree has no active public npm publication path or active
  source-managed update guidance that points to the upstream package.
