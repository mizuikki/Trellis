# Implement - Fork package namespace migration

## Ordered Checklist

- [x] Inventory each active `@mindfoldhq/trellis` and
  `@mindfoldhq/trellis-core` reference and classify it as package contract,
  source import/tooling, current runtime guidance, or historical provenance.
- [x] Rename the CLI and Core package names to the `@mizuikki` namespace; add
  fork-maintainer contributor metadata without changing `author`, license, or
  copyright attribution.
- [x] Update the CLI workspace dependency, TypeScript Core imports, root pnpm
  filters, lint-staged commands, and active release-maintenance scripts.
- [x] Regenerate `pnpm-lock.yaml` through pnpm and verify the workspace resolves
  the renamed Core dependency.
- [x] Replace active npm/package instructions in source templates, dogfood
  platform files, skills, specs, and current documentation with fork
  source-checkout/build guidance. Keep historical manifests and archived
  records unchanged.
- [x] Review source template files and dogfood copies together; update both
  tracked forms without invoking `trellis update` in the repository root.
- [x] Existing build, import-resolution, lint, typecheck, and complete-suite
  coverage exercise the renamed workspace dependency; no separate behavior was
  introduced that needs a new regression test.
- [x] Run the validation matrix and classify all remaining upstream namespace
  hits before committing.

## Validation

| Check | Command or inspection | Expected result |
| --- | --- | --- |
| Workspace resolution | `pnpm install --lockfile-only` | Lockfile resolves the two `@mizuikki` workspace packages without registry access. |
| Build | `pnpm build` | Core and CLI build with fork namespace imports. |
| Tests | `pnpm test` | Complete Core and CLI suites pass. |
| Static checks | `pnpm lint` and `pnpm typecheck` | Both pass. |
| Active namespace audit | `rg -n '@mindfoldhq/trellis(-core)?'` with archives, journals, and historical manifests excluded | No active package contract or executable npm guidance remains. |
| Provenance audit | Inspect excluded manifests, archives, `UPSTREAM_SYNC.md`, and package attribution | Historical and legal references remain intentional and unchanged. |
| Root boundary | `git diff -- .trellis/.version` | Empty. |

## Results

| Check | Actual result |
| --- | --- |
| Workspace resolution | `pnpm install --lockfile-only` passed. A subsequent normal `pnpm install` refreshed the local workspace links; the lockfile remained current. |
| Build | `pnpm build` passed after the normal install. The first build after `--lockfile-only` failed because the existing `node_modules` link still used the old package name; this was local install state, not a lockfile failure. |
| Tests | `pnpm test` passed: Core 333 passed, 1 skipped; CLI 1,446 passed. |
| Static checks | `pnpm lint` and `pnpm typecheck` passed. |
| Active namespace audit | No tracked active `@mindfoldhq/trellis` or `@mindfoldhq/trellis-core` references remain; only this task's requirement text matches. |
| Provenance audit | Archived tasks, journals, migration manifests, `UPSTREAM_SYNC.md`, `LICENSE`, and `author: "Mindfold LLC"` remain intact. Both package manifests retain `AGPL-3.0-only` and add `mizuikki (fork maintainer)` as contributor metadata. |
| Root boundary | `git diff -- .trellis/.version` was empty. |

## Rollback

- Revert the namespace migration commit as one unit, including both package
  manifests, imports, tooling, templates, dogfood copies, and lockfile.
- Run `pnpm install --lockfile-only` after reverting package manifests if the
  lockfile was regenerated.
- Do not alter consumer `.trellis/` directories or the repository root
  `.trellis/.version`; this task has no consumer-side migration.

## Task-specific Exit Criteria

- CLI and Core package names, internal imports, workspace dependency, lockfile,
  and root tooling consistently use `@mizuikki`.
- Active runtime guidance does not direct users to upstream npm packages.
- AGPLv3 and upstream authorship/provenance are retained, with `mizuikki`
  represented only as fork maintainer/contributor metadata.
- Remaining upstream namespace occurrences are historical or explicit
  provenance, documented by the final audit.
