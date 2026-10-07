# Corpus provenance

**Phase.** P1. **Date.** 2026-10-07. **Status.** partial — harvesting works; the gold set does not exist yet.

Every source below was fetched from its repository at a pinned commit, passed through the licence
gate and the privacy gate, and written to a content-addressed snapshot. Nothing here is a claim
about a source; each line is derived from the manifest, which is derived from the bytes.

`tooling/corpus/manifest.json` is the machine-readable form. This document is the readable one.

---

## 0. What these sources are, and are not

**Every source in this corpus is a technical documentation analogue.** They are published product
and project documentation — Kubernetes, Django, CPython, GitHub Docs — standing in for the kind of
material a real tenant would supply.

**They are not support procedures, and must not be called that.** A Kubernetes task page is a
procedure for an operator, not a resolved customer ticket. The distinction matters because a reader
who sees "support procedure corpus" will assume the material has the shape of real support traffic —
short, ambiguous, user-voiced — and it does not. It is long, well-structured and author-voiced,
which is exactly the difficulty P1's gold set has to work around.

Two sources are as close to customer-support and policy shape as licensed material was found to get:
GitHub Docs' account and billing trees are a product help centre, and its site-policy tree is
literally policy text.

---

## 1. What was harvested

| Source | Tenant | Language | Licence | Items | Excluded | Quarantined |
| --- | --- | --- | --- | ---: | ---: | ---: |
| `k8s-tasks-en` | T01-platform-operations-style | en | CC-BY-4.0 | **203** | 18 | 0 |
| `k8s-tasks-es` | T01-platform-operations-style | es | CC-BY-4.0 | **36** | 21 | 0 |
| `k8s-tasks-pt-br` | T01-platform-operations-style | pt-BR | CC-BY-4.0 | **69** | 4 | 0 |
| `k8s-tasks-fr` | T01-platform-operations-style | fr | CC-BY-4.0 | **42** | 17 | 0 |
| `ghdocs-account-en` | T04-customer-support-style | en | CC-BY-4.0 | **55** | 14 | 0 |
| `ghdocs-billing-en` | T04-customer-support-style | en | CC-BY-4.0 | **81** | 16 | 1 |
| | | | **Total** | **486** | 90 | 1 |

**Languages: four** — en 339, pt-BR 69, fr 42, es 36. V2 asked for at least two non-English
languages and permitted translating licensed documents only if no licensed non-English source
existed. It does exist: the Kubernetes website carries localised trees under the same CC-BY-4.0
licence. **No translated corpus was built, and nothing carries `origin: translated`.**

**Domains: two.** T01 platform-operations-style (350 items) and T04 customer-support-style (136).
V2 asks for four tenants and at least two domains; there are two tenants and two domains.

**Quarantine: 0.0% on every Kubernetes source, in all four languages.** One document in the billing
tree (1.2%).

### Licences, read rather than assumed

Each entry records the URL the licence was read from, the date, and what the file said. The evidence
strings are in `sources.json`. In summary:

| Repo | Licence file opens with | Allowlisted as |
| --- | --- | --- |
| `kubernetes/website` | "Attribution 4.0 International" | CC-BY-4.0 |
| `github/docs` | "Attribution 4.0 International" | CC-BY-4.0 |
| `django/django` | "Redistribution and use in source and binary forms…" (three-clause) | BSD-3-Clause |
| `python/cpython` | PSF licence history and grant | PSF-2.0 |

All permit redistribution, so snapshot **text** is committed. All require attribution, so every
snapshot carries an `attribution` field and the corpus cannot be published to a tenant without it.

---

## 2. The language comparison is parity-checked, not assumed

A localised tree is a **partial** translation of the English one, updated on its own schedule. A
language comparison across pages that are not the same page measures the corpus, not the language.
`tooling/corpus/translation-pairs.mjs` measures it, matching on the path with the language segment
removed (`content/es/docs/tasks/foo/bar.md` → `docs/tasks/foo/bar.md`).

| Language | Items | With an English counterpart **in the corpus** | Rate | How comparisons must be labelled |
| --- | ---: | ---: | ---: | --- |
| pt-BR | 69 | 68 | **98.6%** | parity — safe to compare |
| fr | 42 | 38 | **90.5%** | parity — safe to compare |
| es | 36 | 32 | **88.9%** | **PARTIAL — 4 pages unpaired; label any comparison that includes them** |

**This is better than the risk the owner flagged, and it is not perfect.** The localised trees are
largely genuine translations: 88.9–98.6%. No language falls below 50%, so none warrants the
strongest label ("different content, not parity").

**The four unpaired Spanish pages are named**, and any D4 table whose figures include them must say
so:

- `debug/debug-cluster/logging-elasticsearch-kibana.md`
- `tools/included/install-kubectl-linux.md`
- `tools/included/install-kubectl-macos.md`
- `tools/included/install-kubectl-windows.md`

Four unpaired pages out of 36 is 11% of the Spanish arm. If a per-language figure moves and those
four pages are in it, the move is not a language effect.

---

## 3. Detection was measured, and it was not good enough

The owner required a planted-PII recall test before the quarantine-rate change could be made.
`tooling/verify-pii-recall.mjs` plants **44 fabricated strings** across 8 categories and 4 languages,
each inside a carrier sentence. A string counts as caught only when **the category the gate claims**
is the one that fires — "some finding appeared" would hide a broken rule behind a working one.

**First measurement: 72.7%.** Below the 95% floor. By language:

| | First measurement | After the fixes |
| --- | ---: | ---: |
| English | 100% | 100% |
| Spanish | **29%** | 100% |
| Portuguese | **40%** | 100% |
| French | **43%** | 100% |
| **Overall** | **72.7%** | **100%** |

**The gate was effectively English-only, and 147 of the 345 documents then in the corpus were not
English.** It would have quarantined almost nothing in the Spanish, Portuguese and French trees
while passing an English-only test.

Four defects, none of which the unit tests could see:

1. `\p{L}` without the `u` flag — the property escape was not one, the class degraded to the literal
   characters `p { L }`, and the rule could never match.
2. The `i` flag turning `[A-Z]` into "any letter" — `from working with` and `from the Bourne` read as
   people's names. **100% of CPython's FAQ was quarantined by this.**
3. A phone rule hardcoded to the North-American 3-3-4 shape. `912 345 678` and `01 45 67 89 01` are
   ordinary Spanish and French numbers; neither matched.
4. English-only trigger vocabulary in every rule — `Sra`, `Sr`, `Mme`, `Calle`, `Rue`, `referencia`,
   `référence` were all invisible.

### And the precision it cost, found on the real corpus

Widening three rules to reach 100% recall quarantined six ordinary Kubernetes documents and 34.9% of
GitHub's site-policy tree. Every counterexample is now a permanent test case:

| Matched as | Actually |
| --- | --- |
| `Signed CA Certificate` | a certificate description |
| `from Docker Compose`, `from Docker Engine`, `from Kubernetes API` | ordinary prose after a preposition |
| `2000 4096`, `1000 2000`, `10.102.30`, `162.900.000` | memory sizes, CPU counts, version fragments |
| `de 10000`, `de 31568` | French prose |
| `contact GitHub Support`, `Contact Us`, `Contact Information` | instructions to contact an organisation |
| `AUTHORITY TO` | an all-caps contract heading |
| `MR This` | an abbreviation before a pronoun |
| `(2018-04-03` | a date |
| `git@github.com` | an SSH remote |
| `octocat@nowhere.com`, `USERNAME@users.noreply.github.com` | documented placeholders |

`verify-corpus-gates.mjs` went from 75 checks to **105**, and the corpus recovered from 345 items
across 4 sources to **486 across 6**.

---

## 4. The quarantine rate counts high severity only — approved, with a confound

Prereg: `docs/prereg/g10-quarantine-rate-severity.md`, committed before the run. The owner approved
the change with conditions; the full result is in `DECISIONS.md`.

**What changed:** only `high`-severity findings count toward the 5% source-drop rate.
**What did not:** an item carrying a finding of **any** severity is still quarantined and still stays
out of the corpus.

**Two changes landed together and they are entangled** — the rate change, and the detection fix the
recall test forced. The prereg's accept rule 2 therefore cannot attribute a source's fate to one or
the other, and its accept rule 3 ("no previously-quarantined item is in the corpus") **reports a
violation where there is none**: nine re-admitted items were all false positives, confirmed by
reconstructing the old rule and reading what it matched. That is a defect in the prereg, recorded
rather than explained away.

---

## 5. Three sources were dropped

| Source | Rate | Why |
| --- | ---: | --- |
| `ghdocs-site-policy-en` | 19.0% | 12 findings, every one a **published organisational role address** (`copyright@github.com` ×6, `privacy@`, `dpo@`, `legal-support@`, `events@`, `secret-scanning@`) or GitHub's corporate address in a contract. |
| `django-faq-en` | 12.5% | 1 finding in 8 documents: `security@djangoproject.com`, the project's published security contact. |
| `cpython-faq-en` | 12.5% | 1 finding in 12: `34A04430.CF9@ohioee.com`, an address used as an example in the FAQ's own explanation of email parsing. |

**The site-policy drop is the one worth a decision.** All 12 findings are role addresses published
deliberately so that anyone can contact the organisation. Under GDPR a role mailbox does not identify
a natural person, which argues they are not personal data and should be excluded. Against that: a
role mailbox can still reach a person, and this module deliberately does not get to decide that.

**This is not being decided unilaterally.** The narrow change — exclude a defined set of
organisational role local parts (`copyright`, `privacy`, `dpo`, `legal-support`, `events`,
`secret-scanning`, `press`, `abuse`) — would recover GitHub's entire 72-document policy tree and make
T05-policy-style a real tenant. It is a threshold change and it needs a prereg.

---

## 6. What P1 has not done

| Required | Status |
| --- | --- |
| 4 tenants minimum, up to 6 | **2.** |
| ≥ 2 domains | **2.** met |
| Rungs 40 and 500 | **Neither.** 486 items is a document count, not a procedure count — procedures come from `build-tenant.mjs`, which does not exist yet. |
| Gold set, 150–300 questions per primary tenant per rung | **Absent.** `questions.json` does not exist and `verify-corpus.mjs` fails on exactly that. |
| Calibration / held-out split on a fixed seed | **Absent.** |
| Label protocol, two independent passes | **Not started.** |
| `verify-corpus.mjs` exits 0 | **No — 1 failure, the missing gold set.** |

**The exit gate is failing, correctly.** P1 is not complete and the gate says so rather than a
paragraph in a report.

---

## 7. How to reproduce

```bash
node tooling/verify-corpus-gates.mjs                          # 105 checks, 0 failures
node tooling/verify-pii-recall.mjs                            # 44/44, 100%
node tooling/corpus/harvest.mjs                               # all sources; ~8 minutes
node tooling/corpus/harvest.mjs k8s-tasks-en                  # one source
node tooling/corpus/translation-pairs.mjs                     # the parity table above
node tooling/corpus/verify-corpus.mjs --manifest tooling/corpus/manifest.json
```

**Always run the harvest in the background.** It takes 6–8 minutes with a 350 ms politeness delay per
document, and a command killed by the foreground timeout can leave the host's delete-guard lock held
— see `DECISIONS.md`, "B2–B7 root-caused".

Snapshots are content-addressed: the file is named by the SHA-256 of its own contents, and the
timestamp lives in the manifest rather than inside the snapshot, so a re-run either reproduces the
same file or produces a different name that says the bytes changed.
