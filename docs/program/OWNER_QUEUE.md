# Owner queue — Zone R items

Items that need Hatem. Batched; never an interruption for a single entry.
Each entry carries the default that is **in effect right now**, so the program never stalls.

| id | What | Why it is Zone R | Default in effect | To review | Owner minutes |
| --- | --- | --- | --- | --- | --- |
| OQ-001 | Push `prog/main` and the phase branches to `origin` | Anything that leaves this machine | Stay local; branches exist only on this host | `git push -u origin prog/main` | 1 |
| OQ-002 | **Label spot-check batch 1 — 15 rows, all owner-supplied. OWNER SPOT-CHECK NOT DONE / NOT OWNER-VALIDATED** (Hatem did not independently inspect the documents). Re-tagged 2026-10-08 with `evidence_basis`. | Label provenance: only `owner` rows may carry a recall/D3 headline — **5 exist (3 answerable, all T04 calibration)**; recall/D3 still NOT MEASURABLE at the required 150–300/tenant/rung | `evidence_basis`: full-text-verbatim ×6 (owner ×5: OD-02/04/05/11/15; OD-06 unresolved) · fragment-only ×9 · source-opened ×0. The 7 first-batch AGREE rows stay agent-agreed (unverified) and are parked for a full-text re-show (OQ-011). Provisional 7/14 interaction = historical context only | `node tooling/corpus/spotcheck.mjs --batch 1` | **15** |
| OQ-003 | Confirm the NC/ND licence exclusion list before P1 harvest | Licence compliance; a wrong call is a legal exposure, not an engineering one | NC/ND and unclear-terms sources are excluded automatically | `tooling/corpus/licence-allowlist.json` | 5 |
| OQ-004 | Release tag and public deployment at the end of P8 | Public action | Prepare the exact command; do not run it | — | 2 |
| OQ-006 | Whether organisational role addresses (`copyright@`, `privacy@`, `dpo@`, `legal-support@`, `events@`, `secret-scanning@`) count as personal data | All 12 findings that drop GitHub's 72-document site-policy tree are role addresses published so anyone can contact the organisation. GDPR argues a role mailbox does not identify a natural person; the counter is that it can still reach one. **My recommendation: exclude a defined role set — it would recover the whole policy tree and make T05-policy-style a real tenant.** It is a threshold change and needs a prereg. | Site-policy stays dropped; T05-policy-style stays empty | `docs/CORPUS_PROVENANCE.md` §5 | 3 |
| OQ-007 | The vendor delete-guard defect, for reporting upstream | Two independent failures on this host: the lock's `STALE_LOCK_MS` (5 min) is three orders of magnitude larger than `LOCK_TIMEOUT_MS` (2 s), so a process killed while holding it poisons bulk deletes for five minutes; and the `genie-trash` helper times out under `spawnSync`. Both are in `WorkBuddyAI/resources/…/shim/`, outside this repository. **Needed from you: accept the documented workaround, or report it.** | Workaround documented in `DECISIONS.md`: run long commands backgrounded; use `CODEBUDDY_SAFE_DELETE_ENABLED=0` rather than clearing `NODE_OPTIONS` | `docs/program/DECISIONS.md` | 2 |
| OQ-009 | Retrieval baseline complete — review the numbers | The baseline is the first measurement of the built gold set and it is not a headline until reviewed | Baseline recorded in `tooling/corpus/baseline-results.json`; no claim published. **Review deferred until OQ-002 relabelling and the impact-table rerun are complete.** | `node tooling/corpus/run-baseline.mjs` | 10 |
| OQ-010 | Owner spot-check — multilingual gold rows (T01 es/fr/pt-BR; 42 rows, 14 per language, per prereg `docs/prereg/gold-multilingual-rows.md`) | Rows are `agent-agreed`, `origin=derived-paraphrase` — **never a headline**; passing promotes them only to **owner-verified derived-paraphrase** (their own slice) | Rows **unverified**; languages fail independently. **Bilingual presentation**: the owner may not read es/fr/pt-BR, so each row shows the question + a machine English translation flagged **"aid, not evidence"**, the verbatim source passage + a machine translation. Owner judges *"does this passage answer this question"* in English; a native-speaker naturalness check is a **separate optional item**. **Batches of 6 rows per language.** | Per language: `node -e "for (const x of require('./tooling/corpus/questions.json').questions.filter(q => q.language === 'es')) console.log(x.id,'|',x.text,'|',x.acceptable_documents[0]);"` (`'es'`→`'fr'`→`'pt-BR'`); the agent supplies the English aids when the batch is pulled | **6–8 min per batch of 6** |
| OQ-011 | Re-show the 7 first-batch AGREE rows (OD-03, 07, 08, 09, 10, 12, 14) in the **full-text keyword format** | These 7 were judged on 150-char fragments (`evidence_basis=fragment-only`); the full text may change a verdict | Rows stay `agent-agreed` (unverified) until re-shown | One batch of 7, full-text passages + keyword hits (the `relabel-evidence.mjs` format) | **8–10 min** |
| OQ-012 | **F-1 acceptance — its two open obligations.** F-1 is **ACCEPTED** (option D, 2026-10-08). Two items now need the owner: **(a) `anon` coverage proven on a hosted run** — the local stack has no `anon` role, so it is UNPROVEN LOCALLY and the acceptance carries it as an obligation, not a satisfied one; **(b) the 90-day review on 2027-01-06** — re-check conditions 1–4, whether a text-parameter RPC has been added, and whether a platform change makes option A/B viable. | Both are owner actions: (a) needs a hosted project; (b) is the scheduled re-check. Option C (the only structural fix) is deferred until a text-parameter RPC appears. | Conditions recorded in `docs/SECURITY_FINDING_F1_claim_override.md` §8 and `DECISIONS.md`; the tripwire (suite 6) and the **7 failing section-4b probes stay in place** — a green fleet suite is a regression, not a success. `anon` stays UNPROVEN LOCALLY until (a). | `pnpm run verify:db` against a hosted project (needs an `anon` role); then `docs/SECURITY_FINDING_F1_claim_override.md` §8 | 5 |
| OQ-013 | **Hosted `auth.users` holds 97 accounts outside the harness fixture — PROVISIONAL: likely synthetic hosted residue, NOT proven real.** 104 accounts total. **7 are the current fixture** (all 7 UUIDs confirmed present). The other 97: **60 `example.com`** created in a single 2026-09-28 window, **41 `alpha.example`** (only 5 fixture-shaped), **3 `beta.example`** (2 fixture + 1). All 104 are `provider = email`, all confirmed, zero orphans, and **all three domains are RFC 2606 / RFC 6761 reserved**, so no real mailbox can exist there. Not proven fake: local-parts were not inspected (they could contain a personal name). | Deleting auth users is irreversible and touches GoTrue-owned data. | **Leave untouched.** No user has been deleted, disabled or modified. | Aggregate queries recorded in `docs/program/DECISIONS.md` (2026-10-08) | 10 |
| OQ-014 | **Hosted test helpers should live outside API-exposed schemas (`test_support`).** Current mitigation is containment + discovery-based cleanup + residue tripwire — but the helpers still sit in `public`, granted to API roles, **for the duration of every hosted run**. Preferred durable design: create them in a non-exposed `test_support` schema with no grants to `anon`/`authenticated`. Requires a controlled experiment: either qualify every create/call site across four suites, or run them under `PGOPTIONS='-c search_path=test_support,public'`, which changes name resolution for the whole run. | Schema / search-path semantics across multiple suites is a design decision, not a mechanical edit. | **Parked.** The current design is accepted as containment; `test_support` is **NOT** implemented. | `tooling/db/verify-hosted.sh`; `docs/program/DECISIONS.md` (2026-10-08) | 30 |

## Closed

| id | Closed | How |
| --- | --- | --- |
| OQ-008 | 2026-10-07 | **Closed.** OD-13 labelled `out_of_scope` by the owner: the document explains how to add or update payment methods but does not answer why a stale card is charged, or how default payment selection works. The `decided: false` flag is gone and all 15 OD rows are decided. (Provenance corrected 2026-10-07: provisional owner choice on agent-presented evidence — not owner document inspection or validation.) |
| OQ-005 | 2026-10-07 | `@sop/mobile` excluded from the workspace (prereg `g9-drop-mobile`). node-forge, braces and sprintf-js left the lockfile with it; `sharp` was patched. `pnpm audit --prod` reports zero. |

---

## OQ-002 in detail — the batch that is ready now

> ### ⚠️ OWNER SPOT-CHECK: NOT DONE / NOT OWNER-VALIDATED (provenance corrected 2026-10-07)
>
> **Hatem did NOT independently inspect the 15 source documents.** No OQ-002 record is an independent
> owner check or owner validation.
>
> 1. **Historical context only:** a provisional 2026-10-07 interaction recorded 7 AGREE / 7 DISAGREE of
>    14 countable rows (50% vs the 85% bar) on 150-char agent-presented fragments. Preserved as history —
>    **not a completed independent owner check**. OD-13 excluded (provisional choice via OQ-008).
> 2. **Agent full-text relabel layer (kept, separate provenance):** the 7 DISAGREE rows were re-labelled
>    by AGENT inspection of the re-fetched pinned corpus; the owner's replies were provisional choices on
>    agent-presented evidence — OD-01 [B] out_of_scope stands · OD-02 [A] answerable (acceptable set
>    +username-reference.md, an agent label miss) · OD-04 [A] answerable (manage-payment-info.md) ·
>    OD-05 [A] answerable (acceptable document changed to declined-card.md) · OD-06 [C] UNRESOLVED
>    (stays out_of_scope, unvalidated either way) · OD-11 [B] out_of_scope stands (answering appeal doc
>    is T05 — tenant-scoped) · OD-15 [B] out_of_scope stands. No OOS/answerable flips.
> 3. **`evidence_basis` (owner correction 2026-10-08).** The 2026-10-07 "owner rows fleet-wide: 0" was
>    an over-correction. Re-tagged: **owner ×5** on `full-text-verbatim` evidence (OD-02/04/05/11/15) —
>    owner DECISIONS on agent-presented hash-verified full text, **not** document inspections; **OD-06**
>    full-text but UNRESOLVED [C] (`agent-full-text`, not an owner recall row); **fragment-only ×9**
>    (OD-01 top-3 retrieval; OD-03/07/08/09/10/12/13/14 150-char fragments) stay `agent-agreed`,
>    `unverified`. **`source-opened`: 0.**
> 4. **Recall/D3 claims are NOT MEASURABLE at the required N** — owner recall rows are 3 answerable
>    (OD-02/04/05), all T04 calibration (see DECISIONS.md). The 7 first-batch AGREE rows are parked for
>    a full-text re-show (OQ-011).

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

**The 15 labels as they now stand, in batch order.** Under the 2026-10-08 `evidence_basis` re-tag,
`owner` (OD-02/04/05/11/15) means the owner DECIDED the label on agent-presented **full-text-verbatim**
(hash-verified) evidence — it does **not** mean the owner opened the documents. The remaining rows are
`agent-agreed`/`agent-full-text` on `fragment-only` evidence and carry **no headline authority**.

| # | ID | Label | Document | Conf | Split |
| --- | --- | --- | --- | --- | --- |
| 1 | **OD-13** | **out_of_scope** (owner, OQ-008 2026-10-07) | — | medium | held-out |
| 2 | OD-01 | out_of_scope | — | high | calibration |
| 3 | OD-02 | answerable | `…/changing-your-username.md` + `concepts/username-changes.md` + `reference/username-reference.md` | high | calibration |
| 4 | OD-03 | out_of_scope | — | high | calibration |
| 5 | OD-04 | answerable | `billing/…/manage-payment-info.md` | high | calibration |
| 6 | OD-05 | answerable | `billing/…/troubleshooting/declined-card.md` | high | calibration |
| 7 | OD-06 | out_of_scope | — | high | calibration |
| 8 | OD-07 | out_of_scope | — | high | calibration |
| 9 | OD-08 | out_of_scope | — | high | calibration |
| 10 | OD-09 | out_of_scope | — | high | calibration |
| 11 | OD-10 | out_of_scope | — | high | calibration |
| 12 | OD-11 | out_of_scope | — | high | calibration |
| 13 | OD-12 | out_of_scope | — | high | calibration |
| 14 | OD-14 | out_of_scope | — | high | calibration |
| 15 | OD-15 | out_of_scope | — | high | calibration |

**Totals: 3 answerable (OD-02, OD-04, OD-05) · 12 out_of_scope (incl. OD-13, owner OQ-008) · 0 undecided.** 3 + 12 = 15.

> **OD-13 reconciliation (2026-10-07):** the OQ-002 table previously read "answerable — NOT DECIDED". Owner resolved OD-13 as `out_of_scope` via OQ-008 — the document explains how to add or update payment methods but not why a stale card is still charged, nor how default payment selection works. The OQ-002 independent 15-row spot-check remains NOT DONE / UNVERIFIED; OD-13's resolution is a separate targeted owner decision and is excluded from the not-done batch count.

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
