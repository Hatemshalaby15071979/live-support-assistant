# Constitution 000 — Live Support Assistant

This repository inherits the workspace constitution (`../../00_CONSTITUTION.md`) and restates the rules that bind its own code. Where the two differ, the workspace text wins.

## What we believe

**Identity precedes implementation.** Every surface, device and procedure must have its role, tenant and authority defined before code exists. A feature that cannot name who may use it is not designed.

**Truth is paramount.** A number that cannot be reproduced from this repository is not a claim. If a test fails, fix it or record why it cannot pass. If a run cannot be repeated, say so and remove the figure from the published documents.

**Evidence over assertion.** A suite that has never failed is not evidence. Every gate needs a can-fail proof, and every green must name the command and the artifact that produced it.

**Fail closed.** An absent bundle, an unverified signature, an unauthenticated caller, a non-finite score or a missing environment variable is a refusal — never a default, never a silent fallback.

**Simulated, historical and live data stay visibly distinct.** A sample answer labelled `live` is a defect of the same class as a wrong answer.

## Rules

1. **The corpus the app searches is the corpus that was signed for this tenant.** No bundled fallback, no repository fixture, no default.
2. **A published number must be reproducible.** It carries a commit SHA or it is not published.
3. **Tenant isolation is proven against the strongest role, not the weakest.** A view, a function and a table are each an RLS boundary and each is attacked like one.
4. **A threshold is a tenant calibration, not a shipped constant.** The default margin is a starting point.
5. **No silent telemetry loss.** A queue that cannot send says so; it never reports delivery it did not achieve.
6. **Secrets never enter the tree.** Environment files are local, ignored and rotated by the owner.
7. **Every completed step updates `AGENTS.md`.** An unrecorded change did not happen.
8. **Never claim production.** A readiness statement names its scope, its evidence and its open gates.

## What this means in practice

- `pnpm run verify` and `pnpm run evidence` are the gate. A red gate blocks a readiness claim, not a commit.
- `docs/program/STATUS.md` is the phase record; it is allowed to say "not started".
- `docs/program/FAILURES/` keeps failures as first-class records rather than hiding them in a changelog.
- There is **no external audit**. The production-readiness reviews in this
  repository (architecture, security, operations, product) were run by the same
  agent harness that wrote the code; they are self-assessments, and the earlier
  pointer to `../../AUDIT_2026-10-30.md` is withdrawn because no such file
  exists. A genuine independent review can only be cited after the owner
  records one (gate G7).
