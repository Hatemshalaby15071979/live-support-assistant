# P1 gold set — plan, and what happens to the owner's 29 queries

**Date.** 2026-10-07. **Status.** harvesting closed; this is the next step.

---

## 1. The 29 queries cannot label the new corpus

`tooling/eval/simulated-tenant/my-floor-queries.csv` — 29 rows, columns
`id, query, source_type, my_label, my_sop_id, notes, label_source`, every row `source_type: author
floor experience` and `label_source: author-written, author-labeled`.

They were written for the **simulated WaveCast tenant**: seven procedures, `wc-gifts`, `wc-payout`
and the rest. Their `my_sop_id` values name procedures that **do not exist in the new corpus**,
which is Kubernetes task pages and GitHub Docs.

So they cannot be reused as gold labels. There is no correct answer to "which procedure answers
this?" when the procedure set has changed underneath the question. Treating them as if they carried
over would produce a gold set whose every label is wrong, and the resulting accuracy figure would be
a measurement of the label mismatch.

**What they are still worth, and it is three things:**

1. **The owner-labelled slice of the old tenant.** The simulated tenant still has the recorded 0.18
   baseline (335/500, 0 unsafe) and it is still the only corpus with a 0.18/0.17 margin band. The 29
   queries are the only owner-labelled set in the repository. They stay with that tenant, evaluated
   against it, as their own slice — and any figure from that slice is labelled as belonging to the
   simulated tenant.
2. **The `label_source` convention.** `author-written, author-labeled` is the shape the new gold set
   needs per row. The manifest field exists; the 29 rows are the worked example.
3. **The query *style* to imitate.** Look at what the owner wrote: `wein el coins bta3ty i paid but
   nothing showed up` — Arabizi, code-switched, lowercase, no punctuation, first person. That is what
   a real customer message looks like, and it is the opposite of the new corpus's author-voiced
   technical prose.

## 2. The problem this exposes

**The new corpus cannot answer these queries, and the queries are the honest ones.**

A Kubernetes task page has no concept of a double charge on a coin pack. The corpus is technical
documentation: long, structured, author-voiced, written to be read rather than to answer a question.
The owner's queries are short, messy and user-voiced, written to be answered.

So a gold set written against the new corpus has a choice, and it must be made explicitly rather
than drifted into:

| Option | What it measures | Honest label |
| --- | --- | --- |
| **A. Write queries in the corpus's own register** — "how do I configure a pod to use a ConfigMap?" | Retrieval over technical documentation | A **technical-documentation retrieval** benchmark. Not a support benchmark. |
| **B. Write user-voiced queries against the corpus** — "my container keeps restarting after I changed the config, what do I do?" | Retrieval where the query does not share vocabulary with the document | A **harder and more useful** benchmark, and the one closer to the product. |
| **C. Both, as separate slices** | Each of the above, reported separately | Recommended. |

**Recommendation: C.** Slice A establishes a ceiling that is easy to hit and proves the pipeline
works. Slice B is the number that matters, because a support assistant meets user-voiced queries and
the corpus it is given will rarely be written in the same register. Publishing only A would be a
benchmark that flatters the system; publishing only B would confound retrieval quality with the
corpus's unsuitability.

## 3. What the gold set must contain

Per V2 §5 P1, and unchanged:

| Requirement | Detail |
| --- | --- |
| Size | 150–300 questions per primary tenant per rung |
| Rungs | 40 and 500 |
| Split | calibration / held-out, 70/30, fixed seed, recorded |
| Per row | `origin` ∈ {`owner`, `public`, `derived-paraphrase`} and `label_source` ∈ {`owner`, `agent-agreed`, `agent-single`} |
| Label protocol | two independent agent passes; agreement → `agent-agreed`; disagreement → excluded |
| Owner verification | `spotcheck.mjs` emits 20-row batches; ≥ 85% owner match required |
| Exit gate | `node tooling/corpus/verify-corpus.mjs --manifest tooling/corpus/manifest.json` exits 0 |

**`derived-paraphrase` needs a leakage control.** A paraphrase of a corpus sentence will retrieve
its own source trivially, so paraphrase queries are held out from the documents they were derived
from, or the derived/held-out split is reported separately.

## 4. Blocking question for the owner

**The 29 queries need a decision, and there is no version of this where I should just proceed.**

- Confirm they stay with the simulated tenant as its own labelled slice, rather than being retargeted
  at the new corpus. My recommendation is to keep them where their labels are true.
- Choose A, B or C for the new gold set. My recommendation is C.
- Confirm the label register: the owner's queries are user-voiced, and if the new set is written
  author-voiced (A) it will be a different and much easier measurement.

Until that is answered, the gold set cannot be written, because the answer changes every row of it.
