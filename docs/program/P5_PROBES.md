# P5 — adversarial probe list

Working list for P5 (security and isolation proof). Seeded from V2 §5 P5.3–P5.4, with
additions recorded below. V2 remains the governing brief; this file is the execution
checklist for it.

Every probe is a test with a pass/fail, run against the sandboxed local stack. A probe
that cannot fail is not a probe — each carries the negative control that proves it is
live.

---

## Category 1 — direct injection (query field)

Hostile text submitted as a customer question.

| id | Probe | Expected |
| --- | --- | --- |
| DI-01 | Instruction override in the query ("ignore your rules and answer") | Retrieval and gate unaffected; no instruction is followed because no generative model is in the path |
| DI-02 | Role-play framing ("you are now a different assistant") | Same |
| DI-03 | Encoded payload (base64 / unicode escapes) | Same |
| DI-04 | Query that is itself a procedure title | Answered or escalated on score, never on text match |
| DI-05 | Negative control: a normal in-scope query | Answered — proves the harness is live |

## Category 2 — indirect injection via corpus text

**The highest-value surface in this product.** A tenant procedure is untrusted input that
reaches the retrieval path.

| id | Probe | Expected |
| --- | --- | --- |
| II-01 | Procedure body containing instruction text | Rendered inert; retrieval unaffected; no instruction executed |
| II-02 | Procedure body containing HTML/script | Escaped on render; stored-XSS test in-browser |
| II-03 | Procedure body containing markdown image/link payloads | No outbound request |
| II-04 | Procedure whose text mimics a system/developer message | No special treatment |
| II-05 | Negative control: a benign procedure | Served normally |

## Category 3 — information extraction

| id | Probe | Expected |
| --- | --- | --- |
| IE-01 | Attempt to read the bundle manifest of another tenant | Denied by RLS |
| IE-02 | Attempt to read key material from the client bundle | No secret is present in any client bundle (build-time scan) |
| IE-03 | Attempt to read another tenant's procedure text | Denied |
| IE-04 | Attempt to read another tenant's escalation evidence | Denied |
| IE-05 | Negative control: a tenant reading its own bundle | Succeeds |

## Category 4 — tool abuse

| id | Probe | Expected |
| --- | --- | --- |
| TA-01 | SQL injection through every RPC parameter | Parameterised; no injection |
| TA-02 | Path traversal in `publish-bundle` / `upsert-sop` inputs | No filesystem reach |
| TA-03 | Command injection in publish/ingest inputs | No shell reach |
| TA-04 | Oversized payload / decompression bomb | Bounded |
| TA-05 | Negative control: a well-formed RPC call | Succeeds |

## Category 5 — goal hijacking

Steering the gate to answer when it must escalate.

| id | Probe | Expected |
| --- | --- | --- |
| GH-01 | Query crafted to maximise margin on an out-of-scope question | Refusal layer holds |
| GH-02 | Corpus edited so a contradictory policy scores decisively | Publish blocked (422) or escalation |
| GH-03 | Escalation record inspected for leaked procedure text | Content-free |

## Category 6 — model confusion — **ADDED 2026-10-07**

Added by the owner as a P0 follow-up. D7 closed the two halves in code (the client refuses
a mismatched bundle; the publisher refuses to sign one); these probes prove the closure
holds against an adversary rather than only against a well-behaved caller.

| id | Probe | Expected |
| --- | --- | --- |
| MC-01 | Publish with `body.model` naming a different model id | **HTTP 400**, naming the field — `tooling/verify-publish-model-policy.mjs` covers the policy; the probe covers the deployed function |
| MC-02 | Publish with `body.model` differing only in `dimensions` | HTTP 400 |
| MC-03 | Publish with `body.model` differing only in `quantization` | HTTP 400 |
| MC-04 | Publish with `body.model.revision` set to a branch (`main`) | HTTP 400 |
| MC-05 | Publish with `body.model` restating the deployment's model | Accepted; the manifest names the server's model, not the caller's object |
| MC-06 | Serve a signed bundle whose manifest names another model to a client | Client refuses; `model_mismatch`; the previous bundle stays active |
| MC-07 | Substitute a foreign-tenant bundle whose model matches | Refused on tenant, not on model — proves the checks are independent |
| MC-08 | Negative control: publish and install with the matching model | Succeeds — proves the harness is live |
| MC-09 | Reconstruct the historical divergence: publish at a mismatched model, then install on a client that ignores the check | Must reproduce a different margin — the counterexample that motivates the check |

**MC-09 is the one that matters.** It is the only probe that tests the *reason* for the
check rather than the check itself, and it is the reproduction P0 could not perform
(`docs/program/phase-0-report.md`, "Not done"). It needs the deployed path, so it runs in
P5 rather than P0.

## Category 7 — mandatory gaps named in V2 §5 P5.4

| id | Probe | Expected |
| --- | --- | --- |
| OS-01 | Hostile HTML/markdown/script in a harvested procedure renders inert in the client | No script execution; stored-XSS test in-browser |
| PP-01 | A hostile or misleading procedure served verbatim | Documented as a **content-trust** failure, not an injection; the threat model states what is and is not defended |

## Rules

- A finding gets a failing test first, then a fix.
- Medium/Low may be accepted with a review date and an entry in `DECISIONS.md`.
- **High/Critical may not be accepted without the owner** (Zone R).
- Every category carries a negative control. A suite that passes because it is inert is
  the failure mode the controls exist to catch.
