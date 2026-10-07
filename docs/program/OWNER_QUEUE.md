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

**The 15 labels, with document and confidence, in batch order:**

| # | ID | Label | Document | Conf | Pass |
| --- | --- | --- | --- | --- | --- |
| 1 | OD-07 | answerable | `billing/…/manage-enterprise-invoice.md` | medium | single |
| 2 | OD-09 | answerable | `…/deleting-your-personal-account.md` | medium | single |
| 3 | OD-03 | answerable | `…/troubleshooting-email-verification.md` + `verifying-your-email-address.md` | medium | agreed |
| 4 | OD-11 | answerable | `billing/…/troubleshooting/locked-account.md` | medium | agreed |
| 5 | OD-12 | answerable | `…/troubleshooting-email-verification.md` | medium | agreed |
| 6 | OD-01 | answerable | `billing/…/troubleshooting/locked-account.md` | high | agreed |
| 7 | OD-02 | answerable | `…/changing-your-username.md` + `concepts/username-changes.md` | high | agreed |
| 8 | OD-04 | answerable | `billing/…/manage-payment-info.md` | high | agreed |
| 9 | OD-05 | answerable | `billing/…/manage-payment-info.md` | high | agreed |
| 10 | OD-13 | answerable | `billing/…/manage-payment-info.md` | high | agreed |
| 11 | OD-06 | **out_of_scope** | — | high | agreed |
| 12 | OD-08 | **out_of_scope** | — | high | agreed |
| 13 | OD-10 | **out_of_scope** | — | high | agreed |
| 14 | OD-14 | **out_of_scope** | — | high | agreed |
| 15 | OD-15 | **out_of_scope** | — | high | agreed |

**Five refusal cases.** OD-06/14 (marketing opt-out), OD-08 (partial payment) and OD-10 (freeze an
account) have no matching document anywhere in T04. **OD-15 is the near-domain test supplied
deliberately** — a live-stream gift double-charge is the simulated WaveCast tenant's subject matter,
and refusing it is correct behaviour, not a miss.

**The four medium-confidence labels are the ones to look at hardest.** OD-03 and OD-12 describe a
code sent to a *phone*; T04 documents *email* verification, so the channel may not match. OD-07 asks
for a language option the invoice document does not mention. OD-09 asks to "reset" where the corpus
documents *deleting*.
