# Reference Fix And Source Inventory

## Evidence Basis

- The reported behavior shows that context-manifest references are expanded into first-request payloads without a defined upper bound.
- A previously validated implementation approach was reviewed only for its behavioral model: bounded task artifacts, metadata-only manifest indexes, and on-demand source reads.

## Reference Behavior

The reviewed approach changes generated task context from eager body concatenation to:

- 128 KiB aggregate task context
- 64 KiB per task artifact
- 32 KiB rendered manifest index
- 256 KiB manifest source read
- 256 manifest entries
- bounded UTF-8 reads with path-bearing notices
- manifest rows rendered as path + byte size + metadata revision + bounded reason
- explicit agent guidance to select relevant files and use targeted/ranged reads

The reviewed approach also aligns generated agent instructions, workflow text, and context-loading documentation. It did not establish upstream-wide regression coverage, so this task defines that coverage independently.

## Upstream Inventory

The Trellis source repository has four eager runtime families that need review:

| Runtime | Eager path | Notes |
| --- | --- | --- |
| Shared Python hook | `packages/cli/src/templates/shared-hooks/inject-subagent-context.py` | Reads referenced file bodies and expands directory entries; distributed to several hook-backed platforms. |
| Pi | `packages/cli/src/templates/pi/extensions/trellis/index.ts.txt` | `buildContext()` inlines referenced files and feeds delegated prompts plus main-session task context. |
| OMP | `packages/cli/src/templates/omp/extensions/trellis/index.ts.txt` | `buildTaskContext()` inlines referenced bodies; main session indexes both manifests. |
| OpenCode | `packages/cli/src/templates/opencode/plugins/inject-subagent-context.js` + `lib/trellis-context.js` | Plugin consumes `readJsonlWithFiles()` and `buildContextFromEntries()`. Existing tests explicitly assert body inlining. |

Pull/fallback agent definitions across generated platforms also contain variants of "read each listed file". The bundled channel agents under `packages/cli/src/templates/trellis/agents/` and tracked `.trellis/agents/` use the same wholesale-read contract.

## Important Compatibility Findings

- `task.py add-context` supports both file and `type: "directory"` entries; a metadata index must not silently discard directory rows.
- Some current readers accept a legacy `path` key in addition to `file`; keep that compatibility where it already exists.
- The shared hook emits warnings for missing or seed-only manifests and a marker used by fallback protocols; those behaviors are independent of payload sizing.
- Pi's first system prompt is intentionally byte-stable for provider prefix caching; later task changes use persisted hidden messages. Bounding must not reintroduce system-prompt churn.
- OMP and OpenCode have their own task/session resolution logic. The fix should alter context assembly only.

## Test Locations

- `packages/cli/test/templates/shared-hooks.test.ts`
- `packages/cli/test/templates/pi.test.ts`
- `packages/cli/test/templates/omp.test.ts`
- `packages/cli/test/templates/opencode.test.ts`
- `packages/cli/test/regression.test.ts`

The OpenCode test named `inlines JSONL-referenced spec content into the implement prompt` must be inverted to assert metadata discovery and body exclusion. Pi/OMP tests already load transpiled extension internals and can host behavior-level fixtures. Shared-hook regression tests can import the generated Python template in a temporary repository.
