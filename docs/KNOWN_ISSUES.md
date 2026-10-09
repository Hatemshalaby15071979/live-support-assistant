# Known issues

Open limitations of the current build, each with the source that establishes it.
These are documented honestly; none is hidden behind a passing claim. Numbers are
reported exactly as measured on simulated or author-written data.

## 1. RESOLVED IN CODE (2026-10-09) — the client now refuses a bundle built for a different model

**Was.** The client read only `bundleVersion` and `sops` from the manifest and never compared its
loaded model against it, so a bundle published for a different embedding model would still be served.

**Now.** The client hands its loaded model to the install pipeline and refuses a mismatch:

- `apps/web/src/bundle-client.ts:227-236` — `installBundle(fetched, identity, store, LOADED_MODEL)`;
  any rejection other than `not_monotonic` becomes a named `unavailable` state rather than a corpus
  scored against the wrong vectors.
- `apps/web/src/bundle-client.ts:277-278` — `modelId` and `modelRevision` are returned from the
  **manifest**, not from the build-time constant.
- `apps/web/src/App.tsx:121-122` — telemetry records the bundle's model when the bundle supplies one,
  and falls back to `EMBEDDING_MODEL` only when it does not.
- Proven by probe MC-06 (client refuses `model_mismatch`, the previous bundle stays active) —
  `docs/program/DECISIONS.md:50`.

**Still open — and not closed by the above.** The historical divergence itself is still
**unreproduced**: deployed `0aec9773442c4282` answered at 0.180757 against local 0.167715 on
`SIM-TICKET-00272`. MC-09 was built to reconstruct it and remains an **unproven hypothesis**
(`docs/program/DECISIONS.md:51`, reproduction blocked). Treat the divergence as unexplained.
See `tooling/eval/simulated-tenant/parity-results.md`.

## 2. The conflict lint parses English number words only

`tooling/conflicts/conflict-core.mjs:39-42` states the limitation in full: "Only
English number words are parsed. The corpus repeats every summary in [es, pt-BR,
fr], and those translations render their figures in their own number words
('dos a cinco', 'dois a cinco', 'deux à cinq'), which this module does not parse."

The `NUMBER_PATTERN` at `conflict-core.mjs:55` is built from an English word list
plus `\d+`. Two effects:

- A contradictory procedure written in a non-English summary is **not** caught by the
  lint, and therefore not refused at publish for that language.
- The matcher is a regex over free text, so prose that mentions a policy range
  ("do not use the two-to-five-business-day estimate") can be read as a policy fact
  and produce a false positive. `conflict-core.mjs:33-34` documents this directly.

The lint is the basis of the publish-path HTTP 422 block
(`supabase/functions/publish-bundle/index.ts`); its English-only gap therefore limits
how far that block protects a multilingual corpus.

## 3. Recall at 48 procedures: 84/302 in scope

`tag evidence/scale-rung (e5a7d9baf4f6)`,
[scale-rung-results.md](https://github.com/HatemIsmailShalaby1979/LIVE-Support-Assistant/blob/evidence/scale-rung/tooling/eval/simulated-tenant/scale-rung-results.md): with escalation-by-construction
rows excluded, in-scope recall at the 48-procedure corpus is **84/302 (27.8%)** at the
shipped 0.18 margin (93/302 at 0.17). This is the largest corpus measured and it is
the weakest recall point. A 40–70-procedure tenant is a rung, not the 5,000-procedure
scale the Phase 1 open question names. See also `README.md` (claims table, Tier 2).

## 4. Non-English gap on the same corpus

`tag evidence/scale-rung (e5a7d9baf4f6)`,
[scale-rung-results.md](https://github.com/HatemIsmailShalaby1979/LIVE-Support-Assistant/blob/evidence/scale-rung/tooling/eval/simulated-tenant/scale-rung-results.md): on the 48-procedure corpus at
0.18, accuracy is **English 62.1% vs Spanish 32.0% and Portuguese 31.0%**. The change
is confounded (a different and larger corpus), so it is not attributable to language
alone, but the gap is real on the measured data. French was not part of the
multilingual measurement batch.

## 5. Out-of-scope public questions still answered

`AGENTS.md` (real-phrased refusal set) and `README.md` (claims table): the
real-phrased refusal set shows **6 of 52 false accepts at 0.18** (7 at 0.17) — public,
out-of-scope queries that the system accepted and answered instead of refusing. The
gate is calibrated for in-scope tenant procedures, not for deflecting every off-topic
question. Source:
`tooling/eval/simulated-tenant/real-phrased-label-results.md`.

## 6. No real-tenant calibration

`packages/core/src/types.ts` (`minMargin: 0.18`) is a **prototype default**, not a
value fitted to a customer. No tenant has been calibrated: there is no design partner,
no pilot customer, and no production traffic. 0.17 is a harness-only evaluation value
and must never be presented as a tenant setting. Per-tenant threshold tuning remains an
onboarding task. See `README.md` (Tier 3 — NOT PROVEN) and `docs/PRODUCTION_STATUS.md`.

## 7. Hosted transport not wired into the standalone demo

`proof-of-concept.md:210` and `README.md:84`: the backend verification suites (RBAC,
RLS, telemetry, retention, encrypted sync, key rotation, telemetry queue,
conflicting-procedure lint) pass independently, but the hosted transport that would
connect them to the running client is **not wired into the standalone demo**. A query's
telemetry or escalation is not actually delivered to the live backend in the demo path;
the deployed path (public Vercel app + development Supabase) is the only place the full
round trip is exercised. This is a demo limitation, not a backend failure.

## 8. The demo-video tooling is Windows-only

`tooling/video/` builds the narrated walkthrough, and two of its scripts assume Windows:

- `tooling/video/capture-demo.mjs:15-18` searches only
  `C:\Program Files\Google\Chrome\Application\chrome.exe` and the `Program Files (x86)`
  equivalent, and throws "Google Chrome was not found in either standard Windows install
  path" otherwise. The evaluation driver next to it also checks `%LOCALAPPDATA%`, so the
  two differ in how portable they are.
- `tooling/video/gen-titlecards.py:18-21` loads Arial from `C:\Windows\Fonts\`, so title
  cards cannot be generated off Windows without editing those paths.

`assemble-video.py` (ffmpeg via `shutil.which`) and `gen-audio.py` (edge-tts) are portable.
Consequence: the walkthrough can be re-rendered on Windows only, as written. This affects
build tooling, not the shipped decision path or any measured claim.

## 9. CLOSED (2026-10-07) — the accepted node-forge advisory is no longer in the tree

**Was.** `GHSA-86w9-cpqp-85rv` (node-forge, High, CVE-2026-85393, affected `<=1.4.0`) was accepted as
a known risk on 2026-10-02: no patched release existed (`1.4.0` was the latest on npm), and it
arrived only through the unbuilt `@sop/mobile` app via Expo tooling
(`@expo/code-signing-certificates`, `selfsigned`).

**Now.** `@sop/mobile` was excluded from the workspace install (prereg `docs/prereg/g9-drop-mobile.md`),
which removed node-forge, braces and sprintf-js with it; `sharp` was forced to `0.35.5`.
`tooling/audit-baseline.json` now carries `"advisories": {}` and states: *"The accepted-advisory set
is EMPTY as of 2026-10-07 ... The gate is therefore strict: any advisory appearing in
`pnpm audit --prod` now fails the build. Nothing is tolerated in this file."*

Re-verified 2026-10-09: `grep -c node-forge pnpm-lock.yaml` → `0`.

**Consequence.** The 2026-10-30 review date no longer covers a live risk — there is nothing to
re-check. The gate is stricter than it was, not looser: a new advisory now fails the build instead of
being absorbed into a baseline.

## 10. T04 cannot answer generic consumer scenarios — corpus-fit limit

**T04 is strictly GitHub technical/billing documentation. It lacks material for generic consumer
scenarios (bans, phone OTPs, live streams). User-voiced queries for these topics must correctly
resolve to `out_of_scope`.**

This is a limit of the **corpus**, not of the retriever or the gate, and it is a property of the
source rather than a defect to be fixed by tuning. GitHub Docs documents GitHub's own account and
billing surface; a customer asking about a phone verification code or a policy ban is describing a
consumer service that this corpus is not about.

**Established by measurement, not by impression.** Commands and N at commit `bab7bf4`,
`data_mode: web-sourced`, tenant T04, 136 documents:

| Vocabulary | Command | Documents found |
| --- | --- | --- |
| `banned`, `appeal`, `reinstate`, `blacklist`, `abuse` | `node -e "…includes(w)…"` over T04 | **0** each |
| `ban` (raw substring) | same | 16 — all **banner, bandwidth, bank, banks** |
| `sms`, `text message`, `phone number`, `authenticator` | same | **0** each |
| `translation`, `localis`, `localiz`, `currency` | same | **0** each |

**What it cost, concretely.** Of 15 owner-supplied user-voiced questions, **11 resolved to
`out_of_scope`** and only 3 to an answering document. Every one of the eleven failed for the same
reason: the topic is a generic consumer scenario with no counterpart in GitHub's own documentation.

**Why it matters beyond bookkeeping.** A retriever that answers these questions anyway is not being
helpful, it is guessing — and a *phone OTP* question answered with an *email verification* document
is the failure mode this limit predicts. The correct behaviour is a refusal, and the gold set
records those refusals as first-class rows so that refusing is measured rather than assumed.

**Not a claim that the fleet is unusable.** T01 (platform-operations) and T05 (policy) have their own
coverage; this limit is stated for T04 and applies to the question classes named above. Any headline
drawn from T04 must say which classes it covers.

## 11. `out_of_scope` is tenant-scoped, not fleet-scoped

**A question that is `out_of_scope` for one tenant may be answerable for another, and any
fleet-level refusal figure that ignores this is wrong.**

Established by construction in the gold set. The same question — a suspended account and how to
appeal it — appears twice:

| Row | Tenant | Label | Why |
| --- | --- | --- | --- |
| OD-11 | T04-customer-support-style | **`out_of_scope`** | T04 has no appeal material: 0 documents match `appeal`, `reinstate` or `banned`. |
| SB-20 | T05-policy-style | **`answerable`** | T05 has `acceptable-use-policies/github-appeal-and-reinstatement.md`. |

Both labels are correct. **`out_of_scope` means "this tenant's corpus does not answer it", not "no
tenant's corpus answers it."**

**Consequences, and they are easy to get wrong:**

- A per-tenant refusal rate is meaningful. A fleet-wide refusal rate computed by pooling tenants is
  not, unless it is stated per tenant.
- Routing a question to the tenant that can answer it is a legitimate behaviour, and a retriever that
  refuses because the *current* tenant cannot answer has not failed.
- The eleven `out_of_scope` rows in Slice B are all tenant-scoped statements about T04. None of them
  says the fleet has no answer.

**Measured, not assumed.** In the first retrieval baseline (`tooling/corpus/run-baseline.mjs`), T04's
twelve `out_of_scope` rows have a mean top-1 similarity of **0.375** at the MVR and **0.413** at the
500-rung, against **0.513** and **0.537** for the twenty answerable rows. The two groups separate, and
the separation is the signal a confidence gate would act on.

## 12. T04's confidence gate is set at 0.53, and it buys safety with a large refusal cost

**T04's confidence-gate threshold is 0.53**, chosen to enforce zero unsafe answers.

`tooling/corpus/calibrate-gate.mjs`, calibration split, 500-rung, model `Xenova/all-MiniLM-L6-v2`.

**At threshold 0.53, T04 measures:**

| Metric | Value |
| --- | --- |
| **Unsafe answers** (an `out_of_scope` question served) | **0** |
| Precision | **50.0%** |
| Recall | **37.0%** |
| False-refusal rate | **25.9%** (7 of 27 answerable questions refused) |

**A correction to the figure this was specified with.** The instruction recorded "~43.5% precision";
the measured precision **at 0.53 is 50.0%**. 43.5% is the value at **0.52**, one step below. The
difference is the threshold, not a disagreement — both are in `gate-calibration.json`.

**The cause is dense-retrieval quality, not the gate.** T04's precision is 37.5% at 0.40 and 50.0% at
0.53 — **more than half of served answers name the wrong document across the whole range**. A
threshold cannot fix that: raising it refuses more traffic without making the served answers correct.
The gate is doing its job; the retriever underneath it is the limit. `MiniLM-L6-v2` at 500-procedure
scale does not separate T04's account-and-billing procedures well enough for a higher precision.

**The cost is real and should be quoted with the number.** At 0.53, **one answerable question in four
is refused**. That is the price of zero-unsafe, and it is a product decision, not a technical one.

## 13. 0.53 is a T04 threshold, not a fleet threshold

**The same threshold does not give zero-unsafe answers for T01 or T05, and the difference is large.**

Every tenant's zero-unsafe threshold, measured on the calibration split at the 500-rung:

| Tenant | answerable | out_of_scope | unsafe **at 0.53** | zero-unsafe at | cost at its own threshold |
| --- | ---: | ---: | ---: | ---: | --- |
| T01 | 12 | 6 | **3** | **0.68** | 1 false refusal of 12 |
| T04 | 27 | 9 | **0** | **0.53** | 7 of 27 (25.9%) |
| T05 | 14 | 6 | **1** | **0.61** | 8 of 14 (57.1%) |

**A single fleet-wide 0.53 would leave unsafe answers in two of three tenants.** The zero-unsafe
thresholds span **0.53 to 0.68** — a 0.15 spread — because the three corpora sit on different
similarity scales. T01's most confidently-answered unanswerable question scores **0.6731**; T05's
scores **0.6020**.

**This is why V2 P3 requires per-tenant thresholds, and the measurement now shows how far apart they
have to be.** Pooling the tenants and picking one number would either serve unsafe answers in T01 and
T05, or refuse most of T05's traffic for no benefit to T04.

**T05's cost is the worst of the three** — 57.1% false refusals at its own zero-unsafe threshold, on
only 14 answerable questions. That is a small sample and the figure will move; it is recorded as
measured rather than smoothed.

**Every tenant now has a refusal surface**, so no gate is being assessed on answerable questions
alone. Before this, T01 and T05 had zero `out_of_scope` rows in the calibration split and their gates
could only be assessed on false refusals.

## 14. Held-out validation (V2 D1): **not measurable** at current N

**V2 D1 requires 0 unsafe answers on the held-out split.** The operating point is read from
`GATE_CONFIGS` (`packages/core/src/types.ts`) — never re-derived from held-out — so this is a
pass/fail check, not tuning. 500-rung, model `Xenova/all-MiniLM-L6-v2`,
`tooling/corpus/gate-calibration-heldout.json` (`data_mode: held-out`).

**Definitions (where the taxonomy lives).** The gate decision taxonomy — `outcome: 'accepted' | 'blocked'`
and `GateBlockReason` — is in `packages/core/src/gate.ts`. The calibration metrics semantics are in
`tooling/corpus/calibrate-gate.mjs`:
- **unsafe** = an `out_of_scope` question the gate **served** (returned a procedure). Reported separately;
  never folded into precision.
- **wrong-procedure answer served** = a served answer to an **answerable** question that names the **wrong**
  document = `FP − unsafe`.
- TP / FN = answerable served / refused; FP = wrong served **OR** `out_of_scope` served; TN =
  `out_of_scope` refused.

**Label provenance — applies to every table below.** Every gold label here is **agent-agreed and
UNVERIFIED** (OQ-002 spot-check is still NOT DONE: the owner confirmed he did not independently inspect
the documents, and his earlier "agree" marks came from the agent's presentation, not from reading the
text). These figures therefore describe **agent-agreed labels, not validated ground truth**, and are
**not headline-eligible**. `label_source = agent`, `spot_check = NOT DONE` for all rows.

**Measurability of D1 at this N.** Held-out `out_of_scope` counts are **T01 = 2, T04 = 3, T05 = 2
(total 7)**, against the prereg floor of **300 per tenant**. With 0 observed unsafe in N=3 (T04, T05),
the **upper 95% bound is ≈ 100%** — a zero observed does **not** establish zero true. **D1 is not
measurable at N=7**, and not measurable per tenant at N ≤ 3. "T01/T04 reached zero unsafe" overstates it:
they *served* 0 unsafe; that is an anecdote, not a bound. Treat all three as **unproven**, not proven
safe.

### Held-out operating points (data_mode=held-out) — pre-expansion, OOS N=2/3/2, historical

`ans N` = answerable rows, `OOS N` = out_of_scope rows. Recall figures are over answerable N of 6–11
rows — **anecdote, not measurement** (marked \*). See the g14 table below for the measurable run.

| Tenant | ans N | OOS N | @ | TP | FP | FN | **unsafe** | wrong-proc served | precision | recall\* | false-refusal | label_source | spot_check |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| T01 | 6 | 2 | 0.68 | 2 | 0 | 4 | **0** | 0 | 100.0% | 33.3% | 66.7% | agent | NOT DONE |
| T04 | 11 | 3 | 0.53 | 6 | 2 | 3 | **0** | 2 | 75.0% | 54.5% | 27.3% | agent | NOT DONE |
| T05 | 11 | 2 | 0.61 | 1 | 3 | 8 | **1** | 2 | 25.0% | 9.1% | 72.7% | agent | NOT DONE |

**D1 verdict (old, at N=7).** T01 served 0 unsafe (OOS N=2), T04 served 0 unsafe (OOS N=3), T05 served
**1 unsafe** (OOS N=2). T05 **fails**. T01 and T04 are **not a measurable pass**: 0 of 2–3 with a 95%
upper bound ≈ 100%. D1 is **NOT MET as a measured property** at this N; "unproven", not "proven safe".

### Held-out operating points — g14 expansion (data_mode=held-out, post-`1d75c9d`)

New held-out OOS N = **T01 33, T04 30, T05 25** (fleet 88). Rule-of-three 95% upper bound on the unsafe
rate: T01 ≤ 9.1%, T04 ≤ 10.0%, T05 ≤ 12.0% — versus ≈100% at the old N≤3. Thresholds read from
`GATE_CONFIGS` (T05 now **0.69**, recalibrated on calibration).

| Tenant | ans N | OOS N | @ | TP | FP | FN | **unsafe** | wrong-proc served | precision | recall | false-refusal | label_source | spot_check |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| T01 | 6 | 33 | 0.68 | 2 | 0 | 4 | **0** | 0 | 100.0% | 33.3% | 66.7% | agent | NOT DONE |
| T04 | 11 | 30 | 0.53 | 6 | 11 | 3 | **9** | 2 | 35.3% | 54.5% | 27.3% | agent | NOT DONE |
| T05 | 11 | 25 | 0.69 | 1 | 1 | 10 | **1** | 0 | 50.0% | 9.1% | 90.9% | agent | NOT DONE |

**D1 verdict (g14 new held-out).** V2 D1 = 0 unsafe on held-out.
- **T01: PASS on this held-out (0 unsafe, OOS N=33, 3/N ≤ 9.1%). FRAGILE** — T01 serves 1 unsafe on the
  expanded calibration split (OOS N=75), so the pass depends on the held-out not containing a high-scoring
  OOS row. Not robustly proven.
- **T04: FAIL (9 unsafe, OOS N=30).** Confirms the retrieval-quality limit (cf. §12); 0.53 is far from
  zero-unsafe on any usable sample.
- **T05: FAIL (1 unsafe at 0.69, OOS N=25, 3/N ≤ 12.0%).** The calibration zero-unsafe point (0.69) does
  **not** transfer: one held-out OOS row scores **0.7017 > 0.69**. Reaching 0 unsafe on held-out needs
  **0.71**, refusing 10/11 answerable (90.9%) — unusable. **D1 NOT MET.**

**Conclusion of g14.** Growing the gold set tightened D1's bound (3/N 9–12% vs ~100%) but D1 stays **NOT MEASURABLE** at the required per-tenant held-out N≥300 (held-out fleet OOS is 88, not 300), and did **not** make
T05 pass. All three tenants' zero-unsafe is blocked by **retrieval quality** (MiniLM-L6-v2 at the 500-rung
returns top-1 ≥ 0.70 for out-of-scope questions); no usable threshold separates them. T05 stays
`failed-heldout`. No threshold is pushed to 0.71 (that tunes on held-out and destroys answer rate).

### Calibration operating points (data_mode=calibration — reference; **pre-expansion, OOS N=6/9/6, historical**)

| Tenant | ans N | OOS N | @ | TP | FP | FN | unsafe | wrong-proc served | precision | recall\* | false-refusal | label_source | spot_check |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| T01 | 12 | 6 | 0.68 | 9 | 2 | 1 | 0 | 2 | 81.8% | 75.0% | 8.3% | agent | NOT DONE |
| T04 | 27 | 9 | 0.53 | 10 | 10 | 7 | 0 | **10** | 50.0% | 37.0% | 25.9% | agent | NOT DONE |
| T05 | 14 | 6 | 0.61 | 3 | 3 | 8 | 0 | 3 | 50.0% | 21.4% | 57.1% | agent | NOT DONE |

**The T04 precision story, both halves.** At 0.53 T04 precision is 50.0%, but FP=10 with unsafe=0 means
**all 10 false positives were wrong-procedure answers** — half of T04's served answers named the wrong
document. That is a retrieval-quality failure a threshold cannot fix; `unsafe=0` only means none of
those wrong answers were `out_of_scope`. Reporting precision alone hid this; the **wrong-proc served**
column is the half that matters for product quality.

**Calibration vs held-out for T05.** Calibration showed 0 unsafe at 0.61; held-out shows 1 unsafe at the
same 0.61. The operating point is read from `GATE_CONFIGS`, never re-tuned on held-out — so this is a
held-out failure, not a recalibration. It is driven by OOS N=2 on held-out; a single `out_of_scope`
crossing the threshold flips the verdict.

### Re-calibration on the expanded set (g14, post-`1d75c9d`)

`GATE_SPLIT=calibration node tooling/corpus/calibrate-gate.mjs` on the expanded gold set
(`data_mode: calibration`, 500-rung, MiniLM-L6-v2). Calibration `out_of_scope` N is now
**T01 75, T04 75, T05 81** (vs 6/9/6 before). This is the proper tuning split, never the held-out.

| Tenant | @ (current) | unsafe @ current | calibration zero-unsafe @ | false refusals at that point | note |
| --- | ---: | ---: | ---: | ---: | --- |
| T01 | 0.68 | **1** | 0.76 | 10/12 (83.3%) | current threshold NOT zero-unsafe on calibration |
| T04 | 0.53 | **9** | 0.62 | 20/27 (74.1%) | current threshold NOT zero-unsafe on calibration |
| T05 | 0.61→0.69 | **3** @0.61 | 0.69 | 9/14 (64.3%) | recalibrated to 0.69 (g14) |

**The decisive finding.** The prior "zero-unsafe" claims for T01 (0.68) and T04 (0.53) were
artifacts of OOS N = 6 and 9. On the expanded calibration set those thresholds serve **1 and 9**
unsafe answers. Only T05's old *held-out* failure (1 unsafe) had been visible; the calibration set
now shows all three serve unsafe at their shipped thresholds. The binding constraint is **retrieval
quality** (MiniLM-L6-v2 dense retrieval at the 500-rung), not the gate rule — raising the threshold
refuses most traffic rather than making served answers correct (cf. §12).

**T05 recalibrated to 0.69** per g14 ("zero unsafe on the calibration split first"), the calibration
zero-unsafe point. This is derived from calibration, not held-out (the owner's "do not raise to ~0.69
on held-out" caveat does not apply). Held-out validation pending. The 64.3% false-refusal cost is a
product decision, recorded as such.

**T01 and T04 are flagged, not auto-recalibrated.** Their calibration zero-unsafe points (0.76, 0.62)
refuse 83%/74% of answerable traffic — a product call the owner must make, as the T04 0.53 decision
was. Until then they stay at their shipped thresholds with `calibration_status = fails-calibration`.

### calibration_status (PROVISIONAL — see DECISIONS.md)

| Tenant | threshold | calibration_status |
| --- | ---: | --- |
| T01 | 0.68 | `fails-calibration` (1 unsafe @ 0.68, OOS N=75) |
| T04 | 0.53 | `fails-calibration` (9 unsafe @ 0.53, OOS N=75) |
| T05 | 0.69 | **`failed-heldout`** (1 unsafe @ 0.69 on new held-out, OOS N=25; calibration-zero-unsafe at 0.69) |

Thresholds chosen/updated on the calibration split with unverified labels. **Not
production-calibrated.** No production claim is made for any tenant. D1 (0 unsafe on held-out)
for T05 is **pending the new held-out run**; for T01/T04 it is **NOT MET** (serve unsafe on calibration).

**T05 decision (owner, this review): option (c).** Do **not** raise T05 to ~0.69 (tuning on held-out
destroys the split), do **not** accept 1 unsafe. Grow `out_of_scope` to ≥ 100 per tenant (fleet N ≥ 300)
in two slices — (i) cross-tenant OOS, `label_source=construction`, tagged easy-mode; (ii) near-domain
OOS, answer genuinely absent, agent-labelled and queued for owner spot-check — on a fixed-seed 70/30
split with a fresh held-out never used for tuning. Prereg first; recalibrate on the new held-out with N
and the 3/N bound. The held-out rows already seen become calibration data, labelled as such. Until done,
T05 = `calibration_status=failed-heldout`, no production claim, D1 NOT MET. (Implemented under task #9.)

### Retrieval-path decision (owner, 2026-10-07): option (d)

The g14 expansion grew evidence but did **not** reach a D1 pass (all three tenants' zero-unsafe is
blocked by retrieval quality). Four further paths were considered and disposed of:

- **(a) new / stronger embedder** — DEFERRED. The likely real fix for retrieval quality, but it enters
  only via its **own prereg** and a check against this register (g15 R4), before any code is written.
- **(b) move T01/T04 to their calibration zero-unsafe points (0.76 / 0.62)** — REJECTED on product
  cost: that refuses 83% / 74% of answerable traffic. T01/T04 therefore **stay at their shipped
  thresholds** with `calibration_status = fails-calibration`; no move to 0.76/0.62.
- **(c) grow OOS further** — not pursued (repeats g14; the per-tenant held-out N≥300 floor is the real
  blocker, and D1 is still NOT MEASURABLE there).

The owner chose **(d)**: a **P4 scope/refusal layer**, refusal-only (it may escalate, never answer),
measured on the calibrated gold. The cross-encoder reranker stays **CLOSED**. See prereg
`docs/prereg/g15-p4-scope-refusal-layer.md` (hypothesis, joint metric unsafe+wrong-proc+recall,
calibration split, margin band, 2 seeds, accept/reject rules). Run on calibration, then **once** on the
new held-out.

### Addendum — g14 OOS expansion implemented (post-`565c8c1`)

The option (c) expansion is committed (prereg `docs/prereg/g14-t05-oos-expansion.md`): cross-tenant
construction rows (`slice-c-cross-tenant-oos.json`, `label_source=construction`, `easy_mode=true`) plus
agent-authored near-domain rows (`slice-d-near-domain-oos.json`, `queued_spot_check=true`). The 7 OOS rows
previously measured on the old held-out are pinned to the calibration split (`PINNED_CALIBRATION` in
`assemble-questions.mjs`) so they are never re-used as a measurement. Fixed-seed 70/30 split (seed
`20261007`) unchanged.

New held-out `out_of_scope` N (fresh, never measured): **T01 33, T04 30, T05 25** (held-out fleet OOS = **88**, far below the per-tenant ≥300 floor; the 319 figure is total OOS across both splits, not held-out).
Rule-of-three 95% upper bound on the unsafe rate: T01 ≤ 9.1%, T04 ≤ 10.0%, T05 ≤ 12.0% — versus ≈100% at the
old N ≤ 3. D1 remains **NOT MEASURABLE** at the required per-tenant held-out N≥300; the 3/N bounds (9.1/10.0/12.0%) are reported as bounds only, not as a pass.

T05 stays `calibration_status=failed-heldout`, **D1 NOT MET**, until the new held-out is run and shows 0
unsafe at its operating threshold. The bi-encoder validation on the new split is pending (heavy compute;
run in background). Until that run reports, no production claim is made for any tenant and the thresholds
remain provisional per `DECISIONS.md`.

### g15 closure (2026-10-07) — P4 scope/refusal layer: CLOSED NEGATIVE, NOT ADOPTED

g15 P4 scope/refusal layer was evaluated under preregistered conditions
(`docs/prereg/g15-p4-scope-refusal-layer.md` + the 2026-10-07 R3 amendment; harness
`tooling/refusal/run-g15.mjs`, results `tooling/refusal/g15-results.json`, model
`Xenova/all-MiniLM-L6-v2`, run-time HEAD `f4745060`). No fleet-useful operating point was found within
the R3 recall-loss guard (≤10 pp answerable-recall loss vs the gate-alone baseline, per tenant, on
both calibration and held-out; lost-question count printed beside the pp figure). T01 had one
qualifying configuration (t=0.66/m=0.10, both seeds) but it reduced wrong-proc (2→0) without reducing
unsafe (1→1) and was **not adopted**. T04 and T05 had no qualifying configuration (minimum recall loss
across the whole sweep: T04 29.63 pp, T05 14.29 pp — on T05 every served-answerable margin is < 0.10).
**The experiment is closed negative.** Retrieval quality is the current limiting factor; any retrieval
change requires its own preregistered experiment (RX-03 draft: `docs/prereg/rx03-retrieval-quality.md`).
All g15 conclusions are agent-label-relative (0 `label_source=owner` rows); no owner-backed D3 claim
is made. Data: `data_mode=calibration` (ans N 12/27/14, OOS N 75/75/81) and `data_mode=held-out`
(ans N 6/11/11, OOS N 33/30/25); held-out validated exactly once after calibration selection.

## 15. Near-duplicate procedures in one tenant trigger `insufficient_margin` — a gate property, not a bug

The gate refuses when the top procedure does not beat the runner-up by `minMargin`. Two procedures in
the **same tenant** whose bodies are near-identical therefore tie, and the query escalates even though
retrieval found the right document. This is the gate behaving as designed: it will not choose between
two answers it cannot separate. It surfaced as a false failure when `verify:deployed` authored two probe
procedures per run and never retired them, so the demo tenant's bundle grew run over run (bundle
12→13→14→15→16; procedures 19→21→23→25→9) and the accumulated `Deployed refund …` bodies tied. Fixed in
the harness by retiring its own probe titles before authoring (`a9ea1f8`). Operationally: **a tenant
whose content contains near-duplicates will see escalations on exactly those topics**, and that is the
gate working — the remedy is content curation (see the conflict lint, `tooling/conflicts/`), not a
threshold change.

## 16. Open question — `key_unwrap_failed` on a fresh device, vs "no policy bundle has been published"

Two runs of the same harness against the dev project disagreed on the *pre-publish* bundle state. My
local run (client built from the working tree) reported **"no policy bundle has been published for this
tenant yet"**; the owner's run reported **"the server's bundle was refused: `key_unwrap_failed`"**. Both
are the same check ("fresh device is told no bundle is serving") and both passed.

**Leading explanation (REASONED, not verified).** `apps/web/src/device-state.ts:10–14` documents that a
cached device identity is tenant-coupled — the KEK salt is derived from the tenant id — so an identity
that does not match cannot unwrap anything, and the failure "reads like a crypto fault rather than a
stale key". By the same mechanism, a client whose baked-in `VITE_TENANT_SIGNING_PUBLIC_KEY` /
`VITE_SERVER_WRAPPING_PUBLIC_KEY` do not match the deployment's current secrets cannot unwrap the
server's bundle and reports `key_unwrap_failed`, whereas a client whose keys do match but for which no
bundle row exists reports "no policy bundle has been published". The owner's run reported the former,
which is **evidence — not proof — that it exercised a client carrying different baked-in keys** (i.e.
the deployed build). The saved output does not echo `TARGET_URL`, so this cannot be settled from it.

**Status.** Open, and harmless: no check depends on which of the two messages appears. It is logged
because "which build was that?" is exactly the question the build-stamp work is meant to answer.
