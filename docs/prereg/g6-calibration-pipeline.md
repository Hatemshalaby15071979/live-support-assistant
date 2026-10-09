# Prereg — G6, a derived per-tenant margin

**Zone.** Y (calibration). **Date.** 2026-10-09. **Status.** registered **before** the tool exists and
before any number is produced. Scored once per tenant; the number is published as it lands.
**No threshold is changed by this prereg.** It creates the procedure that would later propose one,
per tenant, on evidence.

---

## The finding this answers

No tenant has ever been calibrated. `packages/core/src/types.ts` carries `minMargin: 0.18`, and
`docs/KNOWN_ISSUES.md` #6 states plainly that it is a **prototype default, not a value fitted to a
customer**. The same file records that **0.17 is a harness-only evaluation value and must never be
presented as a tenant setting.**

That is not a documentation problem. D5 requires *"every fleet tenant has a calibration record from
its own corpus on a calibration split"*. No such record exists for any tenant, so D5 is **NOT MET**,
and every margin quoted anywhere in the project is one number borrowed across three different
corpora.

The measured evidence that one number cannot serve three tenants is already in the tree:
`docs/KNOWN_ISSUES.md` #13 records a fleet spread of **0.53–0.68**, and #12 records that T04's own
zero-unsafe point costs **25.9% false refusals**. Pooling them either serves unsafe answers in one
tenant or refuses most of another's traffic for no benefit.

## The change

A new tool, `tooling/calibration/derive-margin.mjs`, which for **one tenant at a time**:

1. reads that tenant's corpus and its labelled questions;
2. splits them into **calibration** and **held-out** sets, disjoint, by a **recorded seed**;
3. sweeps candidate margins on the **calibration split only**, in code;
4. applies the objective below, mechanically;
5. emits a **calibration record** — per tenant, and per language where P3 says the arm exists.

## Hypothesis

**Zero unsafe on the calibration split is achievable at a margin that still answers a useful share of
in-scope traffic, per tenant, and the three tenants' derived margins differ materially.**

The second half is the part that matters. If the derived margins come out equal, then 0.18 was
accidentally right and this whole exercise is a formality — which would itself be worth knowing and
would be published as such.

## Metric

Per tenant: `margin`, `unsafe`, `answered`, `false-refusal rate`, and in-scope recall, each with **N**
and the **3/N upper bound** printed beside any zero. Reported per language where the arm exists.

## Data split

| Split | Use |
| --- | --- |
| Calibration | Sweeping. The only split the margin may be read from. |
| Held-out | **Read once, after the margin is frozen.** Never used to choose it. |

Splits are disjoint and derived from a **committed seed**, so the split itself is reproducible and
cannot be re-drawn after seeing a result.

## Accept rule

For a tenant's derived margin to be **accepted**:

- **0 unsafe on the calibration split**, and
- it **answers more in-scope traffic than the current 0.18 default does on the same split**, and
- the **held-out read is taken once** and is reported **whether or not it agrees**.

## Reject rule

The result is published as **NOT MET** when any of these hold:

- **Any unsafe on the calibration split** at every candidate margin — the tenant has no defensible
  operating point at this corpus size, and that is the finding.
- The derived margin **only matches** 0.18 rather than beating it — then 0.18 is retained and the
  exercise is recorded as confirming, not improving.
- The held-out read shows an unsafe answer. **The margin is not re-derived after this.** A figure
  adjusted after seeing the held-out number is exactly what this prereg exists to prevent.
- The split cannot be made disjoint at the available N — the tenant is reported as
  **NOT MEASURABLE**, never as passing on a shared split.

## Never emitted

- **`0.17` as a tenant setting.** It is a harness-only evaluation value. If a sweep lands on it, the
  record states the harness value and does not install it.
- Any margin presented without its split, its N, and its unsafe count.
- A pooled fleet margin. Calibration is per tenant by definition (D5).

## Held-out discipline

The held-out split is read **exactly once per tenant**, after the margin is frozen, and the read is
timestamped in the calibration record with the commit SHA. Re-reading it to check a change is a new
preregistration, not a re-run.

## Budget, and what happens when it runs out

**At most three repair cycles per tenant.** A cycle is: sweep, read the calibration split, change the
objective or the sweep range, re-sweep. After the third, whatever the number is, it is published. The
held-out read is taken once at the end of the budget, not once per cycle.

## What is published either way

- **Met:** the derived margin per tenant, the calibration numbers, the single held-out read, and the
  commit SHA.
- **Not met:** the same numbers printed as **NOT MET** alongside what was attempted, the tenant marked
  **NOT MEASURABLE** where it is, and the residual stated.

## Rollback

`tooling/calibration/derive-margin.mjs` is additive and reads only. It writes no threshold into
`packages/core`. A derived margin becomes a shipped value **only** through a separate, explicit
change to `GATE_CONFIGS` — which is a customer-facing promise and therefore Zone R.

## What this prereg does not do

It does not lower any floor, change `minMargin`, change D5's wording, or make any tenant's gate
different from today's. Until a derived margin is separately approved, **every tenant still runs
0.18**, and every figure that rests on 0.18 keeps its existing caveats.
