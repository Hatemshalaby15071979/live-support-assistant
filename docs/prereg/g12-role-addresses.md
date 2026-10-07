# Prereg — exclude organisational role addresses from the privacy gate

**Zone.** Y (a threshold on the corpus gate — V2 §2.2).
**Date.** 2026-10-07.
**Status.** registered before the run. Immutable after the run.
**Owner decision.** APPROVED 2026-10-07, with conditions. The conditions are binding and are
restated in §6.

---

## Hypothesis

Twelve findings drop GitHub's entire 72-document `site-policy` tree. Every one is an **organisational
role address** — `copyright@github.com` (×6), `privacy@`, `dpo@`, `legal-support@` (×2), `events@`,
`secret-scanning@` — or GitHub's corporate office address in a contract. None identifies a natural
person, which is the test the gate exists to apply.

A **closed, named list** of role local-parts will stop those addresses being treated as personal
data, while addresses shaped like a person (`first.last@`, `f.last@`, `flast@`) remain quarantined.

## The closed list

The list is closed in both directions: a local part is excluded because it is **on this list**, and
no pattern, prefix rule or "looks generic" heuristic may extend it. Adding a member is a reviewed
diff to `licence-allowlist.json`-style data, not a regex change.

| Excluded role local-part | Why it cannot identify a person |
| --- | --- |
| `copyright` | A legal notice mailbox. |
| `privacy` | A rights-request mailbox, published so anyone can exercise a right. |
| `dpo` | Data Protection Officer — a statutory *role*, not an individual. |
| `gdpr` | As above. |
| `data-protection` | As above. |
| `abuse` | A published abuse-reporting mailbox. |
| `security` | A published vulnerability-disclosure mailbox. |
| `security-response` | As above. |
| `legal` | A legal-notices mailbox. |
| `legal-support` | As above. |
| `compliance` | A compliance mailbox. |
| `support` | A first-line support mailbox. |
| `press` | A press-enquiries mailbox. |
| `media` | As above. |
| `sales` | A sales-enquiries mailbox. |
| `billing` | A billing mailbox. |
| `accounts` | An accounts mailbox. |
| `events` | An events mailbox. |
| `info` | A general-enquiries mailbox. |
| `hello` | A general-enquiries mailbox. |
| `contact` | A general-enquiries mailbox. |
| `admin` | An administrative mailbox. |
| `webmaster` | A published web mailbox. |
| `postmaster` | A published mail mailbox. |
| `jobs` | A recruitment mailbox. |
| `careers` | As above. |
| `trust-and-safety` | A published safety mailbox. |

`noreply`, `no-reply`, `donotreply`, `git`, `svn`, `hg`, `mailer-daemon` and `bounce` are already
excluded as **machine** addresses in `MACHINE_LOCAL_PARTS`; they are not restated here and the two
lists stay separate, because the reasons differ — one cannot receive mail, the other cannot
identify a person.

## What does not change

**An address shaped like a person stays quarantined.** The exclusion is an exact match on a closed
list, so `jane.smith@`, `j.smith@`, `janesmith@`, `jane_smith@` and `jsmith@` are all still findings.
This is the condition that makes the change safe and it is tested directly (§5).

## Metric

1. `site-policy` source status: `harvested` or `dropped`, and its rate.
2. Items in the corpus before and after.
3. **Person-shaped-address recall** (§5), which must stay at 100%.
4. `pnpm run verify` green.

## Accept rule

1. `ghdocs-site-policy-en` is `harvested`, with a high-severity rate at or below 5%.
2. **Every person-shaped planted address is still caught** — 100%, not "most".
3. No item that carried a genuine finding re-enters the corpus.
4. `pnpm run verify` stays green.

## Reject rule

Any of these rejects the change:

1. Any person-shaped address stops being caught. This is the whole risk of the change.
2. A source is harvested whose high-severity rate exceeds 5%.
3. Any suite in `pnpm run verify` fails or changes verdict.

## 5. The planted test, written before the change

Person-shaped addresses that must remain quarantined, across the four corpus languages and across
the shapes real people use:

- `first.last@`, `first_last@`, `firstlast@`, `f.last@`, `flast@`, `first.l@`
- initials and surnames: `j.okafor@`, `jm.okafor@`, `okafor.j@`
- accented and hyphenated: `josé.muñoz@`, `anne-marie.dubois@`
- a person whose surname happens to be a role word: `jane.support@`, `john.legal@`
- and the negative control: an excluded role address, which must **not** be caught

The last two matter most. `jane.support@` proves the match is on the whole local part and not on a
substring; the negative control proves the exclusion is live rather than the test being vacuous.

## 6. Owner conditions (binding)

1. The role list is **closed and named**, and every member is listed in the prereg. ✅ §The closed list.
2. Person-shaped local-parts stay quarantined. ✅ §What does not change.
3. A planted test proves person-shaped addresses are still caught. ✅ §5.

## What is published either way

- **Accepted:** the role list lands in `pii-gate.mjs` as data; `docs/CORPUS_PROVENANCE.md` §5 is
  rewritten; the corpus grows by the 72-document policy tree.
- **Rejected:** an entry in the rejected-experiment register naming which condition failed. A
  rejection here would mean the role list and person detection are coupled, which would make the
  exclusion unusable.

## Rollback

One `Set` in `pii-gate.mjs` and one branch in `isRoleAddress`. No snapshot or manifest depends on
the rule, so rollback is a code revert plus a re-harvest.
