# A0.4 failure — G11 canonical rerun

**Date:** 2026-10-11
**Branch / base:** `prog/xss-real-client` / `2b05106c64e9173e81213771ddb4e1c9aa6039ae`
**Attempted command:** `SIMULATION_RUN_LABEL=a0-g11-20261011 SIMULATION_MIN_MARGIN=0.18 node tooling/eval/simulated-tenant/run-chaos-evaluation.mjs`

**Result:** NOT PROVED. The runner stopped before starting Chrome because no Chrome/Chromium executable exists at its supported paths or on PATH. A targeted search of `/usr/bin`, `/opt`, `/snap/bin`, and the known Playwright/Puppeteer caches found none. The pinned batch remains unchanged; its pre-run hashes are in `docs/program/a0-pinned-hashes.md`.

**Repair cap:** No repo change can supply a browser without installing external software. Installation is outside the current workspace permissions. Parked after checking the configured discovery paths; no guard was bypassed.
