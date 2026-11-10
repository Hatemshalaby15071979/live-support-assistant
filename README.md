<div align="center">

# LIVE Support Assistant

<!-- badges:start -->

[![CI](https://github.com/Hatemshalaby15071979/live-support-assistant/actions/workflows/ci.yml/badge.svg)](https://github.com/Hatemshalaby15071979/live-support-assistant/actions)
![licence](https://img.shields.io/badge/licence-MIT-blue)
![local verification](https://img.shields.io/badge/local%20verification-pass%20(2026--11--05)-brightgreen)

*Local verification measured 2026-11-05 on `prog/main`; the public GitHub repository is populated (default branch `prog/main`) and its hosted CI runs pass.*

<!-- No static test or coverage count is shown here: a frozen
     number decays silently. Run the suite for a current figure;
     the local verification record below is dated evidence, not a live hosted result. -->
<!-- badges:end -->

</div>

## What is this?

A support assistant that answers customer questions **from a tenant's own procedures**, and is designed to say "I'm not sure — let me get a human" instead of guessing.

There is no AI chatbot deciding what you read. The flow is:

1. Sign in — your tenant's signed policy bundle loads (no fallback corpus; searching nothing returns nothing).
2. The app searches those procedures **on your device** (nothing leaves the machine).
3. A confidence gate checks the match. If the best answer isn't decisively better than the runner-up, the question is **escalated to a human** — with no procedure text leaked.
4. Accepted answers can be copied and sent.

The gate's behaviour is covered by 10 verification checks. The prototype also refuses to publish a procedure corpus that contradicts itself.

## Current status — read this first

**This is a prototype, evaluated only on simulated tenants. It is intended for a shadow-mode pilot (answers shown to agents, never to customers) — not production.**

- Hosted CI passes on the default branch, but it only builds a web bundle; it does not deploy anything.
- There is no real customer traffic, no external security audit, and no certified data isolation.
- The hosted app needs credentials, so there is no guest account.

## What the measurements honestly show

Every number below is a measurement on simulated or author-written data — not production experience. Full detail lives in [`docs/EVIDENCE.md`](docs/EVIDENCE.md).

**What works:**

- The author-written "must refuse" set held: **0 of 8** refusal rows were auto-answered.
- The deployed app and the local harness made **identical decisions on all 39 comparable tickets**.
- The gate, sync, persistence, key-rotation and database layers all have their own passing verification suites.

**What doesn't — measured, not rhetorical:**

- **One unsafe answer was recorded on the deployed path.** A deliberately contradictory question was answered at a match margin of 0.18 — exactly the shipped threshold, so the gate did not stop it. The local harness escalates the same question; the deployed run pins no commit, so this is a recorded observation, not a reproducible claim.
- **6 of 52 out-of-scope questions were answered** when they should have been escalated (7 at a stricter threshold). Three of the six were cases where the human owner disagreed with the machine's own assessment.
- **Recall is low on a bigger corpus:** 84 of 302 in-scope questions found at 48 procedures (27.8%).
- Non-English retrieval lags well behind English (62.1% vs ~32%).

The honest summary: the refusal path is real and the direction is right, but the claim is **"safety-first by design" — not "safe"**. Threshold calibration is per-tenant work that hasn't been done.

## Try it (5 minutes, no account needed)

The local evaluation harness runs the same decision path in a browser with no sign-in and no database:

```bash
pnpm install
pnpm -r run build
SIMULATION_RUN_LABEL=my-demo SIMULATION_MIN_MARGIN=0.18 \
SIMULATION_BATCH=demo-tickets.json SIMULATION_CORPUS=corpus.json \
node tooling/eval/simulated-tenant/run-chaos-evaluation.mjs
```

It runs four tickets — one answered, three refused — and writes the results next to the harness. First run downloads a ~22 MB model; your query text never leaves the machine. Needs Node ≥ 22, pnpm, and Chrome. Full walkthrough: [`docs/DEMO.md`](docs/DEMO.md).

A narrated screen recording of that same run exists (`tooling/video/demo-video.mp4`, ~3½ minutes); the hosted copy is pending.

## Before a real pilot

A shadow-mode pilot needs, at minimum:

1. The tenant's **real** procedures (not the fictional demo corpus), passing the contradiction check.
2. **Threshold calibration** on that tenant's own traffic — the shipped 0.18 is a prototype default.
3. **Monitoring** — escalation rate, unsafe answers, retrieval speed, per language.
4. A **rollback** plan — how to pull the assistant and revert to the human queue.
5. **Consent and data handling** — who can read escalation evidence, retention limits.
6. **A named owner** for every escalation.

Nothing in this repository has been through any of the six.

## Related work

- [Portfolio and wider work](https://github.com/Hatemshalaby15071979)

## Author

Built by Hatem Shalaby — Contact Centre Operations & AI Implementation Lead (WFM & CX transformation).

## Licence

MIT
