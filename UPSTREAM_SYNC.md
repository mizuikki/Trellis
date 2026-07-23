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

When an imported upstream change needs a migration, copy or re-author its
actions under a new fork version manifest. Do not reuse an upstream release
number as a fork compatibility target.

## Deliberately Excluded Surfaces

- Public npm version checks and update notices
- `trellis upgrade` self-installation
- Public npm publishing, dist-tags, visibility checks, and provenance uploads

Updating this checkout and rebuilding the CLI are maintainer operations outside
the `trellis` command surface.
