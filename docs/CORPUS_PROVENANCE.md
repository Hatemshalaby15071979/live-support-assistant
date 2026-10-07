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
| `ghdocs-site-policy-en` | T05-policy-style | en | CC-BY-4.0 | **58** | 9 | 5 |
| | | | **Total** | **544** | 99 | 6 |

### Which tenants are multilingual — and which are not

**This matters for every language comparison and must travel with any per-language figure.**

| Tenant | Domain analogue | Languages present | Multilingual? |
| --- | --- | --- | --- |
| **T01** | platform-operations-style | en, es, pt-BR, fr | **Yes — the only multilingual tenant** |
| **T04** | customer-support-style | en | **No — English only** |
| **T05** | policy-style | en | **No — English only** |

**Every multilingual result in this project comes from T01, which is technical documentation.**
T04 and T05 — the two sources closest to customer-support and policy shape — are English-only.

So a per-language figure measures **platform-operations-style technical documentation**, not
support traffic and not policy text. If a language comparison is published, that sentence belongs
next to it. A reader who assumes the Spanish arm reflects how the product behaves on Spanish
support tickets would be reading a result about Kubernetes task pages.

This is a **coverage limit, not a defect to fix by translating**: V2 permits translated corpora only
where no licensed non-English source exists, and for T01 it does. For T04 and T05 no licensed
non-English equivalent was found, so those tenants are English-only and stay that way rather than
being padded with machine translations that would carry `origin: translated`.

**Languages: four** — en 397, pt-BR 69, fr 42, es 36. **No translated corpus was built, and nothing
carries `origin: translated`.**

**Domains: three.** T01 platform-operations-style (350), T04 customer-support-style (136),
T05 policy-style (58). V2 asks for four tenants and at least two domains; there are three tenants
and three domains.

**Quarantine: 0.0% on every Kubernetes source, in all four languages.** T04 1.2%, T05 4.8%.

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

### The regression set was overfitted, and a held-out set proved it

The 44-string set above scored **100%** — and that number was worthless, because the rules had been
tuned against it. Two held-out sets were frozen and committed **before** being run, so the number
reported is detection on data the tuning never saw.

| Set | Strings | First-contact recall |
| --- | ---: | ---: |
| Regression (tuned against) | 104 | 100% |
| Held-out 1 — committed `e337174` | 60 | **55.0%** |
| Held-out 2 — committed before its run | 30 | **60.0%** |

**The honest held-out number is 60.0%.** Both sets then scored 100% after the fixes, but neither is
held out any more — a set that has been looked at is a guard, not a measurement.

What the held-out sets found that the regression set never could:

| Category | Held-out 1 | The formats it missed |
| --- | ---: | --- |
| `honorific-name` | 16.7% | `Ms. J. Okafor`, `Dña. Marta Ruiz`, `M. Julien Berger` |
| `labelled-contact-name` | 16.7% | `Contact: Smith, Jane` — a comma broke the rule |
| `account-identifier` | 25.0% | `nº de socio`, `expediente`, `matrícula`, `dossier`, `contrat`, `A/C`, `Acct.`, `Réf.`, `póliza`, `protocolo` |
| `national-id` | 20.0% | no rule existed for DNI, NIF, CPF, NIR |
| `bank-identifier` | 0.0% | no rule existed for IBAN, sort code, RIB, BIC |
| `postal-address` | 85.7% | `P.O. Box 4471`, `Elm Road 12` |

**The structural finding, which is the real result.** Every miss is a **vocabulary** miss. The gate
enumerates nouns, honorifics and abbreviations, so it finds what someone thought to list and misses
`protocolo` because nobody wrote `protocolo` down. That approach cannot reach 95% on unseen
vocabulary; each held-out set moves the number by adding entries, and the next unseen set finds the
next unlisted word. Two ways out, and neither is a quick fix: keep enumerating (diminishing returns,
and every addition risks precision), or make the vocabulary-dependent categories shape-driven —
match a long identifier adjacent to *any* label-like token rather than to a known noun.

Also found, and fixed: the `i` flag on the new bank rule made `[A-Z0-9]` match lowercase, so a real
IBAN matched as one token with the following prose, failed its length validator, and scored as
nothing. The label-driven alternatives now carry their own case alternation instead.

### Independent precision check

Three plain patterns — email shape, phone shape, long digit run — written separately from the gate
and run over all 544 documents. **105 distinct values, and not one is personal data:** 28 IP
addresses, ~45 version strings, 22 bare digit runs (epoch timestamps, byte counts, sequential ids),
2 dates, and 6 email-shaped values that are all documented placeholders or reserved domains
(`octocat@nowhere.com`, `USERNAME@users.noreply.github.com`, `jane@computer.local`,
`username@kubernetes-remote-server.example`).

The same scan also **vindicates the nine re-admitted items**: six have zero independent hits, and
the three that do have only `112879`, `31496.` and `162.900.000` — a byte count, a number fragment
and a memory quantity. None is a person.

It also shows why the gate needs validators: the plain phone pattern produced ~100 false positives
on IP addresses and version strings. A simple gate is not a stricter gate, it is a noisier one.

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

## 5. Two sources were dropped

| Source | Rate | Why |
| --- | ---: | --- |
| `django-faq-en` | 12.5% | 1 finding in 8 documents: `security@djangoproject.com`, the project's published security contact. |
| `cpython-faq-en` | 12.5% | 1 finding in 12: `34A04430.CF9@ohioee.com`, an address used as an example in the FAQ's own explanation of email parsing. |

Both are the same shape: **a single finding in a very small source**. `django-faq-en` has eight
documents, so one finding is 12.5% — the arithmetic of a threshold designed for large corpora
applied to a tiny one. Neither source is large enough to matter to the fleet, and neither is being
argued for.

**`ghdocs-site-policy-en` was dropped and is now harvested.** It was the subject of prereg `g12`
(`docs/prereg/g12-role-addresses.md`), which excluded a closed, named list of organisational role
local-parts. It re-harvested at **58 items, 4.8%**, with five documents still quarantined on genuine
findings — two honourific names, GitHub's corporate office address, and two email addresses. The
person-shaped addresses that must stay caught are tested at 13 shapes across four languages.

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
