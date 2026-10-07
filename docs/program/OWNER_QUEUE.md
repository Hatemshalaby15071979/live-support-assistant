# Owner queue — Zone R items

Items that need Hatem. Batched; never an interruption for a single entry.
Each entry carries the default that is **in effect right now**, so the program never stalls.

| id | What | Why it is Zone R | Default in effect | To review | Owner minutes |
| --- | --- | --- | --- | --- | --- |
| OQ-001 | Push `prog/main` and the phase branches to `origin` | Anything that leaves this machine | Stay local; branches exist only on this host | `git push -u origin prog/main` | 1 |
| OQ-002 | Label spot-check batch (20 rows) from the P1 gold set | Label provenance: only `owner` and verified `agent-agreed` rows may carry a headline | `agent-agreed` rows stay `unverified` and are excluded from headlines; P1 proceeds | `node tooling/corpus/spotcheck.mjs --batch 1` | 15 |
| OQ-003 | Confirm the NC/ND licence exclusion list before P1 harvest | Licence compliance; a wrong call is a legal exposure, not an engineering one | NC/ND and unclear-terms sources are excluded automatically | `tooling/corpus/licence-allowlist.json` | 5 |
| OQ-004 | Release tag and public deployment at the end of P8 | Public action | Prepare the exact command; do not run it | — | 2 |
| OQ-005 | ~~Accepting the node-forge advisory past its 2026-10-30 review date~~ **MOOT — closed 2026-10-07** | The advisory left with `@sop/mobile`; the accepted-advisory set is now empty and the gate is strict | Nothing to accept | — | 0 |

## Closed

| id | Closed | How |
| --- | --- | --- |
| OQ-005 | 2026-10-07 | `@sop/mobile` excluded from the workspace (prereg `g9-drop-mobile`). node-forge, braces and sprintf-js left the lockfile with it; `sharp` was patched. `pnpm audit --prod` reports zero. |
