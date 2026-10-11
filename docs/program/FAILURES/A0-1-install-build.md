# A0.1 failure — install and build

**Date:** 2026-10-11
**Branch / base:** `prog/xss-real-client` / `2b05106c64e9173e81213771ddb4e1c9aa6039ae`

**Check:** `pnpm install && pnpm -r run build`

**Attempts (cap: 3):**
1. `pnpm install && pnpm -r run build` — failed before build: pnpm could not create `/home/thommyshelby/.local/share/pnpm/store` (`ENOENT`); that path is outside the writable workspace.
2. `pnpm install --store-dir /tmp/live-support-assistant-pnpm-store && pnpm -r run build` — failed before build: `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`.
3. `PNPM_CONFIG_CONFIRM_MODULES_PURGE=false pnpm install --store-dir /tmp/live-support-assistant-pnpm-store && pnpm -r run build` — same `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`.

**Result:** NOT PROVED. Build was never reached. No guard was disabled. The repo's existing `node_modules` was not removed.

**Next:** Park A0.1. A later run needs an interactive TTY or a supported pnpm configuration for the purge prompt; do not exceed the repair cap in this run.
