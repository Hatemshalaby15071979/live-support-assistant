# A0.5 limitation — client model mismatch harness

**Date:** 2026-10-11
**Branch / base:** `prog/xss-real-client` / `2b05106c64e9173e81213771ddb4e1c9aa6039ae`

**Server policy check:** `node tooling/verify-publish-model-policy.mjs` passed 24 checks, 0 failures.

**Client check:** `node tooling/sync/verify-sync.mjs` stopped while importing the existing `sharp@0.35.5` installation: the Linux x64 runtime is unavailable. The current `node_modules` installation is platform-incompatible. No product code or test was changed to work around this.

**Result:** The server refusal policy is proven by its 24-check harness. The client install refusal is NOT PROVED in this run. The historical deployed/local margin divergence was not reproduced; that requires the deployed path and matched model. No threshold or claim was changed.
