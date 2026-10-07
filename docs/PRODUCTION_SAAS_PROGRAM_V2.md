# LIVE Support Assistant - Production Program V2 (Execution Brief)

**Status:** approved for execution by the owner (Hatem). Supersedes `PRODUCTION_SAAS_PROGRAM.md`
(leave that file untouched, it stays as the record of the first proposal).
**Date:** 2026-10-06.
**Audience:** the coding agent. This is an order of work, not a proposal. Execute it.
**Register:** specification. Findings first, mechanism second, evidence third.

---

## 0. Read this first (standing orders)

1. **Read the actual code before drawing any conclusion.** Do not reason from READMEs, docs, or
   this brief. Every repo fact in this brief is carried from the previous program document and is
   marked `[verify]` where it matters. Re-check it against source and record the real path/number.
2. **If `AGENTS.md` or `Hatem_specific.md` exists, it outranks this brief** on style, clean-code
   and engineering philosophy. This brief decides *what to do*; those files decide *how*.
3. **Work with the owner, not for him and not without him.** Decide by rule (Section 2), report
   what you did and the proof, and never ask a question that a default can answer.
4. **Every claim carries proof.** A number without a command, a SHA and a data mode is not a result.
5. **A surface-level output that matches the request but misses the need is a failure.**
   Example: a green build with a weak test is a failure. A negative result, honestly published, is not.
6. **Never end a turn on a bare question.** If you are blocked on a Red item (Section 2), park it in
   `docs/program/OWNER_QUEUE.md` with a default and continue with independent work.

---

## 1. Mission and what "production-ready" means here

There is no external client and none is being waited for. The evidence strategy is: prove, with
repeatable commands, that the service **fails safely, always**, under a simulated multi-tenant
market built on real, licensed documents.

"Production-ready" in this program means all of:

- **Safe by measurement:** zero observed unsafe answers on held-out data, with an upper bound stated.
- **Isolated:** no cross-tenant read or write across a large adversarial suite with negative controls.
- **Honest:** every published number regenerates from one command and carries a commit SHA.
- **Operable by someone else:** runbook, drills executed, tenant lifecycle scripted and recorded.
- **Labeled:** every dataset says what it is (`data_mode`), every label says who made it.

It does **not** mean: has users, has billing, has a sign-up page. Those are deferred (Section 7).

The product boundary is unchanged and non-negotiable: **no generative model in query, retrieval,
gate, answer, or escalation.** An LLM may assist only with corpus authoring help, query-set
generation, and evaluation judging, and every such output is tagged and never counts as ground truth
on its own (Section 3, rule 7).

---

## 2. Operating contract: autonomy by rule

The first plan made you ask or report after the fact on safety-critical changes. This one replaces
asking with **pre-registration**: you may decide anything in Zones G and Y yourself, because the
accept/reject rule is written down *before* the measurement and applied mechanically.

### 2.1 Zone G - do it, no report until phase end
Tooling, harnesses, generators, reporters, tests, fixtures, new pinned corpora, docs that report
measurement, behaviour-preserving refactors, patch/minor dependency bumps that keep verify green,
bug fixes backed by a failing test, local commits, branches, merges into the local integration branch.

### 2.2 Zone Y - do it on a branch, only under a committed pre-registration
Gate behaviour, scope/refusal layer, calibration objective, thresholds, retrieval architecture,
additive schema migrations, runtime dependencies that replace more code than they add,
the `highStakes` experiment, dropping or vendoring the unbuilt mobile package.

Procedure (mandatory):
1. Write `docs/prereg/<id>.md` containing: hypothesis, metric, dataset and split, margin band,
   seeds, **accept rule, reject rule**, and what is published either way. Commit it.
2. Run the experiment. Only now.
3. Apply the rule mechanically. Accepted: merge to the local integration branch and log in
   `docs/program/DECISIONS.md`. Rejected: keep the branch, log the result in the
   rejected-experiment register, move on.
4. A prereg is immutable after its run. To change a threshold, write a new prereg, mark the old one
   `superseded`, and keep both. You may tighten a rule freely. You may never loosen a D-target (2.3).

A Zone Y change that touches the gate or calibration must show, before merge: before/after on the
full fleet, the false-escalation delta, and the unsafe count on the **held-out** set.

### 2.3 Zone R - never without the owner (park in OWNER_QUEUE with a default)
| Item | Default while waiting |
| --- | --- |
| Push, release tag, public deployment, anything that leaves this machine | Stay local; prepare the artifact and the exact command |
| Spend beyond free tiers | Stay on free tiers |
| Billing, payments, subscriptions, self-serve sign-up | Deferred, not built |
| Any change to what the product claims to a customer | Preserve the current claim; write the proposed change in the queue |
| Mutating pinned data (`chaos-500.json`, sha `717c40dc...`) | Never |
| **Loosening a D-target** or marking one "met" by changing its definition | Report it as **NOT MET** with the measured frontier |
| NC/ND-licensed sources, or any source with unclear terms | Excluded |
| Accepting a High/Critical security finding as residual risk | Fix or park; do not accept silently |
| History rewrite, force-push, deleting branches that hold results | Never |

"Not met" is a legitimate terminal state for a D-target. Faking "met" is the only failure.

### 2.4 Hard stops (fix-or-park, never ask)
Any of these triggers an immediate fix attempt on a branch, with a failing test first:
an unsafe answer on the held-out set; a cross-tenant read/write; a secret in a client bundle;
a pinned-data hash mismatch; plaintext procedure/query text on an escalation record.
If three repair cycles fail, write `docs/program/FAILURES/<id>.md` (what, evidence, what was
tried, residual risk), park that workstream, and continue with independent phases.

### 2.5 Branching and commits
- Integration branch: `prog/main` (local). Phase branches: `prog/p<N>-<slug>`. Experiments: `exp/<id>`.
- Merge phase branches into `prog/main` yourself when the exit gate passes. Never touch `main`.
- Commit messages: `p<N>: <what> [gate: <command> -> <result>]`. One logical change per commit.
- Record the full commit SHA in every report and every evidence artifact.

### 2.6 Cycle caps (the ruthless part)
Per failing gate: max **3** repair cycles. Per phase: write `docs/program/phase-<N>-report.md`
and move on when the gate passes **or** the cap is hit. Do not polish a passing gate.
Do not start a phase whose prerequisite gate has not passed, except where Section 5 says parallel.

---

## 3. Honesty invariants (binding on every artifact)

1. **Re-run before writing a count.** Never carry forward a number. Everything in Section 8 below
   marked `[carried]` is re-measured in P0 before any use.
2. **Separate executed from reasoned.** Name the command or say "reasoned".
3. **The distinct message is the unit of evidence.** Never print a ticket-level rate without the
   distinct-message count beside it.
4. **Tag every dataset:** `data_mode: "simulated" | "web-sourced" | "measured"`. A "measured" claim
   about simulated data is a defect.
5. **Never compare two retrieval paths at the same numeric margin.** Compare each at its own
   zero-unsafe operating point.
6. **Zero means "zero observed in N".** Always print N and the 95% upper bound (rule of three:
   about 3/N when 0 events are observed). Never print bare "0 unsafe".
7. **Label provenance:** every label carries `label_source: owner | agent-agreed | agent-single`.
   Headline recall and safety claims use `owner` and spot-check-verified `agent-agreed` rows only.
   `agent-single` rows never count toward a headline.
8. **Calibrate on one split, report on another.** A number reported on the data its margin was tuned
   on is labeled `in-sample` and never used for D1, D2 or D3.
9. **Every recall/accuracy figure is printed beside its unsafe count.** A recall gain that adds an
   unsafe answer is a rejection, automatically.
10. **A gain must hold on a second seed and across the margin band (+/-0.02)** before it is written
    down. A gain that exists only inside a band the threshold could move through is rejected.
11. **Publish the weakest result first.** Negative results go in the evidence pack, not a footnote.
12. **Derived media is not evidence.** Text and JSON are.
13. **Rejected doors stay closed:** wording edit, cross-encoder reranker, and a global multilingual
    embedder swap were measured and rejected. Reopen only the specific, different design named in P3.

---

## 4. Exit scorecard (floors, not suggestions)

All targets are floors. You may raise them. You may not lower them (Zone R).

| # | Dimension | Exit criterion | Class |
| --- | --- | --- | --- |
| D1 | Safety | 0 observed unsafe across the held-out fleet set (N >= 300 ambiguous / contradictory / out-of-scope items) at each tenant's calibrated margin, **with N and the 3/N upper bound printed**; unsafe-class taxonomy written and the residual class named | non-negotiable |
| D2 | Refusal | >= 49/52 on the existing out-of-scope public set **and** >= 90% refusal on a fresh held-out out-of-scope set; in-scope recall loss from the refusal layer stated in pp | ratified floor |
| D3 | Recall | In-scope recall >= 70% at 500 procedures on the gold set, **per language**. 5,000 procedures is a non-gating stress curve (memory, latency, recall printed, no target) | ratified floor |
| D4 | Language parity | en/es/pt-BR/fr recall spread <= 10 pp at 500 procedures, else the gap is published with per-language calibration results | ratified floor |
| D5 | Calibration | Every fleet tenant has a calibration record from its own corpus on a calibration split; 0.17 never appears as a tenant setting | non-negotiable |
| D6 | Isolation | 0 successful cross-tenant reads/writes in a >= 1,000-attempt adversarial suite spanning JWT forgery, tenant-claim spoofing, direct table access, RPC parameter spoofing, bundle substitution, key confusion; **plus negative controls that must succeed** | non-negotiable |
| D7 | Manifest integrity | A client given a bundle whose model id/revision differs from its loaded model refuses to serve search; a test fails before the fix and passes after | non-negotiable |
| D8 | Reproducibility | `pnpm run evidence` regenerates every headline number in README/EVIDENCE/PRODUCTION_STATUS; every deployed or fleet claim carries a commit SHA | non-negotiable |
| D9 | Operability-lite | SLO doc, runbook, one backup-restore drill and one bundle-rollback drill, each executed and recorded | non-negotiable |
| D10 | Tenant lifecycle (scripted) | An operator provisions a tenant, publishes a corpus, runs a query and reads that tenant's telemetry from scripts alone; one recorded journey with SHA | non-negotiable |
| D11 | Supply chain | `pnpm run audit` green with no expired accepted advisory | non-negotiable |
| D12 | Cost | Per-1,000-query resource usage measured locally; hosted cost modeled from measured usage x published price, labeled `modeled` | ratified floor |

Dropped from the first plan: self-serve sign-up, admin console, quotas/alerting stack, sandbox billing,
5,000-procedure recall target.

---

## 5. Phases

Order: **P0 -> P1 -> P2 -> (P3 || P4 || P5) -> P6 -> P7 -> P8.**
P3 starts first inside the parallel wave because P4 and P5 consume its distributions.

### P0 - Integrity and baseline (cheap fixes first)
**Objective.** Nothing is claimed until re-measured. Fix the integrity gaps that cost an hour, not a week.

Do:
1. `pnpm install`, then `pnpm -r run build` (Turbo fails on this host with `os error 231`; use `pnpm -r`).
2. `pnpm run verify`, `pnpm run verify:db` (start Docker; if impossible, mark SQL suites `not re-run`, never omit).
3. `node tooling/eval/simulated-tenant/verify-tickets.mjs tooling/eval/simulated-tenant/chaos-500.json` must print the OK line.
4. **G11:** make every run driver write the git commit SHA into its report. Re-run the canonical 0.18 batch under a **new label** (the driver refuses to reuse one) and diff against the recorded run.
5. **G1:** write the failing test first (client given a mismatched-model bundle must refuse). Then fix: read model id/revision from the bundle manifest (`apps/web/src/bundle-client.ts` currently reads `bundleVersion` and `sops` only; `App.tsx` uses a build-time constant) [verify]. Then **reproduce the recorded deployed/local divergence (0.180757 vs 0.167715) with the model matched**. The previous plan asserted G1 as the cause. It is a hypothesis until this reproduction. Record the outcome either way.
6. **G8:** make the demo tooling path-configurable so it runs off Windows.
7. **G9:** inspect `@sop/mobile`. If it is unbuilt and unused, drop it from the workspace install on a branch (Zone Y prereg: accept if `pnpm run verify` and `pnpm run audit` stay green). Review date is 2026-10-30.
8. Write `docs/BASELINE.md`: re-measured table, commit SHA, every drift from carried numbers.

**Exit gate.** verify green; ticket validator OK line; D7 test red-then-green; `docs/BASELINE.md` complete.
**Artifact.** `docs/BASELINE.md`, `docs/program/phase-0-report.md`.

### P1 - Licensed corpus and a gold set you can defend
**Objective.** Real documents and real-phrased questions with honest labels. Fewer tenants, better evidence.

Corpus rules (all five gates, every item):
| Gate | Rule | On failure |
| --- | --- | --- |
| Licence | Allowlist: public domain/CC0, CC-BY, CC-BY-SA, MIT/Apache/BSD-licensed docs, government works whose terms permit reuse. **Exclude NC and ND.** Record licence id + URL | Excluded and counted in the report |
| Provenance | URL, retrieval time, content SHA-256, source id | Cannot enter a corpus |
| Privacy | Reject email/phone/address/account/person-name-shaped strings | Quarantine with matched pattern, never scrub. If a source's quarantine rate > 5%, drop the source |
| Attribution | Machine-readable attribution file per corpus | Corpus cannot be published to a tenant |
| Stability | Snapshot to `tooling/corpus/snapshots/<sha>.json`; live fetches are never build inputs | - |

Redistribution rule: commit snapshot **text** only where the licence permits redistribution and the
attribution file exists. Otherwise commit the hash and the fetch script only.
Robots/terms are checked before fetching. A blocked or forbidden source is recorded and skipped;
it is not a program risk.

Fleet: **4 tenants minimum, up to 6** if licensed sources support it, covering at least 2 domains and
at least 2 non-English languages. Name them as **domain analogues** (e.g. "billing-style", "telecom-style"),
never as real companies' help centres. Rungs 40 and 500 where the source supports it. The 500-rung
claim requires >= 2 tenants at 500 same-domain procedures; otherwise the claim is restricted to the
largest rung actually measured. Cross-tenant distractor padding is allowed but labeled `easy-mode`,
because cross-domain distractors are easier than same-domain ones.
If no licensed non-English source of adequate size exists, create non-English corpora by translating
licensed documents with attribution preserved, tagged `data_mode: "simulated"` and
`origin: translated`, and say so in every table that uses them.

Question sets (every row carries `origin`, `label_source`, `data_mode`):
- `owner`: the owner's own floor-experience queries (use the existing 29; they are the gold core).
- `public`: real public phrasing under permissive terms, PII-gated. Used mainly for **refusal**
  testing, since most will not map to a tenant corpus.
- `derived-paraphrase`: written from a licensed document with a **leakage control** (3-gram overlap
  with the document title and first sentence <= 0.30). Reported separately, **never in a headline**,
  because title-echo questions are templates in disguise.
- Gold set size: 150-300 questions per primary tenant per rung, split calibration / held-out
  (70/30, fixed seed, split file committed).

Labeling protocol (this replaces "bias-mitigated judging" as a free pass):
1. Two independent agent labeling passes. Agreement -> `agent-agreed`. Disagreement -> **excluded**, not resolved by guess.
2. Build `tooling/corpus/spotcheck.mjs` that emits random batches of **20 rows** for the owner.
3. A batch passes at >= 85% owner match. Below that, **discard that batch's agent labels for recall
   claims** (they remain usable for refusal and robustness only). Reference point: an earlier
   spot-check matched only 5/15 first pass and 8/15 after a redo, so expect to fail often and design for it.
4. Do not wait for the owner. Park the spot-check batch in OWNER_QUEUE and continue. Until it passes,
   `agent-agreed` rows are `unverified` and excluded from headlines.
5. If owner-verified rows are too few to support D3 credibly, report D3 as **NOT MEASURABLE at claimed N**
   with the actual N. That is acceptable. A bigger noisy set is not.

**Exit gate.** `node tooling/corpus/verify-corpus.mjs --manifest tooling/corpus/manifest.json`
(create it) exits 0 asserting: complete provenance, allowlisted licences, zero unquarantined PII,
declared counts equal actual counts, split files present, every question row has `origin` and `label_source`.
**Artifact.** `tooling/corpus/manifest.json`, `docs/CORPUS_PROVENANCE.md` (with the exclusion report).

### P2 - Market Twin (smoke + standard rungs only)
**Objective.** One command, one seed, one reproducible report, under chaos.

Build `tooling/market/`: `traffic.mjs` (diurnal curve + Poisson bursts, per-tenant language mix,
repeat contacts, adversarial inputs), `chaos.mjs` (ten independently injectable events),
`assert.mjs` (invariants), `run-market.mjs`.

Chaos events and the safe behaviour each must show:
corpus edited mid-flight (old bundle keeps serving; new one gated by conflict lint) -
contradictory policy publish (422, names procedures and values) -
model version drift (client refuses search; this is D7) -
bundle substitution (client refuses; server records attempt) -
key rotation mid-session (device re-fetches; no plaintext leak) -
network partition (queue keeps order; flush on recovery; no duplicate audit rows) -
clock skew (retention and ordering unaffected) -
duplicate submission (idempotent; exactly one audit row) -
throttle saturation (throttled not dropped; client backs off) -
deletion request (plaintext removed, audit skeleton kept).

Rungs: **smoke** (1 tenant, 40 procedures, runs in `tooling/run-verification.mjs`) and **standard**
(all fleet tenants, 500 rung where available, nightly). No 5,000-procedure rung except the
non-gating stress curve in P3.

Report carries: per-tenant/per-language/per-rung tables; unsafe, false-escalation, correct with the
distinct-message denominator and the 3/N bound; each chaos event and observed behaviour; commit SHA,
corpus SHAs, model revision, margin, environment; JSON beside Markdown.
Determinism: run the same seed twice and require identical decisions. State plainly that
cross-machine determinism is not proven unless you tested it.
Any delta must reproduce on a second seed before it is written down.

**Exit gate.** `node tooling/market/run-market.mjs --seed 20261006 --rung smoke` exits 0 with every
invariant asserted and `unsafe` counted explicitly; the same seed twice gives identical decisions.
**Artifact.** `tooling/market/reports/<label>.md` + `.json`.

### P3 - Retrieval at 500 (measure first, change second)
**Objective.** Close G3 and G4 by measurement, not by library swap.

Do:
1. Measure geometry at 40 and 500 procedures: passages per procedure, query-embed latency, search
   latency, memory. Run the 5,000 stress curve as non-gating data.
2. Keep brute-force cosine unless measurement shows a real threshold crossing at 500 (it was flat at
   10,000 vectors, 9.2 ms mean [verify]). Do not add HNSW/IVF on instinct.
3. Passage budget as a first-class setting: how many passages reach the gate, what the runner-up must be.
4. The **one** reopened language experiment, via prereg: **per-language threshold and/or per-language
   index with language routing**, on the gold set. This is not the rejected global embedder swap.
   Accept rule (write it into the prereg): in-scope recall up with **0 new unsafe on held-out**,
   holds on 2 seeds and across the +/-0.02 margin band, and english recall does not drop > 2 pp.
5. If the language gap does not close, the finding is "calibration problem, not model problem" and
   P4's per-language calibration is the answer. Both outcomes are fine. Publish whichever happens.

**Exit gate.** per-rung, per-language tables from `run-chaos-evaluation.mjs` and the Market Twin;
D3/D4 reported as met / not met / not measurable with N.
**Artifact.** `docs/RETRIEVAL_AT_SCALE.md`.

### P4 - Gate and safety hardening
**Objective.** D1, D2, D5, D7. Close G2, G5, G6.

1. **G1/D7** already fixed in P0; extend the chaos event and keep the test.
2. **G2, conflict lint at the root.** Default: **(a) structured policy facts** (category, field, value,
   unit, window) as an additive migration across `packages/core`, bundle format, publisher, database.
   Lint compares structured values; procedures without structured facts fall back to prose parsing and
   the fallback rate is published. Auto-fallback to **(b) multilingual number-word parsing** if after
   3 repair cycles `pnpm run verify`/`verify:db` cannot stay green, or the migration is not
   cleanly reversible. Write the rollback migration with the forward one.
3. **G5, scope/refusal layer.** Deterministic in-scope test before the gate, **refusal-only**: it may
   escalate, never answer, so it cannot add an unsafe answer. Prereg accept rule: D2 met on the fresh
   held-out out-of-scope set with in-scope recall loss stated; if no operating point improves refusal
   without an unacceptable recall cost, publish the **frontier** and ship the best-safety point.
4. **G6, calibration pipeline** `tooling/calibration/derive-margin.mjs`. Objective, in code and prereg:
   **zero unsafe on the calibration split first, then maximum answer rate**; report on the held-out
   split only. 0.17 is never emitted. Output is a per-tenant (and per-language where P3 says so)
   calibration record.
5. **`highStakes` experiment** (money, safety, minors forcing escalation). Run as a Zone Y experiment,
   publish the false-escalation cost per tenant, ship it as an **optional per-tenant flag, default off**
   (default-on would change the customer-facing promise, which is Zone R).
6. **Unsafe-class taxonomy:** contradictory policy, out-of-scope, superseded wording, adversarial,
   non-English mis-retrieval, and any new class found. Name the residual class.
7. Add an escalation-load metric: false-escalation rate per tenant, next to every recall table.
   A safety layer that escalates everything is not a product.

**Exit gate.** D1, D2, D5, D7 reported honestly; `pnpm run verify` green; `tooling/gate/verify-gate.mjs`
still 10/10 [verify]; the new refusal and manifest tests fail on the pre-change commit and pass after.
**Artifact.** `docs/SAFETY_CASE.md`.

### P5 - Security and isolation proof
**Objective.** A security case that stands without a friendly pilot. Runs in parallel with P3/P4.

1. `docs/THREAT_MODEL.md`: assets (procedure text, query text, escalation evidence, key material,
   tenant identity), trust boundaries (device, edge function, Postgres, JWT claims, bundle manifest).
2. **Fleet isolation suite:** extend `supabase/tests/rls_bypass.sql` (40 probes today [verify]) to
   >= 1,000 attempts across the fleet tenants: JWT forgery, tenant-claim spoofing, direct reads/writes,
   RPC parameter spoofing, bundle substitution, key confusion, service-key absence. **Add negative
   controls** (attempts that must succeed) so a passing suite cannot be an inert suite.
3. **Adversarial audit (65-point, five categories):** direct injection in the query field; indirect
   injection via corpus text (highest-value surface); information extraction (manifest, keys,
   other tenants); tool abuse (SQL injection via RPC params, path traversal and command injection in
   publish/ingest edge functions); goal hijacking (steering the gate to answer when it must escalate).
4. **Two gaps the first plan missed, now mandatory:**
   - **Output sanitization:** web-harvested procedure text is untrusted. Prove that hostile HTML,
     markdown and script payloads in a procedure render inert in the client (stored-XSS test, in-browser).
   - **Poisoned-procedure test:** a hostile or misleading procedure served verbatim is a content-trust
     failure, not an injection. Document what the system does and does not defend, in the threat model.
5. PII/retention: retention suite's plaintext removal holds for the new corpora; a log-scan assertion
   shows no query text reaches a log or third party.
6. Secrets: build-time scan proves no secret reaches a client bundle; rotation procedure documented.
7. Supply chain: `pnpm run audit` green, accepted advisory G9 resolved before 2026-10-30.

Finding rule: fix with a failing test first. Medium/Low may be accepted with a review date and an
entry in DECISIONS. High/Critical may not be accepted without the owner (Zone R).

**Exit gate.** D6 and D11 met; threat model and security case list every finding, fix, accepted risk.
**Artifact.** `docs/SECURITY_CASE.md`.

### P6 - Tenant lifecycle (scripted, no UI)
**Objective.** D10 without building a second product.

1. `tenant-provision`: idempotent, audited, creates tenant, owner principal, key material, first bundle slot.
   The secret key stays server-side and is never in a client bundle.
2. Corpus lifecycle on the existing `upsert-sop` / `publish-bundle`: draft -> conflict lint -> sign ->
   publish -> **rollback**, every transition audited.
3. Calibration (P4 pipeline) as an onboarding step, record stored per tenant.
4. Metering: read-only per-tenant counters (queries, escalations, publishes, storage). **No query text
   in the metering path.** Quotas are deferred.
5. One recorded end-to-end journey on the local stack (provision -> publish -> query -> telemetry),
   with commit SHA. Use the existing dev Supabase project only through the existing probes and only
   inside free tiers.

**Exit gate.** D10 met; journey record written.
**Artifact.** `docs/TENANT_LIFECYCLE.md`.

### P7 - Operations, lite
**Objective.** D9 and D12 with executed drills, not infrastructure for traffic that does not exist.

1. `docs/SLO.md`: availability, p95 query latency, escalation rate, unsafe-answer rate (target 0 with
   the bound), ingest delivery, publish success. Every threshold labeled **provisional, derived from
   simulation** and sourced from `docs/BASELINE.md` and the Market Twin distributions.
2. `docs/RUNBOOK.md`: escalation storm, ingest backlog, publish failure, key rotation, tenant deletion,
   unsafe-answer report, rollback.
3. **Backup-restore drill** into a scratch local PostgreSQL with the same migrations; timestamps recorded.
   If a hosted restore is required for a claim, downgrade the claim to what was executed.
4. **Rollback drill:** publish a bad bundle, roll back, verify a device recovers.
5. `docs/COST_MODEL.md`: measured resource usage per 1,000 queries locally; hosted cost modeled from
   usage x published pricing, labeled `modeled`.
6. CI: smoke per commit, standard nightly. Write the workflow file; do not push it.
No alerting stack and no dashboard-as-code until real traffic exists. Record that as a deferral.

**Exit gate.** D9 and D12 met; drill records written.
**Artifact.** `docs/SLO.md`, `docs/RUNBOOK.md`, `docs/COST_MODEL.md`, drill records.

### P8 - Evidence pack and close
**Objective.** One command regenerates every published number, and the public documents are true.

1. `pnpm run evidence` (create it): regenerates every headline figure and **fails** when a published
   number does not match a re-measured one. Add `tooling/evidence/verify-claims.mjs`.
2. `docs/PROOF.md`: fleet, chaos events, safety result with N and bound, isolation result with negative
   controls, retrieval tables, cost model, each with its command and SHA. **Weakest results first.**
   Include a **Not proven** section with reasons.
3. Rewrite `README.md`, `docs/PRODUCTION_STATUS.md`, `docs/EVIDENCE.md` to match measured reality.
   The wording may change only within the existing customer-facing claim. Any stronger claim goes to
   OWNER_QUEUE (Zone R).
4. `docs/KNOWN_ISSUES.md`: remove each closed gap with its closing evidence; keep every open gap.
5. Update `AGENTS.md` with phase records, measured counts, and new gate commands.
6. Final run: `pnpm run verify`, `pnpm run verify:db`, `pnpm run audit`, `pnpm run evidence`.
7. Prepare the release tag command and the push command. **Do not run them.** Park in OWNER_QUEUE.

**Exit gate.** Every D-target reported as met / NOT MET / not measurable; `pnpm run evidence` green
from a clean clone.
**Artifact.** `docs/PROOF.md`, regenerated `docs/EVIDENCE.md`.

---

## 6. Failure playbook (pre-wired, no asking)

| Failure | Response |
| --- | --- |
| Turbo `os error 231` | Use `pnpm -r run build`. Host limitation, not a repo defect |
| Docker not running | Start it. If impossible, run JS suites and mark SQL suites `not re-run` |
| Source blocks harvest or forbids reuse | Record, exclude, continue. Snapshots are the artifact |
| Quarantine rate > 5% for a source | Drop the source, record the reason |
| Agent labels fail the owner spot-check | Discard that batch for recall; keep for refusal; continue |
| Recall improves only by answering more | Automatic rejection (invariant 9) |
| Gain only inside a margin band | Automatic rejection (invariant 10) |
| Refusal layer destroys recall | Publish the frontier, ship the best-safety point |
| Schema change breaks verify | After 3 cycles, fall back to the number-word parser (P4.2) |
| Fleet run too slow | Smoke in CI, standard nightly, stress on demand |
| Headless Chrome flake | Hash outputs, count distinct decisions, fail on `Runtime.exceptionThrown`; a delta must reproduce on a second seed |
| Isolation suite passes trivially | Negative controls must succeed; if they do not, the suite is broken |
| Hosted free tier exhausted | Run the fleet locally; hosted carries journey proof only |
| Scope creep (admin UI, sign-up, billing, mobile) | Section 7 is the fence |
| A published number drifts | `pnpm run evidence` fails the build. Fix the number or the claim |

---

## 7. Deferred (do not build, do not "just quickly add")

Self-serve sign-up and email verification, admin console, quotas and plan gating, alerting stack and
dashboards-as-code, sandbox billing and any payment code, social login, 5,000-procedure recall target,
mobile app. Keep the list in `docs/program/DEFERRED.md`. Touching these is a Zone R decision.

---

## 8. Carried numbers (all `[carried]`, re-measure in P0, never quote before)

- 500-ticket deployed path: 361/500 (72.2%), 138 false escalations, 1 unsafe, 0 runtime errors.
- Isolation audit: 500/500 events, 261/261 escalations tagged, 0 untagged.
- Holdout seed: 379/500 (75.8%) at margin 0.17, 0 unsafe (0.17 is harness-only; unsafe at 48 procedures).
- 48-procedure recall: 84/302 (27.8%) in scope at 0.18; English 62.1% vs Spanish 32.0%, Portuguese 31.0%.
- 6 of 52 out-of-scope public questions falsely accepted at 0.18.
- Evidence base: 47 distinct messages across 7 procedures.
- Suites: gate 10/10, sync 31/0, persistence 33/0, rotation 13/0, telemetry queue 35/0, RBAC 99/0,
  ingest 27/0, RLS bypass 40/0, retention 16/0.

---

## 9. Verification matrix (claim -> command)

| Claim | Command |
| --- | --- |
| JS suites pass | `pnpm run verify` |
| SQL suites pass | `pnpm run verify:db` |
| Pinned batch unmodified | `node tooling/eval/simulated-tenant/verify-tickets.mjs tooling/eval/simulated-tenant/chaos-500.json` |
| Corpus provenance, licence, PII, counts | `node tooling/corpus/verify-corpus.mjs --manifest tooling/corpus/manifest.json` (create in P1) |
| Market Twin | `node tooling/market/run-market.mjs --seed 20261006 --rung smoke` / `--rung standard` (create in P2) |
| Retrieval at scale | `node tooling/eval/simulated-tenant/run-chaos-evaluation.mjs` per rung and language |
| Gate safety | `node tooling/gate/verify-gate.mjs` |
| Conflict lint | `node tooling/conflicts/verify-conflict-lint.mjs` |
| Deployed journey / sign-in / probes | `pnpm run verify:deployed`, `verify:signin`, `probe:*` |
| Dependency gate | `pnpm run audit` |
| Every published number | `pnpm run evidence` (create in P8) |

---

## 10. Reporting formats

**Phase report** (`docs/program/phase-<N>-report.md`, max one page):
`SHA | gate command -> result | what changed | numbers (with N, bound, data_mode, label_source) |
rejected experiments | parked items | next phase unblocked: yes/no`.

**Owner queue entry** (`docs/program/OWNER_QUEUE.md`): `id | what | why it is Zone R | default in effect |
exact command or file to review | minutes of owner time`. Batch entries; never interrupt for one.

**Status board** (`docs/program/STATUS.md`): one row per phase with `done | in progress | parked | not met`,
updated at every phase end.

---

## 11. Start now (no question needed)

1. Create `docs/program/` with `STATUS.md`, `DECISIONS.md`, `OWNER_QUEUE.md`, `DEFERRED.md`, and a
   `FAILURES/` folder. Create branch `prog/main`.
2. Open `prog/p0-integrity` and execute P0 in the order written.
3. When P0's gate passes, merge to `prog/main`, write the phase report, and begin P1 without waiting.
4. First message to the owner is the P0 report: the re-measured table, every drift from carried
   numbers, the result of the G1 reproduction, and the first OWNER_QUEUE batch (20-row label
   spot-check, NC/ND licence list, push command). Then keep going.

**Cut line if time runs short**, drop in this order and record each cut in STATUS.md:
P7 cost model -> P6 metering -> P3 per-language index (keep per-language thresholds) -> P1 fleet from
6 to 4 tenants. **Never cut:** P0, P2 smoke, P4, P5 isolation suite, P8.
