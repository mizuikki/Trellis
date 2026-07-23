# Implement - Fork package namespace migration

## Ordered Checklist

- [ ] Inventory each active `@mindfoldhq/trellis` and
  `@mindfoldhq/trellis-core` reference and classify it as package contract,
  source import/tooling, current runtime guidance, or historical provenance.
- [ ] Rename the CLI and Core package names to the `@mizuikki` namespace; add
  fork-maintainer contributor metadata without changing `author`, license, or
  copyright attribution.
- [ ] Update the CLI workspace dependency, TypeScript Core imports, root pnpm
  filters, lint-staged commands, and active release-maintenance scripts.
- [ ] Regenerate `pnpm-lock.yaml` through pnpm and verify the workspace resolves
  the renamed Core dependency.
- [ ] Replace active npm/package instructions in source templates, dogfood
  platform files, skills, specs, and current documentation with fork
  source-checkout/build guidance. Keep historical manifests and archived
  records unchanged.
- [ ] Review source template files and dogfood copies together; update both
  tracked forms without invoking `trellis update` in the repository root.
- [ ] Add or update regression coverage for package-name dependent behavior if
  the existing test suite does not cover the renamed workspace import.
- [ ] Run the validation matrix and classify all remaining upstream namespace
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
