# Trellis Brainstorm

## Non-Negotiable Planning Contract

A request to build, implement, fix, refactor, or "go ahead" is not approval to leave planning. Task-creation consent is also not implementation approval.

For every non-trivial task, the user must respond at least once after the initial request before implementation begins. If no clarification is needed, that response must approve the final planning summary described below.

While any user-owned product, scope, UX, compatibility, risk, or acceptance decision remains unresolved, end the turn with exactly one highest-value question. Do not edit product code, dispatch implementation, or run `task.py start`.

## Non-Negotiable Evidence Rule

If a question can be answered by exploring the codebase, explore the codebase instead.

This is mandatory. Before asking the user a question, first check whether the answer is already available in code, tests, configs, docs, existing specs, or task history.

Do not ask the user to confirm facts that the repository can answer. Ask only for product intent, preference, scope, risk tolerance, acceptance behavior, or decisions that remain ambiguous after inspection.

Repository evidence establishes current behavior and technical constraints. The user's intended behavior, feature scope boundaries, and UX preferences are never answerable by repository evidence alone, even when an existing pattern exists; existing patterns are options and recommendation evidence, not decisions.

---

Use this skill during Phase 1 planning to turn the user's request into clear requirements and planning artifacts.

## Preconditions

Use this skill only after task-creation consent has been given and the user is ready to enter Trellis planning.

If no task exists yet, create one:

```bash
TASK_DIR=$({{PYTHON_CMD}} ./.trellis/scripts/task.py create "<short task title>" --slug <slug>)
```

Use a concise title from the user's request. Use a slug without a date prefix. `task.py create` adds the `MM-DD-` directory prefix automatically.

`task.py create` creates the default `prd.md`. Update that file with the current understanding before asking follow-up questions.

## Planning Flow

1. Capture the user's request and initial known facts in `prd.md`.
2. Inspect available evidence before asking questions:
   - code, tests, fixtures, and configs
   - README files, docs, existing specs, and domain notes
   - related Trellis tasks, research files, and session history when present
3. Separate what you found into:
   - confirmed facts
   - product intent still needed from the user
   - scope or risk decisions still needed from the user
   - likely out-of-scope items
4. If a user-owned decision remains, ask the single highest-value question, include your recommendation and trade-off, then stop. Do not perform implementation work in the same turn.
5. After each user answer, update `prd.md`, recompute the decision inventory, and repeat from step 2.
6. When no user-owned decision remains, create or update `design.md` and `implement.md` for complex tasks.
7. Run the requirement convergence gate, then the PRD convergence pass.
8. Present the final planning summary and stop. Do not run `task.py start` or edit product code in the same turn.
9. Only a subsequent user message that explicitly approves the latest planning summary authorizes `task.py start` and implementation. If the artifacts change materially after approval, repeat the final review.

Do not invent a project-specific product/spec hierarchy. If the repository already has product, domain, or spec docs, use them. If it does not, proceed with the evidence that exists.

## Question Rules

Ask only one question per message.

Each question must include:

- the decision needed
- why the answer matters
- your recommended answer
- the trade-off if the user chooses differently

Do not ask process questions such as whether to search, inspect files, or continue brainstorming. Do the evidence work directly. Ask the user only when the remaining issue is a product decision, preference, scope boundary, or risk tolerance choice.

Recommendations are not default selections. Never choose a recommended product decision on the user's behalf merely because the user asked for implementation.

Do not manufacture clarification questions when the request and repository evidence already resolve every decision. In that case, proceed directly to the final planning summary, which still requires a subsequent explicit approval.

The final review is a required phase-transition gate, not a prohibited process question. Task-creation consent, the initial implementation request, and approval given before the latest final summary do not satisfy this gate.

## Thinking Framework: First Principles Analysis

When requirements are vague, solutions feel over-engineered, or you're about to add complexity "because everyone does" — decompose to fundamental truths before reasoning upward.

### Step 1: Restate the Problem

Strip away implementation details to one sentence.

> Bad: "We need to add Redis caching to the user profile endpoint"
> Good: "User profile data takes too long to load"

### Step 2: List Fundamental Truths

What is absolutely true (not opinion or convention)?

| Category | Examples |
|----------|----------|
| **Physical constraints** | Network latency ≥ 0, disk I/O has limits |
| **Business rules** | "Users must see their own data" |
| **Technical invariants** | "Data must be consistent" |
| **User needs** | "The user wants X within Y seconds" |

### Step 3: Challenge Assumptions

For each component of the current plan:

- **Fact or convention?** "We always use REST" — why?
- **What if we removed this?** If nothing breaks, it's unnecessary.
- **Solving the actual problem or a symptom?** Trace the causal chain.
- **Who benefits from this complexity?** If "nobody", simplify.

### Step 4: Build Up from Truths

1. Start with the minimum viable mechanism satisfying all truths
2. Add complexity only when a specific truth demands it
3. Each addition must answer: "Which truth requires this?"

### Step 5: Validate

- Does the solution solve the original problem?
- What assumptions need verification?
- What's the simplest experiment to test this?

## Requirement Convergence Gate

Before final review, verify all of the following:

- the user outcome and product value are explicit
- in-scope and out-of-scope behavior are explicit
- acceptance criteria describe observable outcomes
- user-owned product, scope, UX, compatibility, and risk decisions are resolved
- blocking open questions are empty
- technical unknowns are researched or explicitly deferred without changing MVP behavior

Lightweight tasks may omit `design.md` and `implement.md`; they may not skip evidence inspection, requirement convergence, final review, or fresh implementation approval.

The final planning summary must show Goal, In Scope, Out of Scope, Acceptance Criteria, Key Decisions, relevant Risks or Deferred Items, and artifact status.

## Artifact Rules

`prd.md` records requirements and acceptance:

- goal and user value
- confirmed facts
- requirements
- acceptance criteria
- out of scope
- open questions that still block planning

Lightweight tasks may remain PRD-only. Complex tasks require technical design or an ordered multi-step execution plan; they must have `prd.md`, `design.md`, and `implement.md`. If either complex artifact is missing, run:

```bash
{{PYTHON_CMD}} ./.trellis/scripts/task.py scaffold <task> all
```

The scaffold is a prompt, not completed planning. An artifact is not ready when its path is non-regular or a symlink, unreadable or non-UTF-8, empty, or still has the exact `<!-- trellis:scaffold-unfilled -->` line in its first five lines.

### Technical `design.md`

Core questions for every complex task:

| ID | Required answer |
|----|-----------------|
| D-BOUND | What changes, what does not, and where are the boundaries? |
| D-MECH | What mechanisms and technical decisions implement the behavior, and why? |
| D-RISK | What compatibility, migration, failure-mode, and rollback-strategy decisions apply? |

Triggered or optional questions:

| ID | Rule |
|----|------|
| D-OVERVIEW | Optional orientation for multiple subsystems. |
| D-FLOW | Required for non-trivial runtime, state, or data flow. |
| D-CONTRACT | Required for cross-component API, event, file, or persistence contracts. |
| D-ALT | Optional when real alternatives affected the decision. |
| D-TEST | Optional verification strategy and coverage intent, not shell recipes. |
| D-HANDOFF | Optional decision freeze when implementation must preserve several conclusions. |

### Execution `implement.md`

| ID | Required answer |
|----|-----------------|
| I-STEPS | What is the ordered, checkable work? |
| I-VAL | How can another agent reproduce verification, including pass criteria? |
| I-ROLL | What concrete rollback steps, checkpoints, files, or commands apply? Use N/A only with a reason. |
| I-EXIT | What task-specific blockers and entry/exit criteria apply? Reference global workflow gates instead of copying them. |

Project-specific plans may add I-LOG, I-MULTI, I-NONGOAL, or I-PROGRESS when useful; they are not global defaults. D-RISK owns rollback strategy while I-ROLL owns concrete rollback actions. D-TEST owns design-level coverage intent while I-VAL owns reproducible checks. `implement.md` references design decisions instead of duplicating them.

### Authoring Review

- Delete unused Optional sections instead of leaving TBD placeholders.
- Reject empty sections and pristine prompt-only scaffolds as planning-ready.
- Do not lint or require fixed H2 names. The IDs above are internal review labels, not runtime schema or permanent user-document requirements.
- Review Core and every applicable triggered question per artifact. Remove that artifact's sentinel only after it passes this review.
- Feature/foundation work often triggers D-FLOW and D-CONTRACT; remediation may be shorter but needs precise boundaries and regression points; audit/recon work should define its evidence standard and state model.
- Task `design.md` is technical planning. A UI or brand `DESIGN.md` is a separate visual-system artifact.

`implement.md` is not a replacement for `implement.jsonl`. On sub-agent-dispatch workflows, `implement.jsonl` and `check.jsonl` must each contain at least one real spec/research entry before `task.py start`; the seed `_example` row does not count. Inline workflows skip this JSONL gate because Phase 2 loads context through `trellis-before-dev`.

## PRD Convergence Pass

Before declaring planning ready or running `task.py start`, rewrite `prd.md` once against the final structure described in the artifact rules above. This is not optional cleanup; it is the final planning gate.

The pass must be lossless:

- Collapse repeated facts into one authoritative section.
- Fold temporary brainstorm sections such as `What I already know`, `Assumptions`, and resolved `Open Questions` into Goal, Background, Requirements, Technical Notes, or Acceptance Criteria.
- Remove resolved open questions instead of leaving empty or already-answered sections.
- Merge parallel bug and requirement lists when they describe the same work; keep each defect's severity, evidence, and file:line anchors on the owning requirement.
- Preserve every file:line anchor, decision, constraint, requirement ID, and acceptance-criteria mapping.
- Do not proceed to final review while any blocking open question remains.

After the pass, read `prd.md` top to bottom and verify that no fact is repeated across sections unless the repetition adds new information.

## Quality Bar

Before declaring planning ready:

- `prd.md` contains testable acceptance criteria.
- `prd.md` has passed the PRD convergence pass: no unresolved temporary brainstorm sections, no duplicate facts across sections, and no lost anchors, decisions, or acceptance mappings.
- Repository-answerable questions have already been answered through inspection.
- Blocking open questions are empty.
- Complex tasks have `design.md` and `implement.md`.
- Sub-agent-dispatch tasks have real curated entries in both `implement.jsonl` and `check.jsonl`; seed-only manifests are not ready.
- The latest final planning summary has been presented to the user.
- In a subsequent message, the user explicitly approved that summary for implementation.

Do not start implementation merely because the user originally asked for implementation.
