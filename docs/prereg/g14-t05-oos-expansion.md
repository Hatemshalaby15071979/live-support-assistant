# g14 — T05 out-of-scope expansion and recalibration (owner option c)

**Zone.** Y (governance). **Status.** PREREG — written and committed before the run, per the
owner's ruling on commit `565c8c1`. Supersedes the post-hoc note in `docs/program/DECISIONS.md`
(2026-10-07, later) for the T05 recalibration path.

## Background

V2 D1 requires **0 unsafe answers on the held-out split**. The operating point is read from
`GATE_CONFIGS` (`packages/core/src/types.ts`), never re-derived from held-out — so D1 is a pass/fail
check, not tuning.

The 2026-10-07 held-out validation (`f8cbf0b`, reported in `KNOWN_ISSUES.md` §14) found:

- Held-out `out_of_scope` N was **T01 2, T04 3, T05 2 (total 7)** against a prereg floor of **300 per
  tenant**.
- With 0 observed unsafe in N=3, the upper 95% bound is ≈ 100% — D1 is **not measurable at N=7**.
- T05 **failed**: 1 unsafe served at 0.61 (OOS N=2). T01/T04 "served 0 unsafe" is anecdote, not a bound.

The owner chose **option (c)** — do **not** raise T05 to ~0.69 (tuning on held-out destroys the
split), do **not** accept 1 unsafe. Instead, grow the evidence base so the held-out check becomes
meaningful, then recalibrate on a fresh held-out.

## Decision (owner, on `565c8c1`)

1. **Grow `out_of_scope` to ≥ 100 per tenant (fleet N ≥ 300)** in two slices:
   - **(i) cross-tenant OOS** — a question whose answer lives in tenant X's documents, asked in the
     context of tenant Y (Y ≠ X). By `KNOWN_ISSUES.md` §11, `out_of_scope` is tenant-scoped, so it is
     genuinely `out_of_scope` for Y. Constructed by re-pairing existing answerable rows with the other
     two tenants; `label_source = construction`, tagged `easy_mode = true`.
   - **(ii) near-domain OOS** — an answer that is genuinely absent from the tenant's corpus
     (consumer scenarios, account how-tos, pricing, support channels), agent-authored,
     `label_source = agent`, and queued for owner spot-check (`queued_spot_check = true`).
2. **Fixed-seed 70/30 split** (seed `20261007`, `CALIBRATION_FRACTION = 0.7`), unchanged so the split
   is reproducible. A **fresh held-out** (the new cross-tenant + near-domain rows) is never used for
   tuning.
3. **The held-out rows already seen become calibration data.** The 7 OOS rows that were in the old
   held-out (`OD-01`, `OD-11`, `OD-13` for T04; `SB-T01R-06`, `SB-T01R-07` for T01; `SB-T05R-02`,
   `SB-T05R-03` for T05) are **pinned to the calibration split** so they are not re-used as a
   measurement. Implemented as a `PINNED_CALIBRATION` id set in `assemble-questions.mjs`.
4. **Prereg first; then recalibrate; then validate.** Sequence:
   (a) commit the expanded gold set and the prereg;
   (b) run `calibrate-gate.mjs` on the **calibration** split — require **zero unsafe first**, then
   maximise answer rate; this may move T05's threshold;
   (c) run on the **new** held-out and report with N and the **3/N** upper 95% bound
   (rule of three) on the unsafe rate.
5. **Until the new held-out proves otherwise**, T05 stays `calibration_status = failed-heldout`, no
   production claim, **D1 NOT MET**. No tenant makes a production claim regardless.

## Accept rules

- A1. Fleet held-out `out_of_scope` N ≥ 300 (≥ 100 per tenant) before any D1 verdict is drawn.
- A2. Cross-tenant rows derive only from existing answerable rows (construction, reproducible from
  `questions.json`); no new answerable material is invented.
- A3. Near-domain rows are agent-authored and explicitly flagged `queued_spot_check = true`; they are
  NOT treated as validated until the owner inspects them.
- A4. The 7 seen rows are pinned to calibration; the new held-out contains only rows not previously
  measured.
- A5. The operating threshold is read from `GATE_CONFIGS`; calibration may propose a new value, which
  is committed and re-validated on the new held-out, never tuned on it.

## Reject rules

- R1. Do not raise T05's threshold toward ~0.69 on the basis of the old held-out (that is tuning on
  held-out — explicitly forbidden).
- R2. Do not accept 1 unsafe as a pass for D1.
- R3. Do not report any D1 verdict at OOS N < 300 per tenant as anything other than "not measurable".

## Evidence to be produced

- `tooling/corpus/slice-c-cross-tenant-oos.json` — construction rows.
- `tooling/corpus/slice-d-near-domain-oos.json` — authored rows, queued for spot-check.
- Updated `questions.json` with the new split counts.
- Updated `KNOWN_ISSUES.md` §14 with per-tenant OOS N on the new held-out and the 3/N bound.
- A recalibration commit (separate) if calibration proposes a new T05 threshold, re-validated on the
  new held-out.
