# Program status board

One row per phase. Updated at every phase end. Values: `done` | `in progress` | `parked` | `not met`.

| Phase | Scope | Status | Gate | Report |
| --- | --- | --- | --- | --- |
| P0 | Integrity and baseline | **done** | `pnpm run verify` 10/10; ticket validator OK; D7 red-then-green (client and server); `docs/BASELINE.md` complete. SQL suites `not re-run` (host sandbox). | `docs/program/phase-0-report.md` |
| P1 | Licensed corpus and gold set | in progress | **3 tenants / 3 domains, harvesting CLOSED (cut #1 — one below the cut-line floor).** 544 documents → 3,659 procedures. Gold set under construction: register C, document-level labels. `verify-corpus.mjs` fails on the missing gold set. | `docs/CORPUS_PROVENANCE.md` |
| P2 | Market Twin (smoke + standard) | not started | `run-market.mjs --seed 20261006 --rung smoke` exits 0 | — |
| P3 | Retrieval at 500 | not started | per-rung/per-language tables; D3/D4 reported honestly | — |
| P4 | Gate and safety hardening | not started | D1, D2, D5, D7 reported honestly | — |
| P5 | Security and isolation proof | not started | D6 and D11 met | — |
| P6 | Tenant lifecycle (scripted) | not started | D10 met; journey recorded | — |
| P7 | Operations, lite | not started | D9 and D12 met; drills recorded | — |
| P8 | Evidence pack and close | not started | `pnpm run evidence` green from a clean clone | — |

## Cut line (from V2 §11)

If time runs short, drop in this order and record each cut here:
P7 cost model → P6 metering → P3 per-language index (keep per-language thresholds) → P1 fleet from 6 to 4 tenants.
**Never cut:** P0, P2 smoke, P4, P5 isolation suite, P8.

## Cuts taken

| # | Cut | Line allows | Actual | Why | Consequence |
| --- | --- | --- | --- | --- | --- |
| 1 | **P1 fleet** | 4 tenants (cut line) · 4–6 (V2) | **3** — T01, T04, T05 | Two further candidates (`django-faq-en`, `cpython-faq-en`) were registered and dropped on genuine findings — one published security contact and one example address, each a single finding in a very small source. Harvesting is closed by owner instruction. | **Below the cut line's own floor, not merely within it.** Recorded as a cut *beyond* the line. Every figure from the fleet is a 3-tenant figure, and the per-language arm is T01 alone. |

**Fleet as accepted, 2026-10-07:** T01-platform-operations-style (2,318 procedures, en/es/fr/pt-BR),
T04-customer-support-style (577, en), T05-policy-style (764, en). **Harvesting is closed. No further
sources will be added.**

## Open items carried into P1

| Item | Why it is open | Where |
| --- | --- | --- |
| ~~SQL suites not re-run~~ **CLOSED 2026-10-07** | Owner ran `verify:db` outside the sandbox: all four suites OK, counts reproduce exactly (99/27/40, retention OK) | `docs/BASELINE.md` §6 |
| ~~Deployed path not re-run~~ **CLOSED 2026-10-07** | Owner authorized `verify:deployed` against the dev project: **19/19, `DEPLOYED STRANGER PATH OK`**, commit `3bab890` | `docs/BASELINE.md` §7.2 |
| Deployed/local divergence not reproduced | P0 removed the mechanism, not the reproduction. Tracked as probe **MC-09** in P5 | `docs/program/P5_PROBES.md` |

## Owner follow-ups after P0

Completed 2026-10-07, recorded in `docs/program/DECISIONS.md`: sharp provenance reconciled ·
dependency-gate negative controls · guard-bypass logging rule · server half of D7.

## Branch map

- `prog/main` — local integration branch. Never pushed without the owner.
- `prog/p0-integrity` — P0 work.
- `exp/<id>` — Zone Y experiments.

`main` is untouched by this program.
