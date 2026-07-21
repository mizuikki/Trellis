# Bound sub-agent context injection

## Goal

Prevent Trellis-generated integrations from creating unbounded first model requests when task context manifests reference large or numerous files, while preserving enough context for implement and check agents to find and load relevant sources on demand.

## Background

- A valid context-manifest entry can currently cause a complete multi-megabyte referenced file to be copied into a generated prompt.
- The eager behavior exists in multiple generated integration paths, including the shared Python hook, Pi, Oh My Pi (OMP), and OpenCode.
- A previously validated fix demonstrates the intended direction: treat JSONL as a bounded metadata index, keep task artifacts available under byte limits, and let agents select referenced sources on demand.

## Requirements

### R1. Manifest entries are indexes, not payloads

- Generated sub-agent integrations MUST NOT inline the bodies of files or directories referenced by `implement.jsonl` or `check.jsonl`.
- For each accepted manifest entry, injected context MUST expose the repository-relative path, bounded reason text, entry type, and useful file metadata when available.
- Existing file and directory entry forms, seed rows, blank lines, malformed rows, duplicates, missing paths, and unreadable paths MUST remain non-fatal.
- Implement and check agent instructions MUST use each entry's reason to select relevant sources and SHOULD prefer targeted search or ranged reads for large sources.

### R2. Every eager producer is bounded

- Apply the same behavioral contract to the shared Python hook and the generated Pi, OMP, and OpenCode integrations.
- Direct task artifacts (`prd.md`, optional `design.md`, and optional `implement.md`) remain injected, but each artifact and the final assembled task context MUST have explicit UTF-8 byte limits.
- Manifest source reads, rendered manifest indexes, and the number of rendered entries MUST have explicit limits.
- The default policy is:
  - 128 KiB total injected task context
  - 64 KiB per directly included task artifact
  - 32 KiB rendered manifest index
  - 256 KiB manifest source read
  - 256 rendered manifest entries
- Every truncation or omission notice MUST identify the affected source path or manifest and explain how to read the remainder on demand.

### R3. Cross-platform and compatibility behavior is preserved

- Limits MUST be measured in UTF-8 bytes without emitting a broken trailing code point.
- Repository-relative paths in rendered context MUST use POSIX separators; filesystem access MUST continue to use platform-native path APIs.
- Existing active-task resolution, hook markers, prompt routing, Pi prompt-cache stability, OMP session behavior, OpenCode task hints, and missing/seed-only manifest behavior MUST not regress.
- The JSONL schema and `task.py add-context` behavior remain backward compatible; no task migration is required.

### R4. Generated guidance matches runtime behavior

- Workflow text, bundled implement/check agent definitions, per-platform fallback/pull instructions, and Trellis context-loading documentation MUST describe JSONL as a candidate index and remove requirements to read every referenced source wholesale.
- Canonical package templates and tracked dogfood copies MUST remain synchronized without overwriting unrelated local differences.

### R5. Regression coverage proves the bounds

- Tests MUST use synthetic oversized task artifacts, manifests, and referenced files to prove byte ceilings and path-bearing truncation notices.
- Tests MUST prove that a unique marker located only inside a large referenced file body is absent while its path, reason, and metadata remain discoverable.
- Tests MUST cover UTF-8 truncation, entry-count limiting, seed/malformed/missing entries, directory entries, and aggregate-context limiting.
- Tests MUST exercise the shared Python hook plus Pi, OMP, and OpenCode template behavior, and verify installed/generated agent guidance uses on-demand selection language.

## Acceptance Criteria

- [ ] A 2 MiB file referenced by `implement.jsonl` or `check.jsonl` is never copied into generated task context on any eager integration path.
- [ ] The referenced source remains discoverable through a bounded index containing its path, reason, entry type, and file metadata when applicable.
- [ ] Direct task artifacts are capped at 64 KiB each, manifest indexes at 32 KiB, manifest source reads at 256 KiB / 256 entries, and aggregate task context at 128 KiB.
- [ ] Each applied limit emits a UTF-8-safe notice naming the affected task artifact, manifest, or task directory and directing the agent to load remaining content on demand.
- [ ] File and directory manifest entries remain usable; seed, malformed, duplicate, missing, and unreadable entries do not crash injection.
- [ ] Implement/check instructions across generated platforms treat reasons as selection hints and do not direct agents to read every manifest entry wholesale.
- [ ] Focused tests for shared hooks, Pi, OMP, and OpenCode pass, followed by CLI lint, typecheck, and the relevant regression suite.

## Out Of Scope

- Token-based budgeting or provider/model-specific context-window discovery.
- User-configurable limit settings in this change.
- Changing the JSONL schema, task creation lifecycle, or context curation gate.
- Automatically deciding which referenced files are relevant beyond providing paths, reasons, types, and metadata.
- Limiting unrelated session-start or workflow-state context that is not assembled from active-task artifacts/manifests.
