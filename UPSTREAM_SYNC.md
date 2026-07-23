# Upstream Synchronization Ledger

This repository is a source-managed fork. Its compatibility version line starts
at `1.0.0` and is independent from upstream release numbers.

## Baseline

- Upstream repository: `https://github.com/mindfold-ai/Trellis.git`
- Fork baseline: upstream `0.6.7`
- First fork compatibility release: `1.0.0`
- Distribution: source checkout and locally built CLI only

## Recording Selective Imports

Record each accepted upstream change before it is released in the fork:

| Date | Upstream commit or area | Fork version | Summary | Migration or compatibility impact |
| --- | --- | --- | --- | --- |
| 2026-07-23 | `0.6.7` baseline | `1.0.0` | Initial fork boundary | Existing `0.6.x` consumer projects enter the fork line with `trellis update --migrate`. |
| 2026-07-23 | `v0.6.8` boundary `dc68f5a9`; adapted import `bfa7f99d` | `1.0.0` | Added Kimi Code platform support without merging the release tag. The Kimi prompt command was updated to the current valid `kimi -p <prompt>` form rather than importing the incompatible upstream `--yolo` combination. | No migration or fork compatibility-version change. Existing projects can add Kimi with `trellis init --kimi`; generated files are managed by the normal update/hash flow. |

When an imported upstream change needs a migration, copy or re-author its
actions under a new fork version manifest. Do not reuse an upstream release
number as a fork compatibility target.

## Deliberately Excluded Surfaces

- Public npm version checks and update notices
- `trellis upgrade` self-installation
- Public npm publishing, dist-tags, visibility checks, and provenance uploads
- Upstream `0.6.8` package-version and migration-manifest changes
- The upstream docs-site submodule, `README_CN.md`, and Marketplace gitlink

The upstream CI build-before-test ordering from `65a83d7d` was already present
in the fork. The upstream manifest/docs-site change `26ca25f8`, package bump
`c9011ae0`, and publish workflow change `dc68f5a9` were evaluated and excluded.
The Marketplace remains a vendored directory, and the historical upstream
`0.6.8` migration manifest remains unchanged.

Updating this checkout and rebuilding the CLI are maintainer operations outside
the `trellis` command surface.
