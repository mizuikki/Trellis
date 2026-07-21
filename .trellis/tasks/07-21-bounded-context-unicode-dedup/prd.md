# Harden bounded context Unicode and deduplication

## Goal

Close the three correctness gaps found during review of the bounded sub-agent context implementation while preserving its existing payload ceilings, metadata-only manifest behavior, and platform compatibility.

## Background

The archived `07-21-unbounded-subagent-context-injection` task introduced bounded task artifacts and manifest indexes for the shared Python hook, Pi, Oh My Pi (OMP), and OpenCode. Follow-up review confirmed the core unbounded-payload fix works, but identified three edge cases:

1. Manifest reasons are not normalized safely across all Unicode inputs. The shared Python hook can raise `UnicodeEncodeError` for an escaped lone surrogate, while JavaScript/TypeScript truncation can split a surrogate pair.
2. Artifact readers decide whether to truncate from the raw byte count before decoding. Replacement characters can therefore make the rendered UTF-8 output exceed the declared 64 KiB artifact limit.
3. Manifest deduplication keys include the declared entry type, so one canonical target can be rendered twice when rows disagree between `file` and `directory`.

The affected canonical runtimes are:

- `packages/cli/src/templates/shared-hooks/inject-subagent-context.py`
- `packages/cli/src/templates/pi/extensions/trellis/index.ts.txt`
- `packages/cli/src/templates/omp/extensions/trellis/index.ts.txt`
- `packages/cli/src/templates/opencode/lib/trellis-context.js`

Corresponding tracked dogfood copies must remain synchronized where the repository intentionally mirrors these runtime sections.

## Requirements

### R1. Manifest reasons are Unicode-safe and non-fatal

- Every runtime MUST normalize and truncate reason text without producing lone surrogates, broken Unicode scalar values, or `UnicodeEncodeError`.
- A syntactically parseable JSONL row containing escaped unpaired surrogates MUST remain non-fatal. The runtime may replace invalid scalar values with the Unicode replacement character or skip the malformed row, but context assembly MUST continue.
- Reason truncation MUST preserve the existing 240-character policy and remain subject to the 32 KiB rendered-index limit.
- Ordinary non-ASCII reasons, including emoji at the truncation boundary, MUST remain valid UTF-8.

### R2. Rendered artifact output obeys the 64 KiB ceiling

- The 64 KiB artifact limit MUST apply to the final rendered UTF-8 bytes, not only the raw bytes read from disk.
- Invalid UTF-8 input handled through replacement decoding MUST still produce at most 64 KiB of rendered output.
- Truncated output MUST remain UTF-8-safe and retain the existing path-bearing, on-demand-read notice.
- The existing 128 KiB aggregate task-context ceiling MUST remain unchanged.

### R3. Canonical targets are rendered once

- Deduplication MUST use the canonical repository-relative target path rather than `(entry type, path)`.
- If conflicting rows declare the same target with different types or reasons, the first accepted row MUST win deterministically.
- Duplicate suppression MUST not change entry-count, source-read, rendered-index, path-boundary, missing-path, or directory handling contracts.

### R4. Runtime parity and compatibility are preserved

- Apply the same observable contract to shared Python, Pi, OMP, and OpenCode implementations.
- Preserve active-task resolution, prompt markers and routing, Pi prompt-cache behavior, OMP session behavior, OpenCode task hints, legacy `path` support, and seed/malformed/missing entry handling.
- Do not change JSONL schema, configured byte limits, or pull-based agent guidance.
- Keep canonical templates and relevant tracked dogfood runtime copies aligned without overwriting unrelated local differences.

### R5. Regression coverage proves each fix

- Add focused tests for escaped lone-surrogate reasons and emoji at the 240-character boundary.
- Add artifact tests using invalid UTF-8 bytes whose replacement-decoded output would exceed 64 KiB.
- Add cross-type duplicate rows for the same canonical path and assert only the first accepted row is rendered.
- Exercise the shared Python hook, Pi, OMP, and OpenCode behavior, then run the existing bounded-context regression coverage.

## Acceptance Criteria

- [ ] Escaped invalid surrogate reasons never crash context assembly on any eager runtime.
- [ ] Reason truncation never leaves a lone surrogate or broken UTF-8 sequence, including when an emoji crosses the 240-character boundary.
- [ ] Every artifact reader returns at most 65,536 UTF-8 bytes for both valid and invalid input bytes and retains its truncation notice when content is omitted.
- [ ] A canonical path declared once as `file` and once as `directory` appears exactly once, with the first accepted row's type and reason.
- [ ] Aggregate, manifest-index, manifest-source, and entry-count ceilings remain 128 KiB, 32 KiB, 256 KiB, and 256 respectively.
- [ ] Existing body-exclusion, path-boundary, seed, malformed, missing, directory, cache/session, and prompt-routing tests continue to pass.
- [ ] Focused tests, CLI lint, TypeScript typecheck, Python typecheck, and the CLI test suite pass.

## Out Of Scope

- Changing the manifest JSONL schema or `task.py add-context` behavior.
- Making context limits user-configurable.
- Changing metadata fields, task-artifact ordering, agent guidance, or source-selection policy.
- Refactoring the four standalone runtimes into a shared cross-language implementation.
- Revisiting unrelated warnings or historical task-archive metadata.
