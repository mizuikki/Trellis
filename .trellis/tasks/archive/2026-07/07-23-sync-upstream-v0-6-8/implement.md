# Implement - Sync upstream to v0.6.8

## Ordered Checklist

- [x] Use upstream `bfa7f99d` as the semantic source and adapt only its Kimi
  platform changes; do not merge tag `v0.6.8` or import excluded gitlinks,
  release files, package versions, or deleted surfaces.
- [x] Add Kimi to the TypeScript data/function registries, CLI option, init
  option, configurator, template module, and Kimi-specific agent skill files.
- [x] Route shared workflow/bundled skills through neutral resolution and
  Kimi-private command/role skills through `.kimi-code/skills/`; keep
  configure and collect outputs byte-identical.
- [x] Add Kimi to both copies of the generated Python runtime registries and
  adapters. Use `kimi -p <prompt>` for non-interactive execution and
  `kimi --session <id>` for resume.
- [x] Reconcile Kimi workflow and `trellis-meta` documentation into the fork's
  canonical templates, then synchronize the tracked dogfood twins without
  replacing fork-specific lifecycle or namespace content.
- [x] Update focused README/spec wording and the supported-platform count;
  keep `README_CN.md` deleted.
- [x] Record the accepted Kimi import and evaluated/excluded `v0.6.8` surfaces
  in `UPSTREAM_SYNC.md`.
- [x] Add or adapt upstream Kimi tests, including an exact regression assertion
  that the run command omits the incompatible `--yolo` flag.
- [x] Inspect the final diff against the approved boundary and complete all
  validation and structural checks below.

## Validation

Run focused tests first:

```bash
pnpm --filter @mizuikki/trellis test -- \
  test/templates/kimi.test.ts \
  test/configurators/index.test.ts \
  test/configurators/platforms.test.ts \
  test/commands/init.integration.test.ts \
  test/commands/update.integration.test.ts \
  test/regression.test.ts \
  test/templates/trellis.test.ts
```

Pass condition: every selected test passes and the Kimi adapter assertion is
`["kimi", "-p", prompt]`.

Run package and repository gates:

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm test
```

Pass condition: all commands exit zero.

Run structural checks:

```bash
cmp .trellis/workflow.md packages/cli/src/templates/trellis/workflow.md
cmp .trellis/scripts/common/active_task.py packages/cli/src/templates/trellis/scripts/common/active_task.py
cmp .trellis/scripts/common/cli_adapter.py packages/cli/src/templates/trellis/scripts/common/cli_adapter.py
cmp .trellis/scripts/common/task_store.py packages/cli/src/templates/trellis/scripts/common/task_store.py
test ! -e .github/workflows/publish.yml
test ! -e docs-site
test -f marketplace/VENDORED_FROM.md
test "$(git ls-files -s marketplace | awk '$1 == 160000 { print $1 }')" = ""
test "$(node -p "require('./packages/cli/package.json').name")" = "@mizuikki/trellis"
test "$(node -p "require('./packages/cli/package.json').version")" = "1.0.0"
test "$(node -p "require('./packages/core/package.json').name")" = "@mizuikki/trellis-core"
test "$(node -p "require('./packages/core/package.json').version")" = "1.0.0"
test -z "$(
  {
    git diff --name-only origin/main...HEAD -- packages/cli/src/migrations/manifests/0.6.8.json
    git diff --cached --name-only -- packages/cli/src/migrations/manifests/0.6.8.json
    git diff --name-only -- packages/cli/src/migrations/manifests/0.6.8.json
  }
)"
test -z "$(
  {
    git diff --name-only origin/main...HEAD
    git diff --cached --name-only
    git diff --name-only
    git ls-files --others --exclude-standard
  } | grep 'marketplace~' || true
)"
test -z "$(git grep -nE '^(<<<<<<<|=======|>>>>>>>)' -- ':!pnpm-lock.yaml' || true)"
```

Pass condition: canonical/template twins match, fork-owned versions and
topology remain intact, the historical upstream manifest is unchanged, and no
merge artifacts remain.

## Rollback

Before commit, restore only the files listed by this task's final diff to the
branch baseline and remove newly added Kimi files. After commit, revert the
single task commit. No migration, package version, submodule, or consumer
state rollback is required because this task changes none of those surfaces.

## Task-specific Exit Criteria

- The approved selective boundary is preserved and `UPSTREAM_SYNC.md` records
  both accepted and excluded upstream surfaces.
- Kimi init/update/runtime behavior is present, current-doc compatible, and
  covered by focused tests.
- Canonical/generated twin checks and the complete quality gate pass.
- No unresolved conflict, external API uncertainty, or fork-version/topology
  drift remains before the standard Trellis check, spec-review, and commit
  gates.
