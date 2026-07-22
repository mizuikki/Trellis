# Vendored Marketplace Source

This directory vendors a reviewed snapshot of the upstream Trellis
Marketplace as ordinary files in this repository.

- Source: https://github.com/mindfold-ai/marketplace
- Commit: `758398b89e159f4b6658383dd26c484da423ba93`
- Tree: `784f1a11f1a01aa0469333889e4e123620452807`
- Import date: 2026-07-22
- Upstream baseline: 160 files

## License and Provenance

The upstream repository did not contain a `LICENSE`, `COPYING`, or `NOTICE`
file at the pinned commit, and GitHub did not report a detected license. Its
initial commit, `76a36ea573ed1ff00712f91a326061cc59d34958`, records that the
content was migrated from the Trellis monorepo. Comparison with the
pre-extraction Marketplace tree shows only the expected `index.json` path
normalization at that migration boundary.

Trellis is licensed under AGPL-3.0. This fork treats the vendored snapshot as
AGPL-derived content governed by the root `LICENSE`. This provenance record
does not claim that the upstream Marketplace repository published a separate
license notice.

## Fork Adjustments

The pinned upstream snapshot was imported in full before these changes:

- `README.md` points installation at `mizuikki/Trellis/marketplace`.
- `workflows/native/workflow.md` is kept byte-identical to
  `packages/cli/src/templates/trellis/workflow.md` in this repository.
- This provenance file was added.

No other upstream file is intentionally changed from the pinned snapshot.

## Ownership and Updates

This is a one-time vendored snapshot, not a subtree or synchronization mirror.
Future Marketplace changes in this directory are owned and reviewed by this
fork. There is no promise of automatic or periodic synchronization with the
upstream repository.
