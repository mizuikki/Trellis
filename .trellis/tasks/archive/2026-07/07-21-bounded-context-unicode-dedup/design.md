# Technical Design

## Scope And Boundaries

This is a compatibility hardening pass over the four bounded-context producers introduced by the previous task. It changes only text normalization, artifact byte enforcement, canonical-target deduplication, and their tests. The existing limits, context section ordering, manifest metadata, prompt wrappers, and platform lifecycle behavior remain stable.

## Unicode Reason Contract

Normalize whitespace first, then operate on Unicode scalar values rather than Python/JavaScript storage units.

- Python: sanitize or replace surrogate code points before any UTF-8 measurement or rendering. Encoding a reason must never raise.
- JavaScript/TypeScript: iterate by code point (for example with `Array.from`) before applying the 240-character limit so a surrogate pair cannot be split.
- Keep the public result as a normal string. Do not introduce byte buffers into manifest-row interfaces.
- Invalid scalar input may become `U+FFFD`; valid emoji and other supplementary characters must remain intact.

The final rendered index remains protected by the existing 32 KiB UTF-8 truncator.

## Artifact Byte Contract

Each artifact reader continues reading at most `MAX_TASK_ARTIFACT_BYTES + 1` raw bytes. After decoding, it must measure the rendered UTF-8 representation and pass it through the existing UTF-8-safe truncation path whenever that representation exceeds 64 KiB, even if the raw read was no larger than 64 KiB.

This preserves bounded I/O while making the advertised boundary apply to the actual prompt text. The existing path-bearing notice is reserved inside the 64 KiB result whenever any decoded content is omitted.

## Deduplication Contract

After repository-boundary validation and canonical display-path resolution, use only that canonical path as the `seen` key. The first accepted row determines rendered type, reason, and metadata. Later rows for the same target are skipped regardless of whether their declared type differs.

This matches the previous design's first-row ordering and prevents conflicting rows from consuming the 256-entry and 32 KiB budgets twice.

## Runtime Mapping

| Runtime | Canonical location | Required adjustment |
| --- | --- | --- |
| Shared Python | `shared-hooks/inject-subagent-context.py` | Surrogate-safe reason normalization, post-decode artifact cap, path-only dedup key |
| Pi | `pi/extensions/trellis/index.ts.txt` | Code-point reason truncation, post-decode artifact cap, path-only dedup key |
| OMP | `omp/extensions/trellis/index.ts.txt` | Same observable behavior as Pi |
| OpenCode | `opencode/lib/trellis-context.js` | Same observable behavior through `TrellisContext` methods |

Tracked dogfood copies receive only the corresponding runtime-section updates; platform-specific differences outside those sections remain untouched.

## Tests

Reuse the existing behavior-level fixtures in:

- `packages/cli/test/templates/shared-hooks.test.ts`
- `packages/cli/test/templates/pi.test.ts`
- `packages/cli/test/templates/omp.test.ts`
- `packages/cli/test/templates/opencode.test.ts`

Each runtime must prove:

1. A reason containing an escaped unpaired surrogate is non-fatal and renders valid UTF-8 or is skipped.
2. An emoji crossing the reason boundary is never split.
3. Replacement decoding cannot exceed the 64 KiB artifact ceiling.
4. Cross-type duplicate rows for one target render exactly once and preserve the first row.

## Compatibility And Rollback

No stored data migration is required. Existing valid manifests keep the same meaning and limits. The change can be rolled back by reverting the runtime/test commit because it does not alter schemas or persisted state.

The main implementation risk is behavioral drift among four independently shipped runtimes. Keep fixtures and assertions structurally parallel and review dogfood diffs separately from canonical template diffs.
