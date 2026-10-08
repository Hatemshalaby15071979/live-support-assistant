# Threat model — live-support-assistant

**Zone.** G (security). **Phase.** P5. **Date.** 2026-10-08.
**Scope.** The shipped product as it exists on `prog/main` at the P1 close (`fec58d6`): a
browser client, a Supabase (Postgres + GoTrue + edge functions) backend, and a signed
procedure bundle. It is a **retrieval-and-gate** system: there is no generative model in the
answer path, and that single fact removes a whole class of attack.

---

## 1. Assets

| Asset | Where it lives | Why it matters |
| --- | --- | --- |
| Procedure text | `sops` table; signed bundle on the device | The product's content. Cross-tenant leakage is the worst failure. |
| Query text | Transient in the client; escalation `evidence->>queryText` when escalated | Customer language; may contain PII |
| Escalation evidence | `escalations` table | Must be **content-free** (no procedure text) |
| Tenant signing **private** key | Edge-function secret store only | Forges bundles if leaked |
| Server wrapping **private** key | Edge-function secret store only | Unwraps bundle keys if leaked |
| Public halves | Client bundle (by design) | Public; must match the function's secrets exactly |
| Tenant identity | JWT `app_metadata.tenant_id` | The RLS boundary |
| Bundle manifest | Device | Names the model, dimensions, tenant |

## 2. Trust boundaries

1. **Device ↔ edge function.** The client is untrusted. It holds only public key halves and a
   publishable (anon) key; RLS is the real boundary, not the anon key.
2. **Edge function ↔ Postgres.** The function holds the secret key and acts as `postgres`.
3. **JWT claims ↔ RLS.** `app_metadata.tenant_id` + `app_metadata.app_role` are set by the
   platform on sign-in; RLS reads them. A forged or stripped claim must fail closed.
4. **Bundle manifest ↔ client.** A bundle is signed by the tenant key and names the model; the
   client refuses a bundle it cannot verify or whose model does not match.

## 3. What is defended (and by what)

| Threat | Defence | Evidence |
| --- | --- | --- |
| Cross-tenant read/write | RLS keyed on the tenant claim | `supabase/tests/rls_bypass.sql` (40 probes) + `rls_bypass_fleet.sql` (≥1,000 attempts) |
| Forged / stripped JWT | Fail-closed RLS; no-claim = no rows | `rls_bypass.sql` §1 |
| Model confusion (bundle for another model) | Publisher refuses to sign a mismatched model; client refuses to install one (`model_mismatch`) | `tooling/verify-publish-model-policy.mjs`; MC probes |
| Prompt / instruction injection in the query | **No instruction-following surface** — no LLM in the answer path | DI probes; by construction |
| Stored XSS via harvested procedure text | Text is rendered as text (no `dangerouslySetInnerHTML`, no markdown-to-HTML) | `xss-procedure-text.mjs` (in-browser) |
| Secrets in the client bundle | Build-time scan for key material | `tooling/verify-secrets-in-bundle.mjs` |
| PII in the corpus | Quarantine gate; >5% quarantine rate drops the source | `pii-gate.mjs`; `docs/CORPUS_PROVENANCE.md` |
| Unlicensed redistribution | Licence allowlist; NC/ND excluded | `licence-allowlist.json` |
| Escalation leaking procedure text | Content-free escalation records | gate suite; `escalations` assertions |

## 4. What is **not** defended — stated plainly

1. **Poisoned procedure (content trust).** A procedure that is hostile, wrong, or misleading but
   *well-formed and licensed* is served verbatim and can be answered confidently. This is a
   **content-trust** failure, not an injection, and no amount of input sanitisation fixes it. The
   product defends the *channel*; it does not vouch for the *content*. Mitigation is procedural:
   tenant-owned content, the conflict lint (`tooling/conflicts/`), and human review before publish.
2. **A wrong-but-plausible answer.** The gate measures similarity, not truth. Retrieval quality is
   the current ceiling (P1 report: T04 500-rung answerable R@1 30.0%); the gate reduces, not removes,
   wrong answers.
3. **Role-mailbox addresses as personal data.** `copyright@`-style addresses are treated as PII and
   quarantine their documents (OQ-006). That is a conservative call, not a proven one.
4. **The deployed/local divergence** (0.180757 vs 0.167715) is **unreproduced**. P0 removed its most
   plausible mechanism by construction; that is a hypothesis closed by construction, not a proof.
5. **Physical/endpoint compromise, browser extensions, and a malicious device** are out of scope.
6. **Denial of service / cost exhaustion** is bounded only by the platform's own limits.

## 5. Residual risk register

| id | Risk | Severity | Disposition |
| --- | --- | --- | --- |
| R-1 | Poisoned procedure answered confidently | Medium | **Accepted** — content-trust, procedural mitigation (conflict lint + human publish gate) |
| R-2 | Wrong-but-plausible answer from a weak retriever | Medium | **Accepted** — measured and reported; retrieval is the known ceiling |
| R-3 | Role-address PII rule over-quarantines | Low | **Accepted** (OQ-006, review date) |
| R-4 | Deployed/local divergence unexplained | Low | **Accepted** — not reproduced; recorded as unreproduced |
| R-5 | Secret-key compromise (server-side) | High | **Mitigated** by platform secret store; rotation procedure documented |

High/Critical findings may not be accepted without the owner (Zone R). None is currently open.
