# Design — design.md / implement.md Authoring Guidance

## 1. Boundary

| In scope | Out of scope |
|----------|--------------|
| Global **semantic contract** (Core / Triggered / Optional) | Hard-coded mandatory English 8-section outline as lint |
| `task.py scaffold <task> design` / `implement` / `all` | `create --complex`; create seeds design/implement |
| English-only **product** skills/helpers/workflow copy | Shipping Chinese or bilingual heading catalogs |
| Dual-layer readiness: mandatory sentinel gate + agent authoring rubric | Parsing H2 names or Semantic IDs as runtime schema |
| Optional English archetype tips | Project-heavy packs as Trellis defaults |
| Exact source→consumer→tracked-output matrix for shipped surfaces | Ad-hoc “sync if duplicated” at implement time |
| Consume `marketplace/` as the same-repo vendored baseline created by the completed prerequisite migration | Maintaining a Marketplace fork, subtree history, or ongoing upstream sync |

**Language policy (product = current source):**

- Shipped skeletons, skill examples, and helper strings: **English only**.
- Runtime does not enforce heading language on task files after create (same as prd today).
- This scheme does **not** add Chinese example H2s to the product.

**Semantic ID policy:**

- IDs such as `D-BOUND`, `I-STEPS` are **product-internal vocabulary and test labels** only.
- They are **not** a runtime schema and **must not** be required to remain permanently in user `design.md` / `implement.md`.
- Scaffold bodies may include optional HTML comments with IDs for authors/tests; agents may delete them when filling.
- The separate `<!-- trellis:scaffold-unfilled -->` sentinel is the only machine-readable scaffold lifecycle token; it is not a Semantic ID.

**On-disk task shape (unchanged):**

```text
.trellis/tasks/<MM-DD-slug>/
├── task.json
├── prd.md                 # always on create (English seed)
├── design.md              # complex / scaffold
├── implement.md           # complex / scaffold
├── implement.jsonl        # conditional seed
├── check.jsonl
└── research/              # optional
```

## 2. Design conclusions (for implement)

1. Guidance = **minimum questions to answer**, not a clone of long successful designs.
2. **Core** is stable across tasks; **Triggered** content becomes required when its condition applies; **Optional** expands or is omitted.
3. Heading text is a **label**, not an API — product examples use English; no H2-name lint.
4. create does not seed design/implement; `task.py scaffold` writes a **short English prompt skeleton**; brainstorm invokes that command, fills Core, and deletes empty Optional content.
5. **Dual-layer readiness** (mandatory `task.py start` state-transition gate plus deterministic SessionStart diagnostics vs agent authoring rubric) — see §3.7. Runtime blocks pristine scaffolds at the start transition but does not evaluate prose semantics.
6. **Product CLI:** only `task.py scaffold <task> design|implement|all`; no `create --complex`.
7. Validation = **reproducible checks** (commands and/or matrices), not “must have a bash fence”.
8. **No Chinese in shipped product text** (templates / skills / helpers / workflow contract).
9. Semantic IDs = internal vocabulary/test labels only (§1 policy).
10. A dedicated `common/task_artifacts.py` deep module owns artifact kinds/results, canonical scaffold bytes, live-task validation, readiness detection, and exclusive creation; brainstorm invokes the CLI instead of embedding another complete body.
11. Scaffold writes only inside validated live task directories and has deterministic per-target exit semantics.
12. This fork owns Marketplace workflow mirrors in the main repository after the completed pinned-snapshot migration in `d01aee69`; no submodule commit/pointer choreography remains, and the authoring feature does not own rollback of that topology.

## 3. Semantic contract

### 3.1 `design.md` — Core (complex should cover)

| ID (doc/test label) | Question | Example headings (English product examples only) |
|---------------------|----------|--------------------------------------------------|
| D-BOUND | What changes / does not? Boundaries with neighbors? | Boundary / Scope Boundary |
| D-MECH | Key mechanisms or technical decisions? Why? | Mechanisms / Decisions / (problem-sliced H2s OK) |
| D-RISK | Compatibility, migration strategy, failure modes, **rollback decisions** (strategy, not step list) | Risks & Compatibility / Failure Modes |

Notes:

- D-MECH may split into multiple H2s by problem slice.
- Short remediations may be only boundary + mechanisms + risks — valid.
- **D-RISK ≠ I-ROLL:** design owns strategy; implement owns concrete rollback steps (see §3.8).

### 3.2 `design.md` — Triggered / Optional (write when triggered; else omit)

| ID | Trigger / rule | Example headings |
|----|----------------|------------------|
| D-OVERVIEW | Optional for multi-subsystem orientation | System Overview |
| D-FLOW | **Required when triggered** by non-trivial runtime, state, or data flow | Data & Control Flow |
| D-CONTRACT | **Required when triggered** by cross-component APIs, events, files, or persistence contracts | Contracts |
| D-ALT | Optional when real alternatives affected the decision | Alternatives Considered |
| D-TEST | Optional design-level verification **strategy** and coverage intent (not shell recipes) | Test Strategy |
| D-HANDOFF | Optional freeze table when implementation must preserve multiple decisions | Design Conclusions / Freeze |

“Optional” never means “omit load-bearing information.” D-FLOW and D-CONTRACT become required whenever their trigger applies; the agent rubric must check the trigger, not merely count sections.

### 3.3 `implement.md` — Core

| ID (doc/test label) | Question | Example headings |
|---------------------|----------|------------------|
| I-STEPS | Ordered, checkable work? | Ordered Checklist / Steps / Phase A–N |
| I-VAL | How to **reproduce** verification? Commands, scenario matrix, pass criteria | Validation / Validation Commands / Validation Matrix |
| I-ROLL | Concrete rollback steps, checkpoints, files/commands; explicit N/A with reason only when rollback is genuinely unnecessary | Rollback / Risky Files |
| I-EXIT | Task-specific blockers and entry/exit criteria; reference global workflow gates instead of copying them | Pre-start Gates / Review Gate / Definition of Done |

**I-VAL acceptable forms:** command list, scenario matrix, blocking gate table, threat/regression checklist when relevant.

**I-VAL ≠ D-TEST:** implement references design strategy; does not re-state architecture rationale.

### 3.4 `implement.md` — Optional (not global defaults)

| ID | Notes |
|----|-------|
| I-LOG | Execution logging rules — project-level |
| I-MULTI | Multi-agent review gates — project-level |
| I-NONGOAL | Explicit non-goals — useful on large tasks |
| I-PROGRESS | Progress log — long tasks |

### 3.5 Anti-fill rules (hard)

1. Unused Optional sections: **delete**, no TBD placeholders.
2. “All sections present but empty” is not planning-ready.
3. **Pristine scaffold** (English skeleton with only prompts/comments, no real decisions/steps) is **not** planning-ready.
4. Authoring rubric must **not** require exact English H2 string match (and must not require Chinese H2s either).
5. Complex pass (agent rubric) = Core is executable/reviewable by another agent, not section count ≥ N.
6. Triggered D-FLOW / D-CONTRACT content may not be omitted merely because the table classifies it outside the universal Core.
7. I-ROLL may say N/A only with a concrete reason; I-EXIT records task-specific gates and does not duplicate the global workflow checklist.

### 3.6 Archetype tips (optional, English only)

| Archetype | Extra tips |
|-----------|------------|
| Feature / foundation | Prefer D-FLOW, D-CONTRACT; phase implement |
| Remediation / PR fix | Precise change boundary + regression points; may be short |
| Audit / recon | Evidence standard, state model, parallel division of labor |

Project skills may add heavy packs; they must not force Trellis global defaults to match one repo’s 400-line style.

### 3.7 Dual-layer planning readiness

Planning readiness uses one mandatory lifecycle sentinel without attempting prose parsing, while distinguishing code-enforced state transitions from diagnostic and agent guidance.

| Layer | Who | What |
|-------|-----|------|
| **Machine state-transition hard gate** | `task.py start` | Before any status, hook, or pointer mutation, reject each present `design.md` / `implement.md` unless it is a non-symlink regular UTF-8-readable file with non-whitespace content and no exact standalone `<!-- trellis:scaffold-unfilled -->` line in its first five physical lines. Preserve existing jsonl behavior. |
| **Deterministic diagnostic routing** | SessionStart hooks/utilities | Inspect the same artifact states and report artifact-pending instead of complete. These consumers guide the next action; they do not themselves block or mutate task status. |
| **Agent authoring/routing rubric** | brainstorm / continue and start guidance / human review | Classify lightweight vs complex, require the applicable artifacts/jsonl, then ensure Core and triggered semantics are executable/reviewable; anti-fill; no H2 lint. The agent removes a file's sentinel only after that file passes this review. Markdown guidance is not a machine gate. |

Runtime validates artifacts that are present but does not infer task complexity or treat missing design/implement files as globally erroneous; PRD-only lightweight tasks remain valid.

**Sentinel contract:**

1. Exact token: `<!-- trellis:scaffold-unfilled -->`.
2. Each canonical scaffold contains it exactly once, immediately below the title.
3. It is removed independently from `design.md` and `implement.md` after each artifact passes the agent rubric.
4. A present sentinel blocks `task.py start`, causes SessionStart diagnostics to report artifact-pending, and causes continue/start guidance to route the agent to “scaffold present; fill and review Core”.
5. “Present” means an exact standalone sentinel line within the first five physical lines. A later literal mention in prose or a code sample is inert.
6. An artifact path that exists but is a symlink/non-regular type, is unreadable/non-UTF-8, or whose decoded content is empty/whitespace-only also fails the machine gate.
7. Runtime does not inspect Semantic IDs, headings, body hashes, or prose quality.
8. Existing non-empty regular free-form files without an active header sentinel remain compatible.

**Wording rule:** product copy must not say “planning artifacts are complete” when either present artifact is invalid, empty, or still contains the active header sentinel.

### 3.8 design vs implement content boundaries

| Topic | design.md | implement.md |
|-------|-----------|--------------|
| Risk / rollback | D-RISK: compatibility, migration, failure modes, **rollback decision** | I-ROLL: **steps**, checkpoints, files/commands; N/A only with reason |
| Verification | D-TEST (optional): strategy & coverage | I-VAL: reproducible commands/matrix & pass criteria |
| Mechanisms | D-MECH: how/why | I-STEPS: do-in-order; may **link** to design decisions, not copy them |
| Readiness | Design-specific unresolved decisions | I-EXIT: task-specific blockers/exit criteria; link to global workflow gates |

implement.md should **reference** design decisions, not duplicate design prose.

### 3.9 UI DESIGN.md vs tech design.md

| Name | Meaning |
|------|---------|
| Task `design.md` | Technical design for the Trellis task (this scheme) |
| UI / brand `DESIGN.md` | Visual system / brand kit for UI agents (unrelated path/name) |

Skills and workflow short notes must say they are **not** the same artifact.

### 3.10 Marketplace ownership in this fork

The Marketplace merge was completed as a separate prerequisite because it changes repository topology independently of this authoring feature. Main-repository commit `d01aee69` imported upstream commit `758398b89e159f4b6658383dd26c484da423ba93` (tree `784f1a11f1a01aa0469333889e4e123620452807`). The authoring feature treats the resulting topology as an existing baseline.

| Topic | Decision |
|-------|----------|
| Upstream source | `https://github.com/mindfold-ai/marketplace`, pinned at `758398b89e159f4b6658383dd26c484da423ba93` |
| Main-repo shape | `marketplace/` is a normal tracked directory; only `docs-site` remains a submodule |
| History | Import one content snapshot plus `marketplace/VENDORED_FROM.md`; do not preserve upstream history with `git subtree` |
| Ongoing maintenance | No automatic or contractual upstream sync; future changes are owned by this fork |
| Registry defaults | Point the fork's default marketplace URLs at `mizuikki/Trellis/main/marketplace` |
| Release behavior | Marketplace changes are staged and committed with the owning main-repository feature |
| Workflow parity | Native, TDD, and channel workflow mirrors are same-repository files and are tested locally |

The completed Marketplace-merge task removed submodule-specific specs/release instructions and proved that a fresh checkout needs only the remaining `docs-site` submodule. Product implementation rechecks this invariant but does not repeat the migration.

## 4. Prompt skeleton (English product samples)

Comments with `D-*` / `I-*` are **optional author aids** (may be stripped after fill). They are not a permanent user-doc contract.
The fenced samples below specify the intended shape for review only; they are not a shipped runtime source. Product implementation defines the complete bodies only in `common/task_artifacts.py`, and brainstorm invokes the CLI rather than copying these fences.

**design (scaffold / first complex write):**

```markdown
# Design — <title>
<!-- trellis:scaffold-unfilled -->

## Boundary
<!-- optional label D-BOUND: fill before start review -->
<!-- What changes / does not / boundaries with neighbors -->

## Mechanisms and Decisions
<!-- optional label D-MECH: split into multiple H2s if needed -->
<!-- Key ownership / algorithms / responsibilities / decisions.
Add dedicated Flow or Contracts content when those triggers apply. -->

## Risks, Compatibility, and Failure Modes
<!-- optional label D-RISK: strategy only — concrete rollback steps go in implement.md -->

<!-- Add only when triggered/useful: System Overview, Data & Control Flow,
Contracts, Alternatives Considered, Test Strategy, Design Conclusions.
Do not leave empty Optional sections. -->
```

**implement:**

```markdown
# Implement — <title>
<!-- trellis:scaffold-unfilled -->

## Ordered Checklist
<!-- optional label I-STEPS -->
- [ ] ...

## Validation
<!-- optional label I-VAL: commands and/or matrix — must be reproducible -->
<!-- Reference design test strategy; do not restate architecture -->

## Rollback
<!-- optional label I-ROLL: concrete steps / files / commands; N/A requires a reason -->

## Task-specific Exit Criteria
<!-- optional label I-EXIT: unresolved blockers and task-specific gates;
reference the global Trellis workflow rather than copying its standard checklist -->
```

## 5. Control flow

```text
task.py create
  → task.json + English prd.md [+ jsonl seed if sub-agent]
  → no design/implement

task.py scaffold <task> design|implement|all   # required explicit <task>
  → task_artifacts validates live direct-child task boundary + regular task.json
  → snapshot/revalidate the non-symlink task directory before each target create
  → exclusive create canonical English skeleton for missing targets only
  → each skeleton contains <!-- trellis:scaffold-unfilled --> exactly once
  → never overwrite existing paths (including empty files)
  → report per-target: created | skipped_exists | error

brainstorm
  → lightweight? → converge prd → agent rubric → start review → start
  → complex?
       → if design/implement missing: invoke task.py scaffold <task> all
       → fill Core; delete empty Optional; strip optional ID comments if desired
       → remove each artifact's scaffold sentinel only after its rubric passes
       → optional archetype tips
       → sub-agent platforms: real jsonl rows
       → agent rubric: reject pristine scaffold as “ready”
       → user confirms → task.py start
```

```text
prd (what) → design Core (how/strategy) → implement Core (steps+verify+rollback steps) → jsonl (manifest)
```

## 5.1 CLI contract (`task.py scaffold`)

```text
python3 .trellis/scripts/task.py scaffold <task> design|implement|all
```

| Rule | Behavior |
|------|----------|
| `<task>` | Required. Accept an exact task-directory name, a unique suffix, or a path. Reject an ambiguous suffix. Do **not** default to session active task. Resolution is followed by the boundary checks below. |
| Resolution order | For a plain name: exact direct-child match first, then collect all direct-child suffix matches; one match succeeds, zero is unknown, more than one is ambiguous. For a path: resolve it, then apply the same live-task boundary checks. Do not reuse a “first suffix wins” result. |
| Valid task boundary | Resolved path must be a non-symlink real direct child of the repository's `.trellis/tasks/`, must not be `archive/` or below it, and must contain a non-symlink regular UTF-8 `task.json` that parses to a JSON object with a non-empty string `title`. Reject repository-external, nested, symlink-escape, and malformed-metadata paths before any write. |
| Target missing | Exclusive create English skeleton; exit 0 on full success. |
| Regular target file exists (including empty) | Skip write; report `skipped_exists`; do not truncate it. For empty/whitespace content, also tell the user it remains not planning-ready until filled. |
| Target is a directory, symlink, or other non-regular type | Do not follow or replace it; report `error_invalid_target` and return non-zero. |
| `all` partial | Process `design.md` then `implement.md`; attempt both and report both outcomes. `created` and `skipped_exists` are success. Continue after a per-target hard error, then return non-zero if either target reported `error_*`. |
| Task-level failure | Missing CLI argument/choice is argparse exit 2. Unknown, ambiguous, or invalid task is exit 1 with one stderr error and no target attempts. |
| Per-target output | After task validation, emit one line per requested filename: `design.md: created` / `implement.md: skipped_exists` on stdout, or `<filename>: error_<code>: <message>` on stderr. `all` processes and reports `design.md` before `implement.md`. |
| Final exit | 0 when every requested target is `created` or `skipped_exists`; 1 when any requested target reports `error_*`. For `all`, always attempt the second target after a first-target error unless task-level validation failed. |
| Concurrency | Use one exclusive-create operation per target. After losing the race, report `skipped_exists` only if `lstat` shows a regular non-symlink file; otherwise report `error_invalid_target`. Never overwrite. |
| Parent-directory race scope | Revalidate the same non-symlink resolved direct-child task directory immediately before each exclusive create. The portable contract guarantees target-file races; it assumes the parent directory is not adversarially replaced during the final filesystem-call window. Do not claim stronger cross-platform atomic path binding without a platform-specific implementation and tests. |
| Sentinel | Every created file contains exactly one `<!-- trellis:scaffold-unfilled -->` immediately below the title; runtime recognizes it only as an exact standalone line in the first five physical lines. The CLI never removes it. |
| Excluded | `create --complex`. |

## 6. Module ownership

| Module | Role |
|--------|------|
| brainstorm skill | English semantic tables/rubric; invoke scaffold CLI for missing artifacts; complex fill; remove sentinel after review; anti-fill; UI DESIGN.md note. It does **not** embed a complete scaffold body. |
| `common/task_artifacts.py` | Deep artifact-lifecycle module: typed artifact kinds/results, **only canonical scaffold-body source**, scaffold-specific live-task validation, readiness detection, parent revalidation, safe exclusive creation, and `cmd_scaffold` |
| `task_store.py` | Existing task CRUD and default `prd.md` only; no design/implement scaffold knowledge |
| `task.py` | CLI parser/dispatch plus mandatory start-time artifact-readiness rejection via `task_artifacts` |
| workflow.md + session-start / continue | Lightweight vs complex; mandatory invalid/empty/header-sentinel routing; jsonl ≠ implement; short; English |
| Project skill | I-LOG, I-MULTI, etc. |
| Full path list | implement.md exact **Source → consumer → tracked output** matrix |

## 7. Alternatives

| Option | Verdict |
|--------|---------|
| A. create seeds empty design/implement | No |
| B. Prose-only (status quo) | Insufficient |
| C. Fixed English 8-section canonical | No — too rigid |
| D. Core/Triggered/Optional semantics + English prompt skeleton + on-demand safe scaffold | **Yes** |
| create --complex dual entry | **No** |
| Semantic IDs as runtime schema / permanent user-doc requirement | **No** |
| E. Heavy BMAD / 400-line global default | No (project override OK) |

## 8. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Scaffold or invalid artifact fools “file exists” complete signal | Mandatory start-transition gate in `task.py start`, matching SessionStart diagnostics, and explicit continue/start authoring guidance |
| Agents fill Optional with fluff | Anti-fill + agent rubric; no section-count pass |
| Core too vague | Question table + English examples; IDs as doc labels only |
| Users expect Chinese product templates | English product surface; task body language free after seed |
| Skill vs helper drift | `task_artifacts.py` alone owns scaffold bytes; skills share only the Semantic-ID rubric |
| Tests lock exact H2 set | Forbid fixed-H2 assertions |
| Overwrite races / empty-file wipe | Never overwrite exists; exclusive create |
| Path resolves outside live tasks | Resolve, then require a non-symlink live direct child plus regular task.json before writes |
| Cross-platform command copy uses the wrong Python executable | Shipped skills use `{{PYTHON_CMD}}`; configurator tests assert `python` on Windows and `python3` elsewhere |
| Parent directory changes after validation | Revalidate before each create and state the stable-parent threat model; target-file races remain protected by exclusive create |
| D/I duplicated prose | §3.8 boundaries |

## 9. Compatibility and rollback

- Existing non-empty regular UTF-8 free-form design/implement without an active header sentinel remain valid; scaffold never overwrites any existing path.
- PRD-only lightweight remains valid.
- Marketplace topology migration is the existing baseline and has its own history; rolling back this feature must leave `marketplace/` as a tracked main-repository directory.
- Product rollback: remove scaffold/helper/skill paragraphs and sentinel checks together; existing sentinel-bearing files must be filled/reviewed or have the marker removed before rollback.
- No `task.json` field changes.
