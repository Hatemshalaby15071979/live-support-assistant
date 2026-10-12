# A0.2 failure — verification gate environment

**Date:** 2026-10-11
**Branch / base:** `prog/xss-real-client` / `2b05106c64e9173e81213771ddb4e1c9aa6039ae`

**JS gate.** `pnpm run verify` was attempted three times:
1. Default invocation: pnpm could not create `/home/thommyshelby/.local/share/pnpm/store` (`ENOENT`).
2. `pnpm --store-dir=/tmp/live-support-assistant-pnpm-store run verify`: `--store-dir` is not a valid option for `pnpm run`.
3. `pnpm --config.store-dir=/tmp/live-support-assistant-pnpm-store run verify`: pnpm's dependency-status check spawned an install that still targeted the home store and failed with `ENOENT`.

**SQL gate.** `bash tooling/db/verify-phase7.sh` passed offline lint for 7 SQL files, then stopped because `docker` is not installed (`command not found`). No database suite ran.

**Result:** Full verification NOT PROVED. No guard was disabled. Repair cap reached for the JS gate; Docker absence is an environment blocker.
