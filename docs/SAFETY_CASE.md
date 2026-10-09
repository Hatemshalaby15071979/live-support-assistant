# Safety case — skeleton

**Status: SKELETON.** Created 2026-10-09 as P4's first artifact. It states every exit criterion and
its verdict as of the date below. It is **not** a finished safety case: the sections marked
*evidence to add* are empty on purpose, and no verdict here may be softened by prose.

**Verdicts as of:** 2026-10-09, `prog/main` + the branches listed in `docs/program/DECISIONS.md`.
**Rules:** a verdict is `MET`, `NOT MET`, `NOT MEASURABLE`, or `NOT STARTED`. Nothing is rounded up.
Every `MET` names a command that was actually run; everything else names what is missing.

---

## Scorecard

| # | Criterion (V2 §4) | Verdict | Evidence, or what is missing |
| --- | --- | --- | --- |
| D1 | Safety — 0 unsafe on the held-out fleet set, N ≥ 300/tenant, at each tenant's calibrated margin | **NOT MEASURABLE** | Held-out `out_of_scope` is **N = 7** fleet-wide (T01 2, T04 3, T05 2) against a floor of 300/tenant. `docs/KNOWN_ISSUES.md` #14; `tooling/corpus/gate-calibration-heldout.json`. Also **NOT MET** on its face: no tenant is calibrated, so "at each tenant's calibrated margin" has no referent. |
| D2 | Refusal — ≥ 49/52 on the public set **and** ≥ 90% on a fresh held-out set | **NOT MET** | Public set: **6 of 52 false accepts** at 0.18 (`docs/KNOWN_ISSUES.md` #5), i.e. 46/52 < 49/52. The fresh held-out refusal set **does not exist** → that half is NOT MEASURABLE. |
| D3 | Recall — ≥ 70% in-scope at 500, **per language** | **NOT MEASURABLE** | No headline-eligible labels: the gold set is `agent-agreed`, owner spot-check NOT DONE, only **3 answerable owner rows** (all T04 calibration). `docs/program/STATUS.md`, `docs/program/OWNER_QUEUE.md` OQ-002. Measured, non-headline: T04 500 R@1 **30.0%** (`tooling/corpus/baseline-results.json`). |
| D4 | Language parity — recall spread ≤ 10 pp at 500, else publish the gap | **NOT MET** at the measured rung | At 48 procedures the spread is **30.1 pp** (en 62.1 vs es 32.0 / pt 31.0) — `docs/KNOWN_ISSUES.md` #4. At 500 the per-language arm is **T01 alone** → NOT MEASURABLE there. |
| D5 | Calibration — a per-tenant calibration record; 0.17 never a tenant setting | **NOT MET** | No tenant calibrated. `minMargin: 0.18` is a prototype default (`docs/KNOWN_ISSUES.md` #6). `tooling/calibration/derive-margin.mjs` **does not exist**; its prereg is `docs/prereg/g6-calibration-pipeline.md`. |
| D6 | Isolation — 0 successful cross-tenant reads/writes in ≥ 1,000 adversarial attempts, with negative controls | **NOT MET** | `pnpm run verify:db`, 2026-10-09: fleet suite **1475 probes, vacuous 0**, and **7 probes SUCCEED** — `claim override capability / override claim then read / sops / rows:3`. Accepted red (F-1, option D). Negative controls pass (section `positive control`, 4/4). |
| D7 | Manifest integrity — the client refuses a bundle whose model differs; test fails before, passes after | **MET** | Probe MC-06 (client refuses `model_mismatch`, prior bundle stays active) and MC-01..MC-05/MC-07/MC-08 — `docs/program/DECISIONS.md:40-55`. Server half in the gate: `tooling/verify-publish-model-policy.mjs`. Red-then-green recorded in `docs/program/phase-0-report.md`. |
| D8 | Reproducibility — `pnpm run evidence` regenerates every headline number; every deployed/fleet claim carries a SHA | **NOT MET** | `pnpm run evidence` **did not exist** until 2026-10-09. Both deployed runs carry **no commit SHA** (`docs/EVIDENCE.md`, reproducibility gap). See §P8 below. |
| D9 | Operability-lite — SLO doc, runbook, backup-restore drill, bundle-rollback drill, each executed and recorded | **NOT STARTED** | P7 not started. None of the four artifacts exists. |
| D10 | Tenant lifecycle (scripted) — provision, publish, query, read telemetry from scripts alone; one recorded journey with SHA | **NOT STARTED** | P6 not started. |
| D11 | Supply chain — `pnpm run audit` green, no expired accepted advisory | **MET** | 2026-10-09: `pnpm audit --prod --json` → `"advisories": {}`, 0 production advisories; `node tooling/audit-gate.mjs` → `dependency gate passed`, `new: 0 escalated: 0`. Baseline empty since 2026-10-07. See the host note below. |
| D12 | Cost — per-1,000-query usage measured locally; hosted cost modelled and labelled | **NOT STARTED** | P7 not started. |

**Tally: 2 MET · 5 NOT MET · 3 NOT MEASURABLE · 2 NOT STARTED.** Four of the twelve cannot be
satisfied by any amount of work at the current corpus and label sizes — they are blocked on N, not on
effort.

---

## Host note — how D11 was run

`pnpm run audit` **cannot run on this host**: the gate shells out with `spawnSync`, which fails
`EBUSY` here (AGENTS.md, sandbox constraints). D11 was therefore run through the gate's own documented
escape hatch, which changes the input and never the comparison:

```
pnpm audit --prod --json > /tmp/audit.json
SOP_AUDIT_JSON=/tmp/audit.json node tooling/audit-gate.mjs
  -> audit report read from … (SOP_AUDIT_JSON)
  -> production advisories: 0 (critical 0, high 0, moderate 0, low 0)
  -> baseline: 0   new: 0   escalated: 0   resolved since baseline: 0
  -> dependency gate passed
```

CI never sets that variable, so the published gate is unchanged. **The audit gate is not in
`pnpm run verify`** — it is its own command and its own CI job.

---

## §P4 — the unsafe-class taxonomy (D1's second half)

D1 requires the taxonomy to be **written** and the **residual class named**, independent of N. That
is achievable now and is not blocked.

| Class | Named? | Where it shows up |
| --- | --- | --- |
| Contradictory policy | yes | payout-window case; the conflict lint and the publish 422 |
| Out-of-scope | yes | 6 of 52 false accepts at 0.18 |
| Superseded wording | **no** | — |
| Adversarial | partially | P5 categories 1–5 |
| Non-English mis-retrieval | yes | en/es/pt-BR gap, `docs/KNOWN_ISSUES.md` #4 |
| **Residual class** | **not named** | D1 not satisfied on this point |

**Evidence to add:** a named residual class with at least one worked example.

## §P5 — isolation (D6)

The suite exists, spans six attack families, and carries negative controls. It reports **7 successful
cross-tenant reads** — a genuine failure of D6's "0 successful" clause, accepted as F-1 (option D,
review 2027-01-06) on the grounds that the shipped API exposes no caller SQL.

**What would move D6:** either the platform gains a per-role ACL on the claim note, or option C is
built. Neither is planned. Until then **D6 stays NOT MET and the 7 probes stay failing by design.**

**Evidence to add:** the 65-point adversarial audit across the five P5 categories, as one suite with
its own negative controls.

## §P8 — evidence and reproducibility (D8)

Fourteen headline numbers are published across `README.md`, `docs/EVIDENCE.md` and
`docs/PRODUCTION_STATUS.md`. `pnpm run evidence` must regenerate every one and **fail** on any that
does not reproduce. The verifier is `tooling/evidence/verify-claims.mjs` (added 2026-10-09).

**Two of the fourteen are unverifiable by construction and must never pass:**

1. **Both deployed runs carry no commit SHA** — `phase5-deployed-run-0aec9773442c4282` (500-ticket) and
   `phase5-deployed-run-60cdbbea8a4f478f` (39-ticket parity). The commit each was evaluated against is
   not recorded, so neither is reproducible from this repository alone.
2. **The `0.180757` divergence** (deployed vs local `0.167715` on `SIM-TICKET-00272`) is
   **unreproduced**. MC-09 was built to reconstruct it and remains an unproven hypothesis.

**Evidence to add:** the first green run of `pnpm run evidence` from a clean clone. It cannot be green
until the two unverifiable claims are either removed from the published documents or re-run with a
recorded SHA. **That is an owner decision, not an engineering one.**

---

## What this skeleton deliberately does not do

- It does not lower a floor, restate a criterion, or reclassify a failure as a limitation.
- It does not treat "accepted" as "met". D6 is NOT MET and stays that way; F-1 is an accepted risk
  inside a failing criterion, which is a different thing.
- It does not present any `NOT MEASURABLE` as a pass. Four criteria are blocked on N.
- It contains no number that was not measured in a run whose command is named above.
