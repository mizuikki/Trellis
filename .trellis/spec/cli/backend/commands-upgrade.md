# Removed `trellis upgrade` Command

This fork is maintained from a source checkout and does not publish an npm
package. `trellis upgrade` is not part of the supported command surface.

To update Trellis, update the source checkout and rebuild it:

```bash
git pull --ff-only
pnpm install --frozen-lockfile
pnpm build
```

Do not add npm registry checks, global installation, dist-tag selection, or
package publication behavior to this fork.
