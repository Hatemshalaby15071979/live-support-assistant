# Corpus provenance

**Phase.** P1. **Date.** 2026-10-07. **Status.** partial — harvesting works; the gold set does not exist yet.

Every source below was fetched from its repository at a pinned commit, passed through the licence
gate and the privacy gate, and written to a content-addressed snapshot. Nothing here is a claim
about a source; each line is derived from the manifest, which is derived from the bytes.

`tooling/corpus/manifest.json` is the machine-readable form. This document is the readable one.

---

## 1. What was harvested

| Source | Tenant | Language | Licence | Items | Excluded | Quarantined |
| --- | --- | --- | --- | ---: | ---: | ---: |
| `k8s-tasks-en` | T01-platform-operations-style | en | CC-BY-4.0 | **198** | 18 | 5 (2.5%) |
| `k8s-tasks-es` | T01-platform-operations-style | es | CC-BY-4.0 | **36** | 21 | 0 |
| `k8s-tasks-pt-br` | T01-platform-operations-style | pt-BR | CC-BY-4.0 | **69** | 4 | 0 |
| `k8s-tasks-fr` | T01-platform-operations-style | fr | CC-BY-4.0 | **42** | 17 | 0 |
| | | | **Total** | **345** | 60 | 5 |

**Languages: four, all real.** V2 asked for at least two non-English languages and permitted
translating licensed documents only if no licensed non-English source existed. It does exist: the
Kubernetes website carries localised trees under the same CC-BY-4.0 licence (`content/es`,
`content/pt-br`, `content/fr`, plus `de` and `ja` which are not yet registered). **No translated
corpus was built, and nothing here carries `origin: translated`.**

**Tenants: one, not the four V2 asks for.** See §4.

### Licences, read rather than assumed

Each entry records the URL the licence was read from, the date, and what the file said. The
evidence strings are in `sources.json`. In summary:

| Repo | Licence file opens with | Allowlisted as |
| --- | --- | --- |
| `kubernetes/website` | "Attribution 4.0 International" | CC-BY-4.0 |
| `django/django` | "Redistribution and use in source and binary forms…" (three-clause) | BSD-3-Clause |
| `python/cpython` | PSF licence history and grant | PSF-2.0 |

All three permit redistribution, so snapshot **text** is committed. All three require attribution,
so each snapshot carries an `attribution` field and the corpus cannot be published to a tenant
without it.

---

## 2. What was excluded, and why

60 documents were excluded before the privacy gate ever ran, and 5 were quarantined by it. Named,
not summarised:

| Reason | Count | Meaning |
| --- | ---: | --- |
| Too little prose after extraction | most of the 60 | Index pages, tables of contents, redirect stubs. A 20-line index is not a procedure. |
| Larger than 200 KB | few | A book is not a support procedure. |
| Fetch failed | few | Recorded with the error; not silently dropped. |
| Quarantined by the privacy gate | 5 | Named below. |

### The quarantined five

| Source | Document | Pattern | Match |
| --- | --- | --- | --- |
| `k8s-tasks-en` | (5 of 198) | mixed | not itemised here — see the manifest's `quarantine_detail` |
| `cpython-faq-en` | `Doc/faq/library.rst` | `email` | `34A04430.CF9@ohioee.com` |
| `cpython-faq-en` | `Doc/faq/programming.rst` | `labelled-contact-name` | `from Ulf Bartelt` |
| `django-faq-en` | `docs/faq/help.txt` | `email` | `security@djangoproject.com` |

---

## 3. Two sources were dropped, and the reason is a finding

`django-faq-en` (12.5%) and `cpython-faq-en` (25.0%) exceeded the 5% source-level limit and were
dropped whole, per V2's rule that a high quarantine rate means the source is the problem.

**The rule is working as written and the threshold is not meaningful at this size.**

- `django-faq-en` has **8 documents**. One intentional finding is 12.5%.
- `cpython-faq-en` has **12 documents**. Three findings are 25%.
- The 5% limit was designed for a corpus where 5% is a signal. On an eight-document source it is a
  coin flip: **a single deliberately published contact address drops the entire source.**

And the three findings are not personal data in any sense the gate exists to catch:

- `security@djangoproject.com` — the Django project's **published security contact**, printed in
  the FAQ precisely so that people can report vulnerabilities to it.
- `34A04430.CF9@ohioee.com` — an address used **as an example** in the FAQ's own explanation of
  email parsing.
- `from Ulf Bartelt` — a **contributor credit** in a public document.

All three are intentional, public, and published by the source project. None identifies anyone
incidentally, which is the only thing this gate is for.

**This is a policy question, not a bug, and it is not being decided unilaterally.** The options:

| Option | Effect |
| --- | --- |
| Keep the rule as written | Two legitimate sources stay dropped. The corpus is 345 items from one tenant. |
| Count only `high`-severity findings toward the rate | `labelled-contact-name` is `review` severity and would stop counting; `from Ulf Bartelt` would no longer drop CPython. The email findings would still count. |
| Add a minimum source size below which the rate is not applied | Removes the arithmetic absurdity, keeps the rule for real corpora, but leaves small sources ungated. |
| Treat role addresses and example addresses as non-findings | Needs a rule that distinguishes `security@` from a person's mailbox. Not reliably automatable. |

**Recommendation: the second.** `review` severity means "a human should look", and a human looking
at `from Ulf Bartelt` in a CC-BY documentation corpus concludes it is a credit. Making a
review-level signal block a whole source was never the intent, and the severity split already
exists in the code — it is simply not consulted by the rate.

This needs a prereg under the Zone Y contract before it is applied, and the rate is a threshold, so
it is written up here rather than changed in passing.

---

## 4. What P1 has not done

Stated plainly, because the exit gate says no:

| Required | Status |
| --- | --- |
| 4 tenants minimum, up to 6 | **1.** Only the Kubernetes sources are registered. Django and CPython were registered and dropped; two more domain analogues are needed. |
| ≥ 2 domains | **1.** Everything harvested is platform-operations-shaped. |
| Rungs 40 and 500 | **Neither.** 198 items is a document count, not a procedure count — procedures are built by `build-tenant.mjs`, which does not exist yet. |
| Gold set, 150–300 questions per primary tenant per rung | **Absent.** `questions.json` does not exist, and `verify-corpus.mjs` fails on exactly that. |
| Calibration / held-out split on a fixed seed | **Absent.** |
| Label protocol with two independent passes | **Not started.** |
| `verify-corpus.mjs` exits 0 | **No — 1 failure, the missing gold set.** |

**The exit gate is failing, correctly.** P1 is not complete, and the gate is the thing that says so
rather than a paragraph in a report.

---

## 5. How to reproduce

```bash
node tooling/verify-corpus-gates.mjs                              # 75 checks, 0 failures
node tooling/corpus/harvest.mjs                                   # all sources; ~5 minutes
node tooling/corpus/harvest.mjs k8s-tasks-en                      # one source
node tooling/corpus/verify-corpus.mjs --manifest tooling/corpus/manifest.json
```

The harvest is polite: 350 ms between requests, one Git Trees API call per source (the contents API
needs one per directory and exhausts the unauthenticated rate limit — the first attempt ran it down
to 34 remaining with nothing harvested), and document bytes from `raw.githubusercontent.com`, which
is not rate-limited.

Snapshots are content-addressed: the file is named by the SHA-256 of its own contents. Re-running a
source either reproduces the same file or produces a different name that says the bytes changed.

---

## 6. What this pipeline got wrong, and how it was found

Recorded because each was invisible to the tests and obvious to the corpus:

1. **A hardcoded `.md` filter.** Django's FAQ is `.txt`, CPython's is `.rst`. The first harvest
   returned "0 item(s)" for Django and read as a clean empty result. Sources now declare their own
   extensions, and a source matching no documents is reported as `no-documents`, not as success.
2. **`\p{L}` without the `u` flag** in `labelled-contact-name`. The property escape was not one, the
   class degraded to the literal characters `p { L }`, and the rule could never match.
3. **The `i` flag destroying case sensitivity** in the same rule. `i` applies to the whole pattern,
   so `[A-Z]` matched any letter and `from working with`, `from the Bourne` and `from colleagues
   made` all read as people's names. **100% of CPython's FAQ was quarantined by it** — a rate that
   reads like a privacy emergency and was a regex defect. The unit tests missed it because they only
   ever fed the rule text where a name really was present; real documents found it in one run.
4. **Reserved example domains counted as personal data.** `receiver@example.com` is not an
   address, by RFC 2606. Now excluded by a rule that removes matches which were never personal data
   and touches no address that could reach a person.

After fixes 2–4: CPython went 100% → 25%, Django 62.5% → 12.5%, and Kubernetes went from dropped
(73.9%) to harvested (2.5%).
