# Owner queue — Zone R items

Items that need Hatem. Batched; never an interruption for a single entry.
Each entry carries the default that is **in effect right now**, so the program never stalls.

| id | What | Why it is Zone R | Default in effect | To review | Owner minutes |
| --- | --- | --- | --- | --- | --- |
| OQ-001 | Push `prog/main` and the phase branches to `origin` | Anything that leaves this machine | Stay local; branches exist only on this host | `git push -u origin prog/main` | 1 |
| OQ-002 | **Label spot-check batch 1 — 15 rows, all owner-supplied. OWNER REVIEW NOT DONE / UNVERIFIED.** | Label provenance: only `owner` and verified `agent-agreed` rows may carry a headline | `agent-agreed` rows stay `unverified` and are excluded from headlines; P1 proceeds | `node tooling/corpus/spotcheck.mjs --batch 1` | **15** |
| OQ-003 | Confirm the NC/ND licence exclusion list before P1 harvest | Licence compliance; a wrong call is a legal exposure, not an engineering one | NC/ND and unclear-terms sources are excluded automatically | `tooling/corpus/licence-allowlist.json` | 5 |
| OQ-004 | Release tag and public deployment at the end of P8 | Public action | Prepare the exact command; do not run it | — | 2 |
| OQ-005 | ~~Accepting the node-forge advisory past its 2026-10-30 review date~~ **MOOT — closed 2026-10-07** | The advisory left with `@sop/mobile`; the accepted-advisory set is now empty and the gate is strict | Nothing to accept | — | 0 |
| OQ-006 | Whether organisational role addresses (`copyright@`, `privacy@`, `dpo@`, `legal-support@`, `events@`, `secret-scanning@`) count as personal data | All 12 findings that drop GitHub's 72-document site-policy tree are role addresses published so anyone can contact the organisation. GDPR argues a role mailbox does not identify a natural person; the counter is that it can still reach one. **My recommendation: exclude a defined role set — it would recover the whole policy tree and make T05-policy-style a real tenant.** It is a threshold change and needs a prereg. | Site-policy stays dropped; T05-policy-style stays empty | `docs/CORPUS_PROVENANCE.md` §5 | 3 |
| OQ-007 | The vendor delete-guard defect, for reporting upstream | Two independent failures on this host: the lock's `STALE_LOCK_MS` (5 min) is three orders of magnitude larger than `LOCK_TIMEOUT_MS` (2 s), so a process killed while holding it poisons bulk deletes for five minutes; and the `genie-trash` helper times out under `spawnSync`. Both are in `WorkBuddyAI/resources/…/shim/`, outside this repository. **Needed from you: accept the documented workaround, or report it.** | Workaround documented in `DECISIONS.md`: run long commands backgrounded; use `CODEBUDDY_SAFE_DELETE_ENABLED=0` rather than clearing `NODE_OPTIONS` | `docs/program/DECISIONS.md` | 2 |

## Closed

| id | Closed | How |
| --- | --- | --- |
| OQ-008 | 2026-10-07 | **Closed.** OD-13 labelled `out_of_scope` by the owner: the document explains how to add or update payment methods but does not answer why a stale card is charged, or how default payment selection works. The `decided: false` flag is gone and all 15 OD rows are decided. |
| OQ-009 | **Retrieval baseline complete — review the numbers** | The baseline is the first measurement of the built gold set and it is not a headline until reviewed | Baseline recorded in `tooling/corpus/baseline-results.json`; no claim published | `node tooling/corpus/run-baseline.mjs` | 10 |
| OQ-005 | 2026-10-07 | `@sop/mobile` excluded from the workspace (prereg `g9-drop-mobile`). node-forge, braces and sprintf-js left the lockfile with it; `sharp` was patched. `pnpm audit --prod` reports zero. |

---

## OQ-002 in detail — the batch that is ready now

> ### ⚠️ OWNER REVIEW: NOT DONE / UNVERIFIED
>
> The owner confirmed on **2026-10-07** that he did **not** independently inspect the T04 documents for
> these 15 rows. He initially marked the proposed labels "agree" from the agent's presentation, not by
> reading the source documents.
>
> Therefore, and this is binding:
>
> 1. Those marks are **not** an independent owner spot-check.
> 2. They **do not** count toward the 85% owner-match acceptance threshold.
> 3. They are **not** rewritten as if validated.
> 4. `spotcheck-batch-1.json` records `review_status: "NOT DONE"` and an evidence note saying so.
> 5. No row is relabelled or excluded on the basis of those provisional marks.
>
> **The owner spot-check is parked and must not be used as evidence for recall or gold-label quality
> claims.** Every label below is agent-produced and unverified.

**Run `node tooling/corpus/spotcheck.mjs --batch 1`.** It prints 15 rows and writes
`tooling/corpus/spotcheck-batch-1.json`.

**Time: 12–18 minutes for the 15 rows.** Ordered most-likely-wrong first — the two `agent-single`
labels, then `medium` confidence, then the rest — so **stopping after the first ten still covers
every label that is in doubt.**

**Per row:** does the T04 corpus answer the question at all? If not, `out_of_scope` is correct and
refusing is the right behaviour. If it does, is the named document the one that answers it? Write
AGREE or DISAGREE. **A DISAGREE is the most valuable output** — it is the only thing in this
pipeline that can find a wrong label, because both labelling passes were run by the same agent and
their agreement measures whether two *methods* agree, not whether the labels are right.

**Acceptance: 85% AGREE.** Below that the labelling protocol is re-run.

**The 15 labels as they now stand, in batch order.** `label_source: owner` means the owner decided the
label on the agent's evidence packet; it does **not** mean the owner inspected the documents.

| # | ID | Label | Document | Conf | Split |
| --- | --- | --- | --- | --- | --- |
| 1 | **OD-13** | **answerable — NOT DECIDED** | `billing/…/manage-payment-info.md` | medium | held-out |
| 2 | OD-01 | out_of_scope | — | high | held-out |
| 3 | OD-02 | answerable | `…/changing-your-username.md` + `concepts/username-changes.md` | high | calibration |
| 4 | OD-03 | out_of_scope | — | high | calibration |
| 5 | OD-04 | answerable | `billing/…/manage-payment-info.md` | high | calibration |
| 6 | OD-05 | answerable | `billing/…/manage-payment-info.md` | high | calibration |
| 7 | OD-06 | out_of_scope | — | high | calibration |
| 8 | OD-07 | out_of_scope | — | high | calibration |
| 9 | OD-08 | out_of_scope | — | high | calibration |
| 10 | OD-09 | out_of_scope | — | high | calibration |
| 11 | OD-10 | out_of_scope | — | high | calibration |
| 12 | OD-11 | out_of_scope | — | high | held-out |
| 13 | OD-12 | out_of_scope | — | high | calibration |
| 14 | OD-14 | out_of_scope | — | high | calibration |
| 15 | OD-15 | out_of_scope | — | high | calibration |

**Totals: 3 answerable (OD-02, OD-04, OD-05) · 11 out_of_scope · 1 undecided (OD-13).** 3 + 11 + 1 = 15.

**Eleven of fifteen resolve to `out_of_scope`, and that is the corpus-fit limit, not a labelling
failure.** T04 is GitHub's own account and billing documentation; the questions describe a consumer
service with phone verification and policy bans. See `docs/KNOWN_ISSUES.md` §10.

---

## OQ-009 in detail — the retrieval baseline

**Command:** `node tooling/corpus/run-baseline.mjs`. Model `Xenova/all-MiniLM-L6-v2` (the shipped
bi-encoder), no reranker, no confidence gate — the retrieval half only. Written to
`tooling/corpus/baseline-results.json`.

**These are the first measurements of the built gold set. They are not published as a claim until
reviewed.**

| Tenant | Rung | Group | n | R@1 | R@3 | R@5 | mean top-1 |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| T01 | MVR 123 | A clean | 18 | 94.4% | 100.0% | 100.0% | 0.675 |
| T01 | MVR 123 | A title-echo | 2 | 100.0% | 100.0% | 100.0% | 0.611 |
| T01 | 500 | A clean | 18 | 77.8% | 100.0% | 100.0% | 0.678 |
| T04 | MVR 57 | A clean | 18 | 77.8% | 88.9% | 94.4% | 0.627 |
| T04 | MVR 57 | B answerable | 20 | 70.0% | 80.0% | 90.0% | 0.513 |
| T04 | MVR 57 | B out_of_scope | 12 | — | — | — | **0.375** |
| T04 | 500 | A clean | 18 | 72.2% | 83.3% | 94.4% | 0.638 |
| T04 | 500 | B answerable | 20 | **30.0%** | 80.0% | 80.0% | 0.537 |
| T04 | 500 | B out_of_scope | 12 | — | — | — | **0.413** |
| T05 | MVR 123 | A clean | 7 | **42.9%** | 71.4% | 71.4% | 0.728 |
| T05 | MVR 123 | A title-echo | 13 | **92.3%** | 100.0% | 100.0% | 0.812 |
| T05 | MVR 123 | B answerable | 3 | 100.0% | 100.0% | 100.0% | 0.566 |

**Three things a reviewer should look at first:**

1. **Title-echo rows are trivially easy and must stay out of headlines.** T05: **92.3%** R@1 for
   title-echo against **42.9%** for clean. Averaging them would report 75% for a set whose honest
   figure is 42.9%.
2. **T04 answerable R@1 collapses from 70% (MVR) to 30% (500).** The same questions, the same model,
   a larger corpus. Any headline that does not name the rung is meaningless.
3. **`out_of_scope` separates from answerable on top-1 similarity** — 0.375/0.413 against
   0.513/0.537. That separation is what a confidence gate would act on, and it is the first evidence
   that the gate has something to work with.

**`out_of_scope` recall is shown as `—`, not 0%.** There is no correct document, so recall is
undefined rather than zero.
