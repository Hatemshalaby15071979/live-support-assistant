# LIVE Support Assistant — Autonomous Production SaaS Program

**Status:** proposed, awaiting owner review. Nothing in this document has been executed.
**Date:** 2026-10-06.
**Author:** Codex (implementation agent).
**Register:** specification. Findings first, mechanism second, evidence third.
**Scope of change:** this document only. No source, schema, migration, or configuration file is
touched by this pass.

---

## 0. How to read this document

This is an executable program, not a strategy memo. Every phase carries:

| Field | Meaning |
| --- | --- |
| **Objective** | The single outcome the phase exists to produce. |
| **Work items** | Numbered, concrete, each with an artifact. |
| **Predicted struggles** | The failures I expect, named in advance, each with a pre-wired automatic response. |
| **Exit gate** | The command(s) that must pass before the phase closes. |
| **Evidence artifact** | The file that survives the phase and carries the claim. |

Section 4 defines the authority ladder that lets this run without asking you for routine decisions.
Section 15 maps every claim in this program to the command that proves it. Section 16 is the
immediate next action on approval.

---

## 1. Executive summary

### 1.1 The finding

The repository is a **finished prototype with an unfinished production perimeter**. Phases 0–7 are
complete and independently verified; the decision path (on-device retrieval → deterministic
confidence gate → content-free escalation) is real and measured. What is missing is not the
engineering philosophy — it is the **operational and commercial envelope** around it: scale,
calibration, isolation proof at fleet size, self-serve onboarding, observability, and a security
case that does not depend on a friendly pilot.

The honest gap, in one line:

> The product is proven to *refuse well on seven procedures*. It is not proven to *answer well at
> production corpus sizes*, and it is not *operable* as a service by anyone who is not the author.

### 1.2 The constraint, restated as a design decision

You require production readiness **without external clients**. This is not a limitation to work
around; it is the strongest available evidence strategy, and the program is built on it:

- A single friendly pilot proves one tenant, one corpus, one language, one happy path.
- A **simulated market of many tenants under adversarial conditions** proves the isolation model,
  the failure envelope, the calibration pipeline, and the cost curve — repeatably, in public, with
  a command anyone can re-run.

The pilot proves *it worked once*. The simulated market proves *it fails safely, always* — which
is the only claim this product is allowed to make, because a wrong procedure in a support reply is
a compliance breach, not a drafting error.

### 1.3 The three pillars

| Pillar | What it produces | Why it is sufficient without a client |
| --- | --- | --- |
| **A. Web-Sourced Live Corpus** | Real, publicly published procedure documents and real, publicly posted user questions, harvested with provenance, licence and PII gates, pinned by SHA. | Real documents and real phrasing replace the 47 distinct templates that currently carry every headline number. |
| **B. Live Market Twin** | A seeded, replayable simulation of a multi-tenant support market: arrival bursts, language mix, mid-flight corpus edits, contradictory policies, hostile input, degraded infrastructure. | Chaos is generated and replayed deterministically, so a failure is a reproducible artifact, not an anecdote. |
| **C. Production Envelope** | Calibration pipeline, isolation proof at fleet scale, self-serve tenancy, metering, observability, SLOs, rollback, cost model, security case. | The service becomes operable by someone who is not the author — the definition of production. |

### 1.4 What this program does **not** do

- It does not put a generative model in the answering path. That boundary is the product. Any LLM
  introduced anywhere in this program is confined to **corpus authoring assistance, query-set
  generation, and evaluation judging** — never to query, retrieval, gate, answer, or escalation.
- It does not claim production readiness from a green build. Every phase closes on a measured
  artifact, not a passing command alone.
- It does not ask you to make a decision it can make itself. Section 4 defines the boundary; the
  escalations that remain are four, all listed in Section 14.

---

## 2. Current state — grounded baseline

Every figure below is taken from a file in this repository, with its source named. Nothing is
estimated.

### 2.1 What is verified today

| Area | Measured | Source |
| --- | --- | --- |
| Confidence gate never leaks procedure text on escalation | 10/10 checks | `tooling/gate/verify-gate.mjs` |
| Encrypted sync protocol | 31 checks, 0 failures | `tooling/sync/verify-sync.mjs` |
| Persistence adapters | 33/0 | Phase 6 record, `AGENTS.md` |
| Key rotation | 13/0 | Phase 7 record, `AGENTS.md` |
| Telemetry queue | 35/0 | `tooling/telemetry/verify-queue.mjs` |
| RBAC matrix (PostgreSQL) | 99 probes, 0 failures | `supabase/tests/rbac_matrix.sql` |
| Telemetry ingest | 27/0 | `supabase/tests/phase5_telemetry.sql` |
| RLS bypass attempts | 40/0 | `supabase/tests/rls_bypass.sql` |
| Retention | 16/0 | `supabase/tests/phase8_retention.sql` |
| Conflict lint blocks publish | 422 on contradictory corpus | `supabase/functions/publish-bundle/index.ts` |
| 500-ticket deployed path | 361/500 (72.2%), 138 false escalations, 1 unsafe, 0 runtime errors | `tooling/eval/simulated-tenant/phase5-deployed-run-0aec9773442c4282.md` |
| Tenant isolation audit (deployed) | 500/500 events, 261/261 escalations tagged, 0 untagged rows | same file |
| Independent holdout seed | 379/500 (75.8%) at 0.17, 0 unsafe | `tooling/eval/simulated-tenant/phase5-holdout-seed-20260929-margin-017.md` |

### 2.2 What is not verified — the gap ledger

This is the working list. Section 15 carries the exit gate for each.

| # | Gap | Measured consequence | Source |
| --- | --- | --- | --- |
| G1 | Client never verifies its loaded embedding model against the bundle manifest | A bundle built with a different model is served against a mismatched local model; this is the recorded-but-unexplained cause of the deployed/local divergence (0.180757 vs 0.167715) | `docs/KNOWN_ISSUES.md` §1 |
| G2 | Conflict lint parses English number words only | A contradictory procedure written in es/pt-BR/fr is not caught, and therefore not refused at publish, for that language | `docs/KNOWN_ISSUES.md` §2 |
| G3 | Recall at 48 procedures | 84/302 (27.8%) in scope at 0.18 — the weakest measured point, and 48 is not the 5,000-procedure scale the design names | `docs/KNOWN_ISSUES.md` §3 |
| G4 | Non-English gap | English 62.1% vs Spanish 32.0%, Portuguese 31.0% on the same corpus | `docs/KNOWN_ISSUES.md` §4 |
| G5 | Out-of-scope public questions answered | 6 of 52 false accepts at 0.18, every one at a margin ≥ the shipped default | `docs/KNOWN_ISSUES.md` §5 |
| G6 | No tenant calibration | `minMargin: 0.18` is a prototype default; 0.17 is harness-only and unsafe at 48 procedures | `docs/KNOWN_ISSUES.md` §6 |
| G7 | Hosted transport not wired into the standalone path | A query's telemetry/escalation is not delivered in the standalone demo; only the deployed path completes the round trip | `docs/KNOWN_ISSUES.md` §7 |
| G8 | Demo tooling is Windows-only | The walkthrough cannot be re-rendered off Windows as written | `docs/KNOWN_ISSUES.md` §8 |
| G9 | Accepted dependency advisory (node-forge, High) | No patched release; reachable only via the unbuilt `@sop/mobile` Expo tooling | `docs/KNOWN_ISSUES.md` §9 |
| G10 | Evidence base is 47 distinct messages across 7 procedures | Ticket-level rates are weighted by template repetition; the distinct message is the unit of evidence | `.workbuddy-ai/memory/MEMORY.md`, owner ruling |
| G11 | Deployed runs record no git commit hash | Neither deployed run is byte-for-byte reproducible from this repository | `docs/EVIDENCE.md` |
| G12 | No self-serve tenancy, no provisioning, no admin lifecycle | Only a pre-provisioned demo user can reach the app | `docs/PRODUCTION_STATUS.md` |
| G13 | No metering, quotas, plan gating, or billing | No commercial surface exists | `docs/PRODUCTION_STATUS.md` |
| G14 | No SLOs, alerting, incident runbooks, backup/restore drill | Operability is unproven | inferred from repository contents |
| G15 | No cost model | Inference is on-device (good), but hosted Postgres/edge/storage cost at fleet scale is unmeasured | inferred |
| G16 | Three retrieval changes measured and rejected | Wording edit, cross-encoder reranker, multilingual embedder — all rejected on measurement | `docs/EVIDENCE.md` |

### 2.3 The reading

G1–G6 are **product correctness** gaps. G7–G9 and G11 are **evidence integrity** gaps. G12–G15 are
**service** gaps. G16 is a **constraint**, not a gap: it tells us which doors are already closed, so
the program does not reopen them.

---

## 3. Definition of done — the exit scorecard

The program closes when every row below is true **and** reproducible by one command from a clean
clone. Targets marked *(ratifiable)* are my proposal; they are derived from the product's own
promises where possible and are yours to adjust in one pass.

| # | Dimension | Exit criterion | Class |
| --- | --- | --- | --- |
| D1 | **Safety** | 0 unsafe answers across the full Live Market Twin fleet at the shipped margin, with the unsafe class enumerated and the residual class named | non-negotiable |
| D2 | **Refusal** | ≥ 49 of 52 out-of-scope public questions refused (currently 46/52) | *(ratifiable)* |
| D3 | **Recall at scale** | In-scope recall ≥ 70% at 500 procedures, ≥ 60% at 5,000 procedures, measured per language | *(ratifiable)* |
| D4 | **Language parity** | en/es/pt-BR/fr recall spread ≤ 10 percentage points at 500 procedures | *(ratifiable)* |
| D5 | **Calibration** | Every fleet tenant carries a calibration record derived from its own corpus; 0.17 never appears as a tenant setting | non-negotiable |
| D6 | **Isolation** | 0 successful cross-tenant reads or writes across a ≥ 1,000-attempt adversarial suite spanning JWT forgery, direct table writes, RPC parameter spoofing, bundle substitution, and key confusion | non-negotiable |
| D7 | **Manifest integrity** | A client presented with a mismatched bundle refuses to serve search, and the refusal is a test, not a comment | non-negotiable |
| D8 | **Reproducibility** | Every headline number in README/EVIDENCE/PRODUCTION_STATUS is regenerated by `pnpm run evidence` and every deployed claim carries a commit SHA | non-negotiable |
| D9 | **Operability** | SLOs published; alert thresholds wired; a restore-from-backup drill executed and recorded; a bundle rollback executed and recorded | non-negotiable |
| D10 | **Self-serve** | A stranger can provision a tenant, publish a corpus, run a query, and read their own telemetry without the author's involvement | non-negotiable |
| D11 | **Supply chain** | `pnpm run audit` green with no unexpired accepted advisory | non-negotiable |
| D12 | **Cost** | Hosted cost per 1,000 queries measured and published | *(ratifiable)* |

**D1 is the program's spine.** Everything else exists to make D1 true at a scale and in a variety
that the current 7-procedure corpus cannot reach.

---

## 4. Autonomy protocol — the authority ladder

This section is what makes the program autonomous rather than a queue of questions. It defines, in
advance, what I decide, what I decide-and-report, and what I stop for.

### 4.1 Tier 1 — I decide and execute without asking

| Class | Examples |
| --- | --- |
| Tooling and harness code | New evaluation runners, generators, analyzers, reporters under `tooling/` |
| Test and fixture authoring | New test suites, new pinned corpora, new synthetic tenants |
| Documentation that reports measurement | `docs/EVIDENCE.md`, `docs/KNOWN_ISSUES.md`, `docs/PRODUCTION_STATUS.md` updates |
| Refactors that preserve behaviour | Extraction, typing, dead-code removal, config-driven path fixes |
| Dependency upgrades inside existing major versions | Patch/minor bumps that keep `pnpm run verify` green |
| Bug fixes with a failing test that the fix makes pass | G1, G2, G7, G8 |
| Local commits on a working branch | Per the standing authorization in `AGENTS.md` |

### 4.2 Tier 2 — I decide, execute, and report prominently

| Class | Examples | Reporting duty |
| --- | --- | --- |
| Schema migrations | Structured policy facts (fixes G2 at the root) | Migration file + rollback + ledger entry |
| Gate behaviour changes | High-stakes escalation flag; scope/refusal layer (G5) | Before/after on the full fleet; false-escalation delta stated |
| Threshold or calibration policy | Per-tenant calibration objective | The objective function written down, not implied |
| Retrieval architecture change | Index strategy, passage budget, chunking (G3) | Measured against the rejected-experiment register |
| New runtime dependency | Only if it replaces more code than it adds | Justification in the ledger |

### 4.3 Tier 3 — I stop and ask (the only four)

| # | Decision | Why it is yours | My default if you do not answer |
| --- | --- | --- | --- |
| A1 | **Spend** — anything that costs money beyond existing free tiers (hosted project upgrade, model hosting, paid dataset licence) | It is your money | Stay on free tiers; the program is designed to complete on them |
| A2 | **Public actions** — pushes, releases, public deployment, anything that leaves this machine | Standing rule in `AGENTS.md` | Stay local; prepare the artifact and the exact command |
| A3 | **Commercial scope** — whether billing/subscriptions enter the product at all | It contradicts the earlier `PRODUCTION_READINESS_EXECUTION_PROMPT.md` ("do not add payments, billing, subscriptions") | Phase 8 is written but **not executed**; the program reaches D1–D12 without it |
| A4 | **Promise changes** — any change to what the product claims to a customer | The handover is the product | Preserve the current claim; record the proposed change |

### 4.4 The no-bounce rule

Every escalation to you must arrive as a **complete package**, never as a question:

1. The finding, with its measurement.
2. At least one mitigation **already implemented on a branch**, with the result.
3. The residual risk, stated plainly.
4. The decision, framed as a choice between named options with my recommendation first.

A message that contains only a problem is a defect in my execution, not in the repository.

### 4.5 Honesty invariants (inherited from the repository, binding on this program)

1. **Re-run before writing a count.** Never carry forward an unmeasured figure.
2. **Separate executed from reasoned.** Every claim names its command or its reasoning.
3. **The distinct message is the unit of evidence.** Ticket-level rates never travel without the
   distinct-message count.
4. **Tag every dataset.** `data_mode: "simulated" | "web-sourced" | "measured"` on every artifact.
5. **Never compare two retrieval paths at the same numeric margin.** Different units; compare each
   at its own zero-unsafe operating point.
6. **A corpus wording edit is a template perturbation, not a distribution shift.** Count distinct
   messages before reading a delta.
7. **Derived media is not evidence.** Text and JSON are.
8. **Pinned data is immutable.** `chaos-500.json` (`717c40dc…`) is never mutated; new fields go in
   code and in report rows.

---

## 5. Target architecture

### 5.1 What exists

```
apps/web (React 19 + Vite)  ──┐
  ├─ on-device embedder (pinned MiniLM int8, ONNX)
  ├─ vector-store (passage extraction + cosine)
  ├─ confidence gate (@sop/core)
  ├─ SupabaseTransport ──► ingest_telemetry_event / ingest_escalation (SECURITY DEFINER RPC)
  └─ bundle-client ──► bundle delivery
packages/sync (encrypted bundle protocol, key rotation)
supabase/ (17 migrations, 4 SQL suites, 2 edge functions)
tooling/ (gate, parity, sync, telemetry, db, conflicts, browser, transport, eval, video)
```

### 5.2 What is added

```
tooling/market/          ← NEW  Live Market Twin: tenant fleet, traffic model, chaos events, replay
tooling/corpus/          ← NEW  Web-Sourced Live Corpus: harvest, licence gate, PII gate, pinning
tooling/calibration/     ← NEW  Per-tenant margin derivation (safety-first objective)
tooling/evidence/        ← NEW  One command that regenerates every published number
supabase/migrations/…    ← NEW  Structured policy facts; tenant provisioning; metering; audit trail
supabase/functions/…     ← NEW  tenant-provision, corpus-ingest, usage-meter (edge)
apps/admin/              ← NEW  Tenant control plane (onboarding, corpus lifecycle, calibration, usage)
packages/observability/  ← NEW  Shared SLO/event contracts for client + edge
docs/                    ← NEW  SLO.md, THREAT_MODEL.md, SECURITY_CASE.md, RUNBOOK.md, COST_MODEL.md
```

### 5.3 Invariants the architecture must preserve

- No generative model in query, retrieval, gate, answer, or escalation.
- The gate remains deterministic and content-blind.
- Escalation carries no procedure text, no title, no suggested reply.
- The write boundary stays `SECURITY DEFINER` RPCs that read the tenant from the JWT.
- Bundle publish refuses a contradictory corpus.
- Query text never leaves the device except as the tenant's own telemetry, under the tenant's
  retention policy.

---

## 6. Pillar A — Web-Sourced Live Corpus

### 6.1 Objective

Replace the 47-template evidence base with **real, publicly published documents and real, publicly
posted questions**, harvested with provenance, licence and privacy gates, pinned by SHA.

### 6.2 The two halves

| Half | What it is | Where it comes from | Why it is legitimate |
| --- | --- | --- | --- |
| **Procedures** (the tenant corpus) | Publicly published help-centre / policy / terms articles | Public help centres of real products across domains | These are the *tenant's own* published policy documents. In a real deployment the corpus is exactly this. Public publication is the intended use. |
| **Questions** (the query set) | Real user-phrased questions | Public Q&A surfaces whose terms permit it | The product's input is a plain-text customer question. Real phrasing is the only way to test the real distribution. |

### 6.3 The gates — every harvested item passes all five

| Gate | Rule | Failure action |
| --- | --- | --- |
| **Licence** | The source must permit the intended use. Record licence id + URL. | Item excluded; exclusion counted in the report, never silently dropped. |
| **Provenance** | Record URL, retrieval timestamp, content SHA-256, source id. | Item cannot enter a corpus without a complete provenance record. |
| **Privacy** | Reject email-like, phone-like, address-like, account-like, and person-name-shaped strings. | Item quarantined with the matched pattern; never silently scrubbed. |
| **Attribution** | Every derived corpus carries a machine-readable attribution file. | Corpus cannot be published to a tenant without it. |
| **Stability** | Snapshot to `tooling/corpus/snapshots/<sha>.json`; the snapshot is the artifact, not the live URL. | A live fetch is never a build input. |

> **This is the correction to the current approach.** `tooling/eval/simulated-tenant/dataset-sources.md`
> reviewed three public ticket datasets and correctly used **metadata only**, because none
> established anonymisation and two contained personal-data-shaped fields. That caution stands and
> is now mechanised: the gates above replace a judgement call with an enforced pipeline.

### 6.4 The fleet — twelve tenants, real documents, realistic shape

| Tenant | Domain | Languages | Corpus size ladder |
| --- | --- | --- | --- |
| T01 | Creator platform | en, es, pt-BR | 40 → 500 → 5,000 |
| T02 | SaaS billing | en, fr | 40 → 500 |
| T03 | Telecom | en, es | 40 → 500 |
| T04 | E-commerce | en, pt-BR, fr | 40 → 500 → 5,000 |
| T05 | Travel | en, es | 40 → 500 |
| T06 | Banking-adjacent | en | 40 → 500 |
| T07 | Education | en, fr | 40 → 500 |
| T08 | Gaming | en, es, pt-BR | 40 → 500 |
| T09 | Food delivery | en, es | 40 → 500 |
| T10 | Logistics | en, pt-BR | 40 → 500 |
| T11 | Marketplace | en, es, fr | 40 → 500 |
| T12 | Healthcare-adjacent | en | 40 → 500 |

The 5,000-procedure rung exists specifically to close G3, which names 5,000 as the design target and
48 as the current ceiling.

### 6.5 Work items

1. `tooling/corpus/harvest.mjs` — fetcher with robots/terms check, rate limiting, snapshot writer.
2. `tooling/corpus/licence-gate.mjs` — allowlist of licence ids; refuses anything else.
3. `tooling/corpus/pii-gate.mjs` — pattern + shape detector; quarantine, never scrub.
4. `tooling/corpus/build-tenant.mjs` — turns a snapshot set into a tenant corpus + attribution file.
5. `tooling/corpus/snapshots/` — the pinned artifacts, SHA-named.
6. `tooling/corpus/manifest.json` — every corpus, its tenants, its SHA, its licence set, its counts.
7. `docs/CORPUS_PROVENANCE.md` — human-readable provenance ledger.

### 6.6 Predicted struggles and pre-wired responses

| Predicted struggle | Automatic response (built before it is needed) |
| --- | --- |
| A source blocks automated retrieval | The snapshot store already holds the artifact; the harvest step is not on the critical path. Record the block, continue. |
| A source's terms forbid reuse | The licence gate excludes it and the exclusion appears in the report. The fleet has twelve tenants; losing one is not a program risk. |
| Harvested text carries personal data | The PII gate quarantines. If the quarantine rate exceeds 5% for a source, that source is dropped automatically and the reason recorded. |
| Real documents are longer than the current passage extractor assumes | The extractor's passage budget is measured first (§7.3), then the corpus is built to it. |
| Real documents contradict each other inside one tenant | This is *desirable*: it is the G2/G5 test case, produced by reality rather than by injection. The conflict lint must catch it; if it does not, that is a finding. |

---

## 7. Pillar B — Live Market Twin

### 7.1 Objective

A seeded, replayable simulation of a multi-tenant support market under real market chaos, such that
every failure is a reproducible artifact with a command.

### 7.2 The traffic model

| Dimension | Modelled | Why it matters |
| --- | --- | --- |
| Arrival process | Diurnal curve + Poisson bursts + incident spikes | Reveals queue ordering, ingest throttling, latency cliffs |
| Language mix | Per-tenant, drawn from the tenant's real language set | Exercises G4 under realistic proportions, not a synthetic 50/50 |
| Phrasing | Real web-sourced questions + perturbations | Tests the real distribution, not template repetition (G10) |
| Repeat contact | Same issue, rephrased, within a session | Tests determinism and idempotency |
| Adversarial | Injection attempts, hostile content, contradictory asks | Tests the safety case (§10) |
| Infrastructure | Degraded network, retries, clock skew, duplicate submission | Tests the queue and the idempotency contract |

### 7.3 The chaos event library

| Event | Injected by | Expected safe behaviour |
| --- | --- | --- |
| Corpus edited mid-flight | Replace a procedure between bundles | Existing bundle keeps serving; new bundle gated by conflict lint |
| Contradictory policy published | Attempt to publish a conflicting corpus | HTTP 422, named procedures and values |
| Model version drift | Bundle built with a different model id/revision | Client refuses to serve search (this is D7, currently failing) |
| Bundle substitution | Serve tenant A's bundle to tenant B | Client refuses; server-side check records the attempt |
| Key rotation mid-session | Rotate the tenant's key while a device is live | Device re-fetches; no plaintext leak |
| Network partition | Drop ingest responses for N seconds | Queue retains order; flush on recovery; no duplicate audit rows |
| Clock skew | Shift the device clock | Retention and ordering unaffected |
| Duplicate submission | Replay the same event id | Idempotent; exactly one audit row |
| Throttle saturation | Exceed the ingest throttle | Throttled, not dropped; client backs off |
| Deletion request | Tenant requests query-text deletion | Retention removes plaintext, keeps the audit skeleton |

### 7.4 The runner

`tooling/market/run-market.mjs` — one command, one seed, one report. Deterministic: the same seed
produces byte-identical decisions. The report carries:

- per-tenant, per-language, per-corpus-size outcome tables;
- unsafe / false-escalation / correct counts with the **distinct-message denominator**;
- the chaos events injected and each one's observed behaviour;
- the git commit SHA, the corpus SHAs, the model revision, the margin, and the environment;
- a machine-readable JSON beside a human-readable Markdown.

### 7.5 Predicted struggles and pre-wired responses

| Predicted struggle | Automatic response |
| --- | --- |
| The fleet run is too slow to iterate on | Three rungs (smoke: 1 tenant / 40 procedures; standard: 12 tenants / 500; full: 12 tenants / 5,000). CI runs smoke; nightly runs standard; the full rung is on demand. |
| Headless Chrome flakes under load | The existing capture discipline applies: hash the outputs, count *distinct* frames/decisions, assert coverage, fail on `Runtime.exceptionThrown`. |
| A flake is mistaken for a finding | Every reported delta must reproduce on a second seed before it is written down. |
| The seed corpus drifts from the real one | Snapshots are SHA-pinned and immutable; a corpus change is a new SHA and a new report. |

---

## 8. Pillar C — Production envelope

### 8.1 Phase map

```
P0  Baseline freeze                    ─── prerequisite for everything
P1  Web-Sourced Live Corpus            ─┐
P2  Live Market Twin                   ─┴─► P3, P4, P5 can run in parallel after P2
P3  Retrieval at production scale      ─┐
P4  Gate & safety hardening            ─┼─► P6 depends on P3+P4+P5
P5  Security & isolation proof         ─┘
P6  Multi-tenant SaaS control plane    ─── P7 depends on P6
P7  Production operations (SRE)        ─── P8 (optional) depends on P6
P8  Commercial layer (sandbox)         ─── OWNER DECISION — not executed by default
P9  Launch readiness & evidence pack   ─── closes the program
```

---

### P0 — Baseline freeze

**Objective.** Every existing claim re-measured on current HEAD, so no figure in this program is
carried forward unverified.

**Work items.**

1. `pnpm install && pnpm -r run build` on current HEAD.
2. `pnpm run verify` — all eight JS suites, on current HEAD.
3. `pnpm run verify:db` — the three SQL suites against the local PostgreSQL.
4. `node tooling/eval/simulated-tenant/verify-tickets.mjs tooling/eval/simulated-tenant/chaos-500.json`
   — `SIMULATED DATA VALIDATION OK`.
5. Re-run the canonical 0.18 batch under a **new label** (the driver refuses to overwrite an
   existing label) and diff against `phase5-original-margin-018-repro.json`.
6. Write `docs/BASELINE.md` with the re-measured table, the commit SHA, and any drift.

**Predicted struggles.**

| Struggle | Automatic response |
| --- | --- |
| Turbo fails with `os error 231` on this host | Use `pnpm -r run build`; the ledger already records this as a host limitation, not a repo defect. |
| The Docker daemon is not running for `verify:db` | Start it; if unavailable, run the JS suites and mark the SQL suites `not re-run` explicitly rather than omitting them. |
| A carried-forward count no longer matches | That is the finding. Correct the count everywhere it appears and record the drift in `docs/BASELINE.md`. |

**Exit gate.** `pnpm run verify` green, `verify-tickets.mjs` prints its OK line, `docs/BASELINE.md`
written with every number re-measured and a commit SHA.

**Evidence artifact.** `docs/BASELINE.md`.

---

### P1 — Web-Sourced Live Corpus

**Objective.** Twelve tenants carrying real, publicly published documents, plus a real-phrased
question set, all provenance-gated and SHA-pinned.

**Work items.** §6.5, items 1–7, then:

8. Run the five gates over every candidate source; publish the exclusion report.
9. Build the 40 / 500 / 5,000 rungs for the tenants marked for each.
10. Produce `docs/CORPUS_PROVENANCE.md` with per-source licence, counts, quarantine rate, and SHA.

**Predicted struggles.** §6.6.

**Exit gate.**
```
node tooling/corpus/verify-corpus.mjs --manifest tooling/corpus/manifest.json
```
must print a verdict line and exit 0, asserting: every corpus has complete provenance, every licence
is allowlisted, zero unquarantined PII matches, and the declared counts match the actual counts.

**Evidence artifact.** `tooling/corpus/manifest.json` + `docs/CORPUS_PROVENANCE.md`.

---

### P2 — Live Market Twin

**Objective.** One command that replays a twelve-tenant market with the chaos library and produces a
reproducible report.

**Work items.** §7.2–7.4, plus:

5. `tooling/market/traffic.mjs` — seeded arrival model.
6. `tooling/market/chaos.mjs` — the ten events, each independently injectable.
7. `tooling/market/assert.mjs` — the invariants: order preserved, no duplicate audit rows, no
   plaintext on escalation, no cross-tenant tag.
8. Wire the smoke rung into `tooling/run-verification.mjs` so it becomes part of the gate.

**Exit gate.** `node tooling/market/run-market.mjs --seed 20261006 --rung smoke` produces a report
with `unsafe` counted explicitly (not assumed zero) and every invariant asserted.

**Evidence artifact.** `tooling/market/reports/<label>.md` + `.json`.

---

### P3 — Retrieval at production scale

**Objective.** Close G3 and G4 with measurement, not with a library swap.

**Work items.**

1. Measure the retrieval geometry at 40 / 500 / 5,000 procedures: passage count per procedure,
   query embed latency, search latency, memory.
2. Decide the index strategy against measurement: brute-force cosine (current) vs HNSW vs IVF.
   *Brute force is already flat at 10,000 vectors (9.2 ms mean); the question is whether 5,000
   procedures × N passages crosses a real threshold.* Measure before changing.
3. Decide the passage budget with the context-budget method (§17.1): how many passages reach the
   gate, and what the runner-up needs to be meaningful.
4. Re-test the multilingual question **at 500 procedures**, with the language trade measured
   explicitly. The rejected experiment (`evidence/multilingual-embedder`, `65b76aef103f`) traded
   en −9.7 pp for es +9.6 / pt +12.2. A **language-routed** or **per-language-threshold** design is
   a different experiment from the one that was rejected, and is the one to run.
5. Per-language calibration is **not** a Phase 3 decision — it is P4's pipeline. P3 supplies the
   distributions P4 consumes.

**Predicted struggles.**

| Struggle | Automatic response |
| --- | --- |
| 5,000 procedures × multi-language passages exceeds browser memory | Passage budget is a first-class setting, not a constant. If the browser cannot hold the index, that is the finding, and the design response is a per-language index or a lazy-load scheme — decided on the measurement, not in advance. |
| Recall improves only by answering more (the reranker's failure mode) | Every recall figure is published beside its unsafe count. A recall gain with a new unsafe answer is a rejection, automatically. |
| The improvement is threshold-dependent (the wording experiment's failure mode) | Report the margin band. A gain that exists only inside a band the threshold could move through is rejected. |
| The multilingual result is again a wash | Then the finding is "the gap is a calibration problem, not a model problem", and P4 solves it per language. Both outcomes are useful; neither is a dead end. |

**Exit gate.**
```
node tooling/eval/simulated-tenant/run-chaos-evaluation.mjs   # per rung, per language
```
with D3 and D4 met, and the rejected-experiment register re-checked so no rejected door is reopened.

**Evidence artifact.** `docs/RETRIEVAL_AT_SCALE.md` with per-rung, per-language tables.

---

### P4 — Gate and safety hardening

**Objective.** Close G1, G2, G5, G6, and settle the deferred option (b) from
`docs/decisions/conflicting-procedures.md`.

**Work items.**

1. **G1 — manifest integrity.** The client reads the embedding model id and revision from the bundle
   manifest and refuses to serve search on mismatch. `apps/web/src/bundle-client.ts` currently reads
   only `bundleVersion` and `sops`; `apps/web/src/App.tsx` records the model from the build-time
   constant. Both change. The refusal path gets a test that fails today.
2. **G2 — conflict lint at the root.** Two options, in order of preference:
   - **(a) Structured policy facts.** Numeric policy values become structured fields on the
     procedure (category, field, value, unit, window). The lint compares structured values — language
     independent, no prose regex, no false positives from prose mentioning a range. This is a schema
     change: `packages/core`, the bundle format, the publisher, the database, and a migration.
   - **(b) Multilingual number-word parsing** per language. Cheaper, but keeps the prose-regex false
     positives that `conflict-core.mjs:33-34` documents.
   Recommendation: (a). It removes the failure class instead of translating it. (b) is the fallback
   if the schema change proves to be a product risk in review.
3. **G5 — scope and refusal layer.** A deterministic in-scope test before the gate: is this question
   inside the tenant's corpus domain at all? Designed as a **refusal-first** layer — it can only
   escalate, never answer — so it cannot introduce an unsafe answer. Measured on the 52-question
   refusal set (D2).
4. **G6 — per-tenant calibration pipeline.** `tooling/calibration/derive-margin.mjs`. Objective,
   written down and enforced: **zero unsafe answers on the tenant's labelled set first, then maximum
   answer rate**. The output is a per-tenant margin with a calibration record. 0.17 is never
   emitted; it stays harness-only.
5. **Option (b) from the deferred decision.** A `highStakes` flag forcing escalation on money,
   safety, and minors. The decision document defers it because it raises the false-escalation rate
   and needs a schema change. With the Market Twin measuring the false-escalation cost per tenant,
   the decision becomes empirical. **Run it as an experiment, publish the cost, and let the number
   decide** — then report it as Tier 2 (decide, execute, report).
6. **Unsafe-class enumeration.** D1 requires the unsafe class to be *named*, not merely counted
   zero. Produce the taxonomy: contradictory policy, out-of-scope, superseded wording, adversarial,
   non-English mis-retrieval.

**Predicted struggles.**

| Struggle | Automatic response |
| --- | --- |
| The refusal layer escalates too much and D2 is met by destroying D3 | It is measured on both sets simultaneously. The layer's operating point is chosen at the point where refusal improves without an unacceptable in-scope cost — and if no such point exists, the finding is "the two goals conflict" with the frontier published, not a hidden trade. |
| Structured policy facts break the existing corpus | The migration is additive; the lint falls back to prose parsing for procedures with no structured facts, and the fallback rate is published. |
| High-stakes flag raises false escalations unacceptably | That is the measurement. If it does, the recommendation is "publish-path block only" and the experiment is recorded as rejected with its cost. |
| A safety fix reduces headline accuracy | Expected. Safety is D1 and outranks D3. The trade is published, never absorbed. |

**Exit gate.** D1, D2, D5, D7 met; `pnpm run verify` green; `tooling/gate/verify-gate.mjs` still 10/10;
the new refusal and manifest tests fail on the pre-change commit and pass on the post-change commit.

**Evidence artifact.** `docs/SAFETY_CASE.md`.

---

### P5 — Security and isolation proof

**Objective.** A security case that stands without a friendly pilot: fleet-scale isolation proof plus
a structured adversarial audit.

**Work items.**

1. **Threat model.** `docs/THREAT_MODEL.md`. Assets: tenant procedure text, query text, escalation
   evidence, key material, tenant identity. Trust boundaries: device, edge function, Postgres, JWT
   claims, bundle manifest.
2. **Fleet-scale isolation suite.** Extend `supabase/tests/rls_bypass.sql` from the current 40 probes
   to a ≥ 1,000-attempt adversarial suite across twelve tenants: JWT forgery, tenant-claim spoofing,
   direct table reads/writes, RPC parameter spoofing, bundle substitution, key confusion, service-key
   absence assertions. Every attempt must fail closed.
3. **Adversarial audit (65-point).** Run the toolkit's agent-safety-guard across its five categories,
   adapted to this system:
   - **direct injection** — hostile text in the query field;
   - **indirect injection via RAG documents** — hostile text inside a *tenant procedure*, which is
     the highest-value attack surface in this product and the one a generative-answering system
     would be destroyed by;
   - **information extraction** — bundle manifest, key material, corpus text, other tenants' data;
   - **tool abuse** — SQL injection through RPC parameters, path traversal in edge functions,
     command injection in publish/ingest;
   - **goal hijacking** — driving the gate to answer when it must escalate.
   The audit runs against the sandboxed local stack, produces pass/fail per test, and each failure
   gets a fix or a documented acceptance.
4. **PII and retention.** Verify that the retention suite's plaintext removal holds for web-sourced
   corpora, and that no query text reaches a log or a third party.
5. **Supply chain.** Re-check G9 before its 2026-10-30 review date; decide between dropping
   `@sop/mobile` and vendoring. `pnpm run audit` must be green with no unexpired accepted advisory.
6. **Secrets.** Assert that no secret can reach a client bundle: a build-time check plus a
   documented rotation procedure.

**Predicted struggles.**

| Struggle | Automatic response |
| --- | --- |
| Indirect injection through corpus text finds something | Expected — this is the product's real attack surface. The mitigation is structural: the answering path has no generative model, so injection cannot redirect it. The audit's job is to prove that property, and any finding that the gate can be steered by corpus text is a P0 fix. |
| The adversarial suite is slow | It runs against the local Docker stack, not hosted. Nightly, not per-commit. |
| A finding requires an upstream fix | Record it as an accepted risk with a review date, exactly as G9 is handled — never silently. |
| The isolation suite passes trivially | Add negative controls: attempts that *should* succeed, to prove the suite is not passing because it is inert. |

**Exit gate.** D6 and D11 met; `docs/THREAT_MODEL.md` and `docs/SECURITY_CASE.md` written with every
finding, fix, and accepted risk named.

**Evidence artifact.** `docs/SECURITY_CASE.md`.

---

### P6 — Multi-tenant SaaS control plane

**Objective.** Close G12: a stranger can provision a tenant, publish a corpus, run a query, and read
their own telemetry without the author.

**Work items.**

1. **Provisioning.** `tenant-provision` edge function: creates the tenant, the owner principal, the
   key material, and the first bundle slot. Idempotent, audited.
2. **Corpus lifecycle.** `corpus-ingest` edge function + the existing `upsert-sop` and
   `publish-bundle`: draft → conflict lint → sign → publish → rollback. Every transition audited.
   Bundle rollback closes the "a new device only receives procedures after a fresh publish" gap.
3. **Calibration as an onboarding step.** The P4 pipeline becomes a step in tenant onboarding,
   producing a calibration record stored per tenant.
4. **Admin console.** `apps/admin` — corpus editor, publish controls, calibration view, usage view,
   escalation review queue, retention controls. Server-assigned roles, never client-chosen.
5. **Metering.** Usage counters per tenant (queries, escalations, publishes, storage). Read-only
   aggregates; no query text in the metering path.
6. **Quotas and plan gating.** Enforced server-side. A quota breach degrades to escalation, never to
   an unsafe answer.
7. **Sign-up.** Email/password self-serve with email verification; tenant created on first sign-up;
   role assigned by the server. No social login until the core path is proven.

**Predicted struggles.**

| Struggle | Automatic response |
| --- | --- |
| Self-serve sign-up creates unbounded tenants in the hosted project | A provisioning throttle and a per-project tenant cap, both enforced server-side and both configurable. |
| The admin console becomes a second product | Scope it to the lifecycle above. Anything else is deferred and listed. |
| Provisioning a tenant requires the secret key | The secret key stays server-side only. The admin console calls the edge function; it never holds the key. |
| Onboarding needs a corpus the tenant does not have yet | A tenant can start from a sample corpus from Pillar A, marked as sample, and replace it at publish. |

**Exit gate.** D10 met: an end-to-end provisioning→publish→query→telemetry journey executed in a
clean browser session, recorded with the commit SHA.

**Evidence artifact.** `docs/TENANT_LIFECYCLE.md` + a recorded journey.

---

### P7 — Production operations

**Objective.** Close G14 and G15: the service is operable, observable, recoverable, and costed.

**Work items.**

1. **SLOs.** `docs/SLO.md`: availability, p95 query latency, escalation rate, unsafe-answer rate
   (target 0), ingest delivery rate, publish success rate. Each with a measurement source.
2. **Observability.** `packages/observability` — shared event contracts. Client-side error and
   latency capture routed through the same queue discipline as telemetry. Edge-function structured
   logs. A dashboard definition (as code, not as a screenshot).
3. **Alerting.** Thresholds wired to the SLOs, with an owner and an action per alert.
4. **Runbooks.** `docs/RUNBOOK.md`: escalation storm, ingest backlog, bundle publish failure, key
   rotation, tenant deletion, unsafe-answer report, rollback.
5. **Backup and restore drill.** Execute a restore into a scratch project and record the result with
   timestamps. An untested backup is not a backup.
6. **Rollback drill.** Publish a bad bundle, roll it back, verify a device recovers.
7. **Cost model.** `docs/COST_MODEL.md`: hosted Postgres, edge invocations, storage, egress, model
   delivery (Hugging Face / jsDelivr). Cost per 1,000 queries, measured, not estimated. D12.
8. **CI extension.** Nightly standard-rung Market Twin; per-commit smoke rung; the DB suites in the
   existing `database` job; the audit job unchanged.

**Predicted struggles.**

| Struggle | Automatic response |
| --- | --- |
| Free-tier limits make the fleet run impossible | The fleet runs locally against the Docker stack. The hosted project carries only the journey proof. |
| Alert thresholds are guessed | Every threshold is derived from a measured baseline in `docs/BASELINE.md` plus the Market Twin's distributions. |
| The restore drill is not possible without a second project | It runs against a local PostgreSQL instance with the same migrations. If a hosted restore is required for the claim, the claim is downgraded to what was actually executed. |

**Exit gate.** D9 met; both drills executed and recorded; cost model published.

**Evidence artifact.** `docs/SLO.md`, `docs/RUNBOOK.md`, `docs/COST_MODEL.md`, drill records.

---

### P8 — Commercial layer (sandbox) — OWNER DECISION

**Objective.** If approved, a billing capability proven in sandbox mode, without live charges.

**This phase contradicts the earlier scope prompt.** `docs/PRODUCTION_READINESS_EXECUTION_PROMPT.md`
states under *Non-negotiable scope*: "Do not add: payments, billing, subscriptions, or revenue
features." That was written for the thinnest-hosted-path mission and it was correct for that mission.
A production SaaS program is a different mission, so the conflict is surfaced rather than quietly
resolved.

**If approved:** provider sandbox only (test keys, test cards), entitlement enforcement, invoice
generation, dunning, plan gating tied to the P6 quotas, and a documented path to live mode that is
not executed. No live charges, no real customer data.

**If not approved:** the program still reaches D1–D12. Metering and quotas from P6 remain, because
they are operational controls, not commercial features.

**Exit gate.** If executed: a sandbox subscription lifecycle proven end to end. If not executed:
recorded as an explicit, owner-ratified exclusion in `docs/PRODUCTION_STATUS.md`.

---

### P9 — Launch readiness and evidence pack

**Objective.** Close the program: one command regenerates every published number, and the public
documents are true.

**Work items.**

1. `pnpm run evidence` — regenerates every headline figure from the pinned corpora and the Market
   Twin, and **fails** if a published number does not match a re-measured one.
2. `docs/PROOF.md` — the public evidence pack: the fleet, the chaos events, the safety result, the
   isolation result, the retrieval tables, the cost model, each with its command and its SHA.
3. Rewrite `README.md` positioning from "prototype / six prerequisites, none met" to the measured
   reality, claim by claim, with the weakest results still surfaced first.
4. Rewrite `docs/PRODUCTION_STATUS.md` with the deployed SHA, the fleet numbers, and the honest
   limitations.
5. Update `docs/KNOWN_ISSUES.md` — every closed gap removed with its closing evidence; every open
   gap retained.
6. Update `AGENTS.md` with the phase records, measured counts, and the new gate commands.
7. Final audit: `pnpm run verify`, `pnpm run verify:db`, `pnpm run audit`,
   `node tooling/evidence/verify-claims.mjs`.
8. Release tag, after owner approval (Tier 3, A2).

**Predicted struggles.**

| Struggle | Automatic response |
| --- | --- |
| A published number drifts during the program | `verify-claims.mjs` fails the build. That is its purpose. |
| The honest rewrite weakens the portfolio story | It does the opposite: "proven across twelve tenants under chaos, 0 unsafe, 0 isolation escapes, reproducible by one command" is a stronger claim than "validated on a simulated tenant". The honest version is the stronger version. |
| Some claims remain unprovable | They are moved to a **Not proven** tier with the reason. The three-tier structure in `docs/EVIDENCE.md` is preserved. |

**Exit gate.** All of D1–D12 true; `pnpm run evidence` green from a clean clone.

**Evidence artifact.** `docs/PROOF.md`, regenerated `docs/EVIDENCE.md`, updated ledger.

---

## 9. Security and compliance program — consolidated

| Control | Mechanism | Proof |
| --- | --- | --- |
| Tenant isolation | RLS + `SECURITY DEFINER` RPCs reading tenant from JWT | ≥ 1,000-attempt adversarial suite, 12 tenants, with negative controls |
| Bundle integrity | Signed bundles; client verifies signature | Sync suite + a substitution test |
| Manifest integrity | Client verifies model id/revision | D7 test, failing before the fix |
| Escalation confidentiality | Content-free escalation record | Gate suite 10/10 + Market Twin invariant |
| Key management | Rotation with per-tenant key versions | Rotation suite + a mid-session rotation chaos event |
| Retention | Plaintext removal with audit skeleton retained | Retention suite + a deletion chaos event |
| Privacy | PII gate on corpora; no query text in logs or third parties | Gate report + a log-scan assertion |
| Injection resistance | No generative model in the answering path; structural, not prompt-based | 65-point adversarial audit |
| Supply chain | `audit-gate.mjs` with an expiring baseline | D11 |
| Secrets | Server-side only; build-time bundle scan | Assertion + rotation procedure |
| Audit trail | Append-only tables; admin actions recorded | DB suites + admin audit table |

---

## 10. Predictive failure register

The program's assumption is that the following will happen. Each has a response built **before** it is
needed, so no phase stalls.

| # | Predicted failure | Likelihood | Pre-built response |
| --- | --- | --- | --- |
| 1 | Retrieval recall does not reach D3 at 5,000 procedures without a new unsafe class | high | The rejected-experiment register forbids the reranker. The response is a per-language index and per-language calibration, measured against the unsafe count. If D3 cannot be met safely, D3 is **revised downward with the frontier published** — not met by weakening safety. |
| 2 | The multilingual problem is a calibration problem, not a model problem | medium-high | P4's per-language calibration is already in the plan; P3 supplies the distributions. |
| 3 | The refusal layer trades D2 against D3 | high | Both are measured simultaneously; the frontier is published; the operating point is chosen where the trade is acceptable and stated. |
| 4 | Structured policy facts turn out to be a larger schema change than expected | medium | Fallback (b) — multilingual number-word parsing — is specified and costed. |
| 5 | The fleet run is too slow to be a per-commit gate | high | Three rungs; smoke in CI, standard nightly, full on demand. |
| 6 | A hosted free tier runs out during the fleet run | medium | The fleet runs locally against Docker; hosted carries only the journey proof. |
| 7 | Web sources block harvesting | medium | Snapshots are the artifact; a blocked source is recorded and the fleet has twelve. |
| 8 | An accepted advisory becomes exploitable before its review date | low-medium | G9 has a review date and a decision (drop mobile or vendor); `audit-gate.mjs` fails on any *new* advisory. |
| 9 | The security audit finds a real issue | medium | The finding gets a fix or a documented acceptance with a review date; it is never silently closed. |
| 10 | Scope creep into a second product (admin console, billing, mobile) | high | The phase map is the fence. Anything not on it is deferred and listed. |
| 11 | A headline number drifts | medium | `pnpm run evidence` fails the build. |
| 12 | Your review changes the priority order | medium | Phases are dependency-ordered, not calendar-ordered, so a re-prioritisation costs a re-order, not a rewrite. |

---

## 11. Sequencing and dependency order

Waves, not dates — the repository's own discipline is measurement over scheduling.

| Wave | Phases | Parallelism | Rationale |
| --- | --- | --- | --- |
| **W1 — Foundation** | P0 | serial | Nothing may be claimed until the baseline is re-measured. |
| **W2 — Evidence** | P1, P2 | P1 then P2 | P2 consumes P1's corpora; both must precede any new claim. |
| **W3 — Correctness** | P3, P4, P5 | parallel | Three independent workstreams on a shared fleet; P4 and P5 both consume P3's distributions, so P3 starts first within the wave. |
| **W4 — Service** | P6, P7 | P6 then P7 | Operations need the control plane's surfaces. |
| **W5 — Commercial** | P8 | optional | Owner decision. |
| **W6 — Close** | P9 | serial | The evidence pack cannot be written before the work is done. |

---

## 12. Verification matrix — every claim to its command

| Claim | Command |
| --- | --- |
| All eight JS suites pass | `pnpm run verify` |
| All three SQL suites pass | `pnpm run verify:db` |
| The 500-ticket batch is unmodified | `node tooling/eval/simulated-tenant/verify-tickets.mjs tooling/eval/simulated-tenant/chaos-500.json` |
| Corpus provenance, licence, PII, counts | `node tooling/corpus/verify-corpus.mjs --manifest tooling/corpus/manifest.json` |
| Market Twin smoke rung | `node tooling/market/run-market.mjs --seed 20261006 --rung smoke` |
| Market Twin standard rung | `node tooling/market/run-market.mjs --seed 20261006 --rung standard` |
| Retrieval at scale | `node tooling/eval/simulated-tenant/run-chaos-evaluation.mjs` per rung and language |
| Gate safety | `node tooling/gate/verify-gate.mjs` |
| Conflict lint | `node tooling/conflicts/verify-conflict-lint.mjs` |
| Sync / persistence / rotation / queue | `pnpm run verify` (composite) |
| Isolation adversarial suite | `pnpm run verify:db` + the extended bypass suite |
| Deployed journey | `pnpm run verify:deployed` |
| Sign-in surface | `pnpm run verify:signin` |
| Transport probes | `pnpm run probe:auth` · `probe:bundle` · `probe:corpus` · `probe:publish` · `probe:telemetry` |
| Dependency gate | `pnpm run audit` |
| Every published number | `pnpm run evidence` |

---

## 13. Risk register

| Risk | Impact | Mitigation | Residual |
| --- | --- | --- | --- |
| Safety regression introduced by a retrieval or calibration change | critical | Every recall/accuracy figure published beside its unsafe count; a new unsafe answer is an automatic rejection | low |
| Isolation escape found late | critical | Suite runs in W3, not W6; negative controls prove it is not inert | low |
| Web-sourced data carries personal data | high | Five-gate pipeline; quarantine, never scrub; exclusion report | low |
| Licence misuse | high | Allowlist gate; attribution files; exclusions recorded | low |
| Program stalls on a decision that could have been defaulted | high | Authority ladder (§4); every Tier 3 item has a stated default | low |
| Scope creep | medium | Phase map as fence; deferral list | medium |
| Free-tier exhaustion | medium | Local Docker for the fleet; hosted only for the journey proof | low |
| An honest negative result is buried | medium | Honesty invariants; three-tier evidence structure; `verify-claims.mjs` | low |

---

## 14. The four decisions that remain yours

| # | Decision | Default if unanswered | When it is needed |
| --- | --- | --- | --- |
| A1 | Spend beyond free tiers | Stay on free tiers | W3 at the earliest |
| A2 | Pushes, releases, public deployment | Stay local; artifact prepared | W2 onward, per action |
| A3 | Whether billing enters the product | Phase 8 written, not executed | W5 |
| A4 | Any change to what the product claims to a customer | Preserve the current claim | W6 at the latest |

Everything else is Tier 1 or Tier 2 and proceeds without a question.

---

## 15. Cross-reference to the two loaded methodologies

| Toolkit skill | Where it is used in this program |
| --- | --- |
| **Prompt Evaluator** | Only for the non-answering surfaces: corpus-authoring assistance and admin summaries. The answering path has no prompt to evaluate, by design. |
| **Context Budget Planner** | P3 work item 3 — the passage budget, and the per-language index size. |
| **RAG Pipeline Architect** | P3 in full — parsing, chunking, embedding, retrieval, evaluation metrics at 500 and 5,000 procedures. |
| **Agent Safety Guard** | P5 work item 3 — the 65-point audit, with **indirect injection via RAG documents** promoted to the highest-priority category, because a tenant's procedure text is untrusted input in this system. |
| **Eval Harness Builder** | P2 and P9 — the harness, the metrics, and the bias-mitigated judging used to label web-sourced questions (always paired with the owner audit, as the real-phrased set already does). |
| **Product Sense Coach** | Run once, in W5, as a documented decision memo for A3 — market, positioning, and pricing, recorded rather than acted on. |

---

## 16. Immediate next action on approval

The moment this document is approved, and without a further question:

1. **P0 begins.** Re-run `pnpm install`, `pnpm -r run build`, `pnpm run verify`, `pnpm run verify:db`,
   and the ticket validator on current HEAD.
2. Write `docs/BASELINE.md` with every number re-measured and the commit SHA.
3. Open branch `prog/p0-baseline`.
4. Report: the re-measured table, any drift from the carried-forward figures, and the one-line
   confirmation that W2 is unblocked.

If P0 finds drift, the drift is the first finding and it is reported before anything else proceeds.

---

## Appendix A — Reproduction commands (current repository)

```bash
pnpm install
pnpm -r run build                     # turbo is unreliable on this host; use pnpm -r
pnpm run verify                       # 8 JS suites, exit 0 + verdict line required
pnpm run verify:db                    # 3 SQL suites; needs the Docker daemon
pnpm run audit                        # dependency gate vs tooling/audit-baseline.json
pnpm run verify:signin
pnpm run verify:deployed
node tooling/eval/simulated-tenant/verify-tickets.mjs \
  tooling/eval/simulated-tenant/chaos-500.json
node tooling/conflicts/verify-conflict-lint.mjs
node tooling/gate/verify-gate.mjs
```

## Appendix B — Dataset and privacy stance

The current repository's position, which this program mechanises rather than relaxes:
`tooling/eval/simulated-tenant/dataset-sources.md` reviewed three public ticket datasets and used
**metadata only**, because none established anonymisation and two carried personal-data-shaped
fields. Pillar A extends this into an enforced five-gate pipeline (licence, provenance, privacy,
attribution, stability) and records every exclusion. No dataset row enters this repository without a
complete provenance record and a passing privacy gate.

## Appendix C — Data-mode tagging

Every artifact produced by this program carries one of:

- `data_mode: "simulated"` — generated tickets, injected chaos.
- `data_mode: "web-sourced"` — real public documents or questions, provenance-recorded.
- `data_mode: "measured"` — counts read from a real database or a real run.

A claim never travels without its mode. A "measured" claim about simulated data is a defect.
