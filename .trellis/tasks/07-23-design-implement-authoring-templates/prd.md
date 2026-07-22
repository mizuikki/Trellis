# design.md / implement.md Authoring Guidance

## Goal

Add **semantic** authoring guidance for complex-task `design.md` / `implement.md`, with on-demand scaffolding — without polluting lightweight **PRD-only** tasks, and **without shipping Chinese (or bilingual) product templates**.

Product language policy matches current Trellis source:

- Shipped defaults (create skeleton, skill text, helper strings, workflow contract copy) are **English-only**.
- Runtime does **not** lint heading language or force `## Goal` to remain forever; agents may rewrite task docs for the project. Product still does not seed or document Chinese section catalogs.

## Background / Known Context

- `task.py create` seeds English `prd.md` (`Goal` / `Requirements` / `Acceptance Criteria` / `Notes`) only.
- No runtime check requires English H2 names after create.
- Session-start / continue routing today use **file presence** only for design/implement; `task.py start` does not validate design content.

## Requirements

1. Guidance is **Core + Triggered + Optional semantics**, not a hard 8-section English outline — shipped example headings and scaffold bodies are **English**.
2. Split planning readiness into two layers (see design):
   - **Machine state-transition hard gate:** `task.py start` rejects every present `design.md` / `implement.md` that is not a non-symlink regular UTF-8 file with non-whitespace content and no active `<!-- trellis:scaffold-unfilled -->` header sentinel. Existing jsonl behavior remains unchanged.
   - **Deterministic diagnostic routing:** SessionStart consumers inspect the same file states and report artifact-pending instead of complete; they do not themselves mutate or block task status.
   - **Agent authoring/routing rubric:** brainstorm plus continue/start guidance classify lightweight vs complex, require the applicable artifacts/jsonl, and review executable Core/triggered semantics; no H2-name lint. Markdown guidance is not described as a machine hard gate.
   - Runtime does not infer task complexity and does not add task metadata for it.
3. Every generated scaffold contains the sentinel exactly once immediately below its title. Brainstorm removes it only after that artifact's Core/triggered semantics pass authoring review. Session-start, continue routing, and `task.py start` must treat a present sentinel as **not planning-ready**.
4. Empty Optional sections must be **deleted**, not left as TBD. Pristine scaffold alone is **not** planning-ready.
5. **Product CLI:** `task.py scaffold <task> design|implement|all` only. **No** `create --complex`. Default `create` remains unchanged. `<task>` is an exact directory name, a unique suffix, or a path that passes the live-task boundary check; ambiguous suffixes fail.
6. Scaffold always takes an **explicit task** argument and writes only to a non-symlink live direct child of `.trellis/tasks/` with a non-symlink regular, UTF-8, parseable JSON-object `task.json` containing a non-empty string `title`; archive paths, repository-external paths, nested paths, and symlink escapes are rejected. The implementation revalidates the task directory before each target create and documents that its cross-platform concurrency guarantee covers target-file races, not adversarial replacement of the parent directory during the final filesystem-call window.
7. Scaffold **never overwrites** an existing path. Existing regular files, including empty files, report `skipped_exists`; directories, symlinks, and other non-regular target types report a hard error. Exclusive create prevents races. `all` attempts both targets where safe, reports every result, and exits non-zero if any target has a hard error. A successful skip means only “no unsafe write occurred,” not “the artifact is planning-ready.”
8. Lightweight may be PRD-only; complex needs prd + design + implement with **filled** Core content and no scaffold sentinel.
9. `implement.md` ≠ `implement.jsonl`.
10. Validation may be command lists **or** matrices/gates.
11. Optional archetypes (feature / remediation / audit) are English tips only.
12. A dedicated `common/task_artifacts.py` deep module owns artifact kinds/results, the only canonical scaffold bytes, live-task validation, readiness detection, and safe exclusive creation. `task.py` owns argparse/dispatch and calls this module; brainstorm invokes `task.py scaffold`; skills/workflows contain the shared semantic rubric but do not duplicate complete scaffold bodies.
13. This fork owns `marketplace/` as a normal tracked directory vendored from a pinned snapshot of `https://github.com/mindfold-ai/marketplace`; it does not maintain a Marketplace fork or preserve ongoing upstream synchronization.
14. The separate Marketplace-merge prerequisite is complete in `d01aee69`; `marketplace/workflows/**` are now same-repository product mirrors, not submodule outputs. The authoring feature treats this topology as its baseline and does not own or roll it back.
15. Product implementation follows the exact active **source → consumer → tracked output** matrix in `implement.md`; the completed Marketplace work is recorded separately as prerequisite evidence rather than future implementation scope.
16. **Product surface language: English-only**. No Chinese section catalogs in shipped assets.
17. **Semantic IDs** (`D-BOUND`, …) are product-internal vocabulary and test labels only — **not** a runtime schema and not required to remain in user task files after fill.
18. Docs/skills distinguish UI `DESIGN.md` (visual/brand) from tech task `design.md`.
19. D-RISK vs I-ROLL and D-TEST vs I-VAL content boundaries follow the design; implement references design rather than duplicating it.
20. Shipped command guidance uses the platform-rendered `{{PYTHON_CMD}}` placeholder where templates support placeholder resolution; generated output must use `python` on Windows and `python3` elsewhere.

## Acceptance Criteria

- [ ] Core/Triggered/Optional rubric text in skills and canonical scaffold bodies in the helper are English-only.
- [ ] Default `task.py create` still does not add design/implement.
- [ ] `task.py scaffold <task> design|implement|all` is the only new create-path for skeletons; no `create --complex`.
- [ ] Scaffold requires explicit task; argparse syntax errors return 2, while unknown/ambiguous/invalid task validation returns 1 with a clear stderr error.
- [ ] Scaffold accepts only a non-symlink live direct child of `.trellis/tasks/` with valid non-symlink regular task metadata and non-empty title; outside/archive/nested/symlink-escape/malformed-metadata targets fail without writes.
- [ ] Scaffold never overwrites existing regular files (including empty); exclusive create; a concurrent second writer that creates a regular file reports `skipped_exists` without clobbering.
- [ ] Existing directory, symlink, or other non-regular artifact target is not followed/replaced and produces a hard error.
- [ ] `scaffold all` attempts both targets, reports each result, creates missing targets, and returns non-zero iff any target has a hard error; `skipped_exists` is success.
- [ ] Shipped product text (new scaffold constants + guidance blocks) has no Chinese section catalog; scoped test, not whole-repo free grep.
- [ ] Both canonical scaffold bodies contain exactly one `<!-- trellis:scaffold-unfilled -->` sentinel.
- [ ] `task.py start` rejects a present design/implement path that is non-regular, symlinked, unreadable/non-UTF-8, empty/whitespace-only, or whose first five physical lines contain the exact standalone sentinel; SessionStart reports the same states as artifact-pending, and continue/start guidance routes the agent back to authoring review.
- [ ] Filled regular artifacts pass the machine gate after sentinel removal; later prose/code mentions do not trigger it.
- [ ] Machine-facing copy does not claim “artifacts complete” for pristine scaffold; agent rubric states Core must be filled before sentinel removal and start review.
- [ ] Lightweight missing design/implement is not a global error.
- [ ] Skill/workflow note UI `DESIGN.md` ≠ tech `design.md`.
- [ ] `common/task_artifacts.py` is the only canonical scaffold-body source and owns the artifact lifecycle contract; brainstorm calls scaffold instead of embedding/writing a duplicate body.
- [x] The Marketplace-merge prerequisite is complete in `d01aee69`: `.gitmodules` no longer declares marketplace, `marketplace/` is tracked by the main repository, and provenance records upstream commit `758398b89e159f4b6658383dd26c484da423ba93`.
- [x] Marketplace workflow mirrors are same-repository files and can be updated with their owning workflow contract; no Marketplace submodule commit or pointer bump is required.
- [ ] Every exact path in the active implementation matrix is updated or explicitly marked N/A with a reason; completed prerequisite evidence remains unchanged unless a regression is found.
- [ ] Python changes pass `pnpm --filter @mindfoldhq/trellis lint:py` in addition to tests/typecheck.
- [ ] Semantic IDs appear in product docs/tests as labels only; no requirement that user task files keep ID comments permanently.
- [ ] Scaffold commands render through `{{PYTHON_CMD}}` in shipped templates, with Windows and non-Windows assertions.
- [ ] Filesystem tests distinguish the guaranteed target-file race behavior from the documented stable-parent-directory assumption.

## Out of Scope

- Localizing Trellis product templates into Chinese.
- Enforcing that user task content must remain English after create.
- `create --complex` dual entry point.
- Permanent semantic-ID schema in user task files or runtime parsers of D-*/I-* markers.
- Body-hash or fixed-H2 readiness parsing; the only machine-readable authoring-state token is the scaffold sentinel.
- task.json new metadata, BMAD full chain, changing jsonl curated semantics beyond documenting interaction with scaffold, archive migration.
- Ongoing synchronization with `mindfold-ai/marketplace`, preserving Marketplace git history via subtree, or maintaining a separate Marketplace fork.
- Adding or redesigning Marketplace catalog entries beyond the pinned snapshot and workflow changes required by this scheme.
- Project-level heavy packs (execution logs, multi-agent review) as global defaults.
- Heading-name linter (English or Chinese).

## Constraints

- Package: `cli`; follow implement.md source→mirror matrix for sync.
- Global scaffold must stay short; heavy packs stay project-local.
- create must not seed empty design/implement.
- Scaffold must not write outside a validated live task directory.
- Marketplace migration was completed by its own prerequisite Trellis task; this scheme consumes the resulting tracked directory and must not restore the former submodule topology during feature rollback.
- **Ship English-only product text** (aligned with current source).

## Open Questions

- None for product behavior or repository ownership. Implementation may choose internal function and type names inside `common/task_artifacts.py`, but may not alter the module ownership, sentinel, path boundary, canonical-source, overwrite, exit-code, or vendored-Marketplace contracts above.
