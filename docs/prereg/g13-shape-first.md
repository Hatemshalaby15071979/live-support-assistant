# Prereg — shape-first matching for structured identifiers

**Zone.** Y. **Date.** 2026-10-07. **Status.** registered before the run. Scored once; the number is
published as it lands.
**Owner decision.** APPROVED 2026-10-07, with a hard budget: **one more pass, at most three repair
cycles, one fresh held-out set, scored once.** No further cycling after that.

---

## The finding this answers

Three held-out sets have now been scored. The first 60 scored **55.0%**; the fresh 30 scored
**60.0%**. Every miss was a **vocabulary** miss: `protocolo`, `A/C`, `Acct.`, `Réf.`, `póliza`,
`Rev.`, `Dña.`, `P.O. Box`, `Elm Road 12`, Steuer-ID, PESEL, BIC.

The gate enumerates nouns, honorifics and abbreviations. It finds what someone wrote down and misses
what nobody thought of. Adding entries moves the number and does not change the property: **the next
unseen set finds the next unlisted word.** That is the definition of a rule that cannot reach 95% on
unseen input, and three rounds of evidence now say so.

## The change

**Invert the default for structured identifiers.** Instead of "match a known label, then a number",
match **any label-like token followed by a long identifier**, and reject against a **closed list of
non-label words**. The default becomes "this is a label"; the exception is a small, named list of
words that never label an identifier in a technical corpus.

| Category | Before | After |
| --- | --- | --- |
| Account / case / reference identifiers | open vocabulary of ~30 nouns | **any 2–20 letter word** followed by a long digit run, minus a closed non-label list |
| IBAN / BIC / sort code | label-driven | **structure-driven**: IBAN length and mod-97, BIC 8/11 shape, sort-code shape |
| Phone | cue or 3-3-4 | unchanged shapes **plus** more intrinsic ones |
| **Names** | vocabulary-driven | **unchanged — and disclosed as the weak category** |

### The closed non-label list

These words appear before long numbers in technical prose and do **not** label an identifier:
`chapter`, `section`, `part`, `page`, `line`, `figure`, `table`, `example`, `step`, `version`,
`release`, `build`, `port`, `size`, `limit`, `count`, `total`, `timeout`, `interval`, `bytes`,
`memory`, `cpu`, `replicas`, `nodes`, `milliseconds`, `seconds`, `minutes`, `hours`, `days`, `year`,
`month`, `day`, `min`, `max`, `default`, `minimum`, `maximum`, `above`, `below`, `since`, `after`,
`before`, `about`, `around`, `roughly`, `approximately`, `http`, `https`, `sha`, `commit`, `epoch`.

The list is closed. A word not on it is treated as a label, which is the conservative default for a
privacy gate: the cost of a false positive is one quarantined document, and the cost of a false
negative is a customer identifier in a customer-facing corpus.

## Names are the disclosed weak category

**Stated plainly, before the score, so it cannot be presented as a surprise afterwards.** Name
detection stays vocabulary-driven and will keep missing honorifics and orderings nobody listed. A
name in free prose — `the account was reviewed by Marta Ruiz` — is not detected at all, and this
prereg does not claim otherwise.

That is a **disclosed residual risk**, not a bug to be discovered later. It is also why the
independent precision scan is the mitigation rather than a second regex: a human reading 105 distinct
values is the only thing in this pipeline that would catch a name nobody anticipated.

## Metric

Held-out recall on **one fresh 30-string set**, committed before the run, **scored once**. Reported
per language, per category, and overall.

## Accept rule

- Held-out recall **≥ 95%**, **and**
- `pnpm run verify` green, **and**
- the independent precision scan still finds no personal data in the corpus.

## Reject rule

- Recall **< 95%** → the number is published as **NOT MET**. The floor is not lowered, the set is not
  re-scored, and no fourth set is written. The independent scan is carried as mitigation and the
  residual risk is stated.
- Any person-shaped address or planted name stops being caught.
- Precision collapses: the shape-first default quarantines a large fraction of a source.

## Budget, and what happens when it runs out

**At most three repair cycles.** A cycle is: run the set, read the misses, change the rules, re-run.
After the third, whatever the number is, it is published. The purpose of the budget is that a gate
tuned indefinitely against a moving target reports a number that means nothing — and three prior
rounds have already shown the number moving 55% → 60% → 100% → 60% as the sets changed underneath it.

## What is published either way

- **Met:** the held-out number, the independent scan, and the gate change.
- **Not met:** the held-out number printed as **NOT MET** alongside the floor, the independent scan
  as mitigation, and the residual risk — including the explicit statement that name detection is
  incomplete and that this is known, not discovered.

## Rollback

One function (`isNonLabelWord`) and the rule definitions in `pii-gate.mjs`. No snapshot or manifest
depends on them; rollback is a code revert plus a re-harvest.
