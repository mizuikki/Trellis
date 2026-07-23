# Upstream v0.6.8 Assessment

## Repository Evidence

- Fork head at assessment time: `be25b841` on `main`.
- Upstream release tag: `v0.6.8` at `dc68f5a9`.
- Shared ancestor: `a0d749e9`.
- Divergence from the shared ancestor: 35 fork-only commits and 5
  upstream-only commits.
- A trial `git merge-tree --write-tree main v0.6.8` reported 21 conflicts,
  including fork-owned package versions, publish policy, deleted submodules,
  the vendored Marketplace, workflow text, and generated skill copies.

## Commit Assessment

| Commit | Change | Decision | Reason |
| --- | --- | --- | --- |
| `bfa7f99d` | First-class Kimi Code support | Adapt and import | Adds missing platform behavior, templates, runtime adapters, and tests. |
| `65a83d7d` | Build before test in CI | Already satisfied | Fork CI already builds before `pnpm test`. |
| `26ca25f8` | Upstream manifest and docs-site pointer | Exclude | Fork uses its own version line and removed the docs-site submodule. |
| `c9011ae0` | Set packages to `0.6.8` | Exclude | Fork packages must remain on the `1.0.0` compatibility line. |
| `dc68f5a9` | Publish workflow ordering | Exclude | Fork intentionally removed public npm publishing. |

The Kimi commit's Marketplace gitlink is also excluded. This fork owns
`marketplace/` as a normal vendored directory with no ongoing submodule sync
contract, and Kimi runtime support does not depend on the gitlink update.

## Current Kimi Contract Check

Official Kimi Code documentation was checked on 2026-07-23:

- Project skills are discovered from both `.kimi-code/skills/` and
  `.agents/skills/`, and manual invocation uses `/skill:<name>`:
  https://www.kimi.com/code/docs/en/kimi-code-cli/customization/skills.html
- The built-in sub-agents are `coder`, `explore`, and `plan`:
  https://www.kimi.com/code/docs/en/kimi-code-cli/customization/agents.html
- `--session <id>` resumes a session and `-p/--prompt` is the non-interactive
  mode. In prompt mode, regular tool calls already use the automatic
  permission policy. Current Kimi rejects `--prompt` combined with `--yolo`:
  https://www.kimi.com/code/docs/en/kimi-code-cli/reference/kimi-command.html

Therefore the upstream `build_run_command()` value
`["kimi", "-p", prompt, "--yolo"]` must not be copied verbatim. The adapted
fork implementation must use `["kimi", "-p", prompt]` and add a regression
assertion for the exact argument list.

## Recommended Import Boundary

Import the Kimi registry/configurator/templates, CLI flag, generated Python
runtime support, workflow classification, focused documentation, and tests.
Reconcile generated copies with the fork's canonical templates instead of
taking upstream conflict resolutions wholesale. Record `v0.6.8` and
`bfa7f99d` in `UPSTREAM_SYNC.md`, including the excluded release-policy
surfaces.
