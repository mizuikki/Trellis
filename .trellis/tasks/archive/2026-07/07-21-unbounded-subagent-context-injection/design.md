# Technical Design

## Current Flow

Four generated runtime families eagerly assemble task context:

1. `shared-hooks/inject-subagent-context.py` reads every JSONL-referenced file (and up to 20 Markdown files for directory entries) before building implement/check/finish prompts.
2. Pi's `buildContext()` reads every `file` entry and concatenates the full body into both delegated prompts and main-session runtime context.
3. OMP's `buildTaskContext()` reads one or both manifests and concatenates referenced bodies into sub-agent or main-session messages.
4. OpenCode's plugin calls `TrellisContext.readJsonlWithFiles()` and `buildContextFromEntries()`, which eagerly load and render referenced bodies.

This makes payload size proportional to transitive source size rather than to the small task index the user curated.

## Target Contract

Each producer builds the same logical sections in this order:

1. Task identity/path.
2. Bounded manifest index for the role (`implement.jsonl` or `check.jsonl`; a main-session consumer may index both).
3. Bounded `prd.md`.
4. Bounded optional `design.md`.
5. Bounded optional `implement.md`.
6. Aggregate truncation notice when the assembled result exceeds the total budget.

Manifest indexes contain metadata only. A file row renders a repository-relative POSIX path, `file` type, byte size, a short metadata revision, and a normalized/bounded reason. A directory row renders its path, `directory` type, and reason without recursively reading child bodies. Seed rows are skipped. Duplicate canonical targets are rendered once.

## Limits

Use named constants in each standalone runtime template:

| Boundary | Default |
| --- | ---: |
| Aggregate task context | 128 KiB |
| One task artifact | 64 KiB |
| Rendered manifest index | 32 KiB |
| Manifest source read | 256 KiB |
| Manifest entries | 256 |
| Normalized reason | 240 characters, still subject to index byte cap |

Byte readers consume at most `limit + 1` bytes to detect overflow. UTF-8 rendering removes an incomplete trailing code point before appending a notice. Notices reserve their own bytes so the returned section remains within its advertised bound.

## Path And Input Handling

- Resolve repository root and candidate paths canonically before metadata access.
- Reject absolute paths and canonical paths outside the repository.
- Keep platform-native paths for filesystem operations and convert only displayed/persisted paths to POSIX separators.
- Preserve `file` and legacy `path` keys where the current producer accepts both.
- Preserve `type: "directory"` without expanding directory contents.
- Treat malformed, missing, unreadable, seed-only, or empty manifests as non-fatal and retain existing operator warnings where they exist.

## Platform Boundaries

- Shared Python hook: replace body-returning JSONL helpers with bounded index/artifact assembly. Keep hook event parsing, active-task resolution, and the `<!-- trellis-hook-injected -->` contract unchanged.
- Pi: implement the validated bounded-reader/index behavior in the canonical TypeScript template, extend it for directory/legacy-entry compatibility, and keep stable `systemPrompt` caching plus hidden task-update messages intact.
- OMP: bound both main-session and detected-sub-agent task context. Do not change session-key or task-resolution behavior.
- OpenCode: make the context utility expose bounded metadata-index/artifact helpers and update the injection plugin to consume them. Avoid retaining an eager body-loading path used only by this feature.
- Agent/workflow/docs templates: update the semantic contract for hook fallback and pull-based readers across every generated platform, plus tracked dogfood twins.

The runtimes are shipped as standalone platform assets, so a single cross-language runtime helper is not practical. Keep constants and observable output contract aligned, and enforce parity with behavior-focused tests.

## Compatibility And Rollout

- Existing manifests remain valid and require no rewrite.
- Generated projects receive updated managed templates through normal `trellis update` ownership/hash behavior; user-modified files continue to follow the existing sidecar/conflict policy.
- Agents can still open every source when the task truly requires it, but they do so after inspecting reasons and current work rather than in the first request.

## Risks And Mitigations

- Relevant context may no longer be preloaded: agent instructions explicitly require reason-based selection and on-demand reads.
- Aggregate truncation could hide a later task artifact: every notice names the task directory/source and tells the agent where to continue reading.
- Implementations may drift across Python/JS/TS: use identical fixtures and assertions for the observable contract in each platform test suite.
- Path normalization can accidentally change accepted entries: cover file, directory, legacy `path`, Windows separators, duplicates, missing targets, and repository-boundary rejection.

## Rollback

The change is template-only and schema-compatible. Reverting the runtime/template commits restores eager loading without task-data migration. Keep runtime changes and guidance changes in separable commits if implementation review indicates a partial rollback is needed.
