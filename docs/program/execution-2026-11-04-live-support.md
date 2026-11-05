# LIVE Support Assistant local readiness execution — 2026-11-04

## Verdict

**NOT READY for a customer-facing or production pilot.** This run verified the local code gates
and exposed a reproducible tenant-claim isolation failure. It did not exercise an authenticated
application flow or rerun the model against the complete ticket batch. The strongest evidence is
the local PostgreSQL result: **7 of 7** claim-override probes returned **3 rows** from the other
tenant across 1,475 fleet probes. The database wrapper exits 0 because this specific F-1 red is
accepted and documented; it is not an isolation pass.

## Scope and safeguards

- Repository: `live-support-assistant`, branch `prog/main`, starting commit
  `047bdd62c8f07b4be21154edb15dd91a0be6677b`; worktree was clean before this documentation update.
- All evaluation fixtures used here are explicitly simulated. No live/customer data was used.
- No hosted project, deployment, external service, or credential was accessed.
- `verify:db` used a fresh container named `sop-prompt1-20261104` with the locally cached
  `postgres:17-alpine` image and synthetic SQL fixtures. The exact container was removed after
  the run.
- Chrome is installed at `/usr/bin/google-chrome`. `.env.local` is absent and `SUPABASE_URL` is
  unset, so authenticated browser and hosted transport checks were not run.

## Measured commands

| Command | Result | What it proves / does not prove |
| --- | --- | --- |
| `pnpm run typecheck` | Pass; Turbo reported 9 tasks successful | Workspace typecheck only |
| `pnpm run verify` | Pass; 17/17 suites | Existing harness gate; several reported paths are unit or harness-level, not a hosted tenant workflow |
| `pnpm run evidence` | Pass; 12 claims verified, 0 mismatch, 0 unverifiable | Registered claims reproduce from their referenced artifacts; no new model inference was performed |
| `pnpm run audit` | Pass; 0 production advisories, 0 new, 0 escalated | Current dependency-gate result |
| `pnpm run build:node` | Pass; 5 tasks successful | Node-targeted build; Vite reported a chunk-size warning for a 539.21 kB chunk |
| `pnpm run lint` | Completed; 0 errors, 1 warning | Existing warning at `apps/web/src/App.tsx:436`: missing `servingModel.id` and `.revision` dependencies |
| `pnpm run test` | Command exited 0, but no package `test` scripts exist | Not evidence of a test suite; `verify` is the available harness gate |
| `node tooling/eval/simulated-tenant/verify-tickets.mjs tooling/eval/simulated-tenant/chaos-500.json` | Pass; 500 tickets, 75 chaos, 10 chaos types, 0 email/phone pattern findings | Synthetic fixture shape checks only; not anonymization certification or query evaluation |
| `CONTAINER=sop-prompt1-20261104 PORT=55433 DB=sop_prompt1 pnpm run verify:db` | Exit 0; 5 of 6 suites report OK, fleet suite accepted red | 1,475 fleet probes, 0 vacuous; 7 `claim override capability` failures (`rows:3`); anonymous-role coverage unproven |
| Offline `createEmbedder(..., { cacheDir: ".cache/transformers", allowRemoteModels: false })` probe | Failed with `TypeError: this.tokenizer is not a function` during `embedQuery` | No full 500-ticket inference result from this run |

`pnpm run test` resolves to `turbo run test --filter=!@sop/desktop`; the package manifests contain
no `test` scripts, so its successful exit must not be presented as unit-test coverage.

## Synthetic data provenance and repeatability

The pinned WaveCast support batch and its simulated SOP corpus passed the fixture validator:

| Input | SHA-256 |
| --- | --- |
| `tooling/eval/simulated-tenant/chaos-500.json` | `717c40dcc7d1f31b51ea32b0b1bfa4bf418699167a5c5c7e2736cbea90191d96` |
| `tooling/eval/simulated-tenant/corpus.json` | `e9e058685d255b24219ed5aab2ede0eaf62542eda9844b9b7b26becec63546fe` |
| Existing independent-holdout result: `phase5-holdout-seed-20260929-margin-018.json` | `5cd2253f5301bc3693537148cdd4fb9fd7efa5f5e6931fe7913b2a3004d9799f` |

Two regenerations with `--count 500 --chaos-rate 0.15 --seed 20260928` were byte-identical to
each other (`2baecc0bb1e1215e5bb740478f34ad167ebe56ab36df74f95a888fb606083467`). They did **not**
match the checked-in fixture hash. The existing pinned fixture is retained unchanged; the
generator/fixture version mismatch is open and neither generated output replaces the historical
dataset.

This fixture describes one fictional tenant, WaveCast Creator Care. The existing multi-tenant
corpus harness uses public-source corpora and is not a second synthetic customer. A two-tenant
synthetic app workflow was not established.

The existing evidence verifier reported the previously registered result for the 500-ticket
batch at margin 0.17 as 362/500 correct, 138 false escalations, and 0 unsafe answers, and for
holdout seed `20260929` at margin 0.18 as 359/500 correct, 141 false escalations, and 0 unsafe
answers. These are **historical artifact-backed observations** verified by `pnpm run evidence`,
not a fresh model rerun in this execution. Other registered historical artifacts include
6/52 public-source refusal false accepts and a scale-rung unsafe answer at margin 0.17; see the
machine-readable record and the cited files. None is a production-customer result.

## Open blockers

1. **Tenant isolation:** seven reproducible local F-1 claim-override reads remain accepted under
   the existing owner decision. This must not be described as database-level tenant isolation.
2. **Local anonymous database coverage:** the local PostgreSQL image lacks the `anon` role, so this
   local run did not exercise it. The owner decision record says the hosted `anon` coverage
   condition was satisfied on 2026-10-08 (`docs/program/DECISIONS.md`, OQ-012); that historical
   proof was not refreshed in this execution.
3. **Authenticated app workflow:** no `.env.local` or Supabase URL is present. No sign-in, bundle,
   query, telemetry, escalation, or cross-tenant UI workflow was tested.
4. **Fresh model evaluation at the time of this run:** the initial offline Node embedder probe
   failed and no full batch was run. See the 2026-11-05 continuation below for the fresh offline
   full/holdout inference that supersedes this limitation.
5. **Multi-tenant synthetic coverage:** the support-ticket fixture covers one fictional tenant.
   The 2026-11-05 continuation adds a separate synthetic tenant to a local decision-path evaluation;
   this is not an authenticated end-to-end application path.
6. **Generator provenance:** the current generator reproduces itself but does not reproduce the
   pinned 500-ticket fixture byte-for-byte.
7. **Remaining readiness phases:** P3, P4, P6, and P7 remain incomplete; P5 has open isolation
   evidence and P8 is not closed by the current claim-verifier pass.

## Reproduction

From the repository root:

```bash
pnpm run typecheck
pnpm run verify
pnpm run evidence
pnpm run audit
pnpm run build:node
pnpm run lint
node tooling/eval/simulated-tenant/verify-tickets.mjs tooling/eval/simulated-tenant/chaos-500.json
CONTAINER=sop-prompt1-20261104 PORT=55433 DB=sop_prompt1 pnpm run verify:db
sha256sum -c docs/program/evidence/live-support-execution-2026-11-04.sha256
```

The database command creates/reuses the named container and recreates its named database. The
execution container used here was new and was removed after the drill. Do not run this command
against an existing container without first confirming it is disposable.

The full machine-readable results and source hashes are in
[`evidence/live-support-execution-2026-11-04.json`](./evidence/live-support-execution-2026-11-04.json).

## Continuation — offline embedder and F-1 governance check

The offline model failure was traced to Transformers.js 4.3.0's file-cache lookup: the
present cache has a complete pinned model directory (`<cache>/<model>/<revision>/...`), but
passing only `cacheDir` does not load it as a local model. The pipeline consequently returned
an extractor with a null tokenizer. `createEmbedder` now accepts an explicit `modelPath`
without changing the public model identity/revision. The new
`tooling/eval/verify-offline-embedder.mjs` smoke check loads that pinned cache with remote
downloads disabled and requires a finite 384-dimensional vector.

Verified:

| Command | Result |
| --- | --- |
| `pnpm --filter @sop/embedder build` | Pass |
| `node tooling/eval/verify-offline-embedder.mjs` | `OFFLINE EMBEDDER OK` for MiniLM revision `751bff37182d3f1213fa05d7196b954e230abad9`, 384 finite dimensions |
| `pnpm run typecheck && pnpm run verify && pnpm run evidence && pnpm run audit && pnpm run build:node && pnpm run lint` | Exit 0; existing lint warning and build chunk warning remain as above |
| `node tooling/eval/simulated-tenant/verify-tickets.mjs tooling/eval/simulated-tenant/chaos-500.json` | Pass; fixture unchanged, hash `717c40dcc7d1f31b51ea32b0b1bfa4bf418699167a5c5c7e2736cbea90191d96` |
| `CONTAINER=sop-prompt1-continuation-20261104 PORT=55434 DB=sop_prompt1 pnpm run verify:db` | Exit 0; existing acceptance remains exactly 7 F-1 failures; the newly created local container was removed |

This closes only model initialization for a local single-query smoke. It does **not** amount
to fresh 500-ticket inference; the browser-based evaluation runner and the authenticated product
flow have not been run.

### F-1 decision boundary

The local migration question was evaluated against the current owner record before changing any
SQL. A structural trust-anchor snapshot resembles option C in
`SECURITY_FINDING_F1_claim_override.md` §4, but that same record explicitly says no database
fix is applied and defers C until a caller-text SQL-capable RPC is introduced. Its four
acceptance conditions also require the seven probes to stay red. No evidence that this trigger
has occurred was found in the execution record, and local vanilla PostgreSQL cannot prove the
Supabase request-hook lifecycle. Therefore adding a migration or turning the seven negative
controls green here would contradict the active owner decision and would not establish deployment
behavior. The migration and probe expectation were left unchanged. The owner record documents
hosted `anon` coverage as met on 2026-10-08; no fresh hosted run was authorized or performed here.
The plain-English owner re-confirmation remains pending, so F-1 cannot be treated as newly closed.

At the time of the 2026-11-04 run, the existing database fixture was the only two-tenant
synthetic coverage; it is not a two-tenant end-to-end product flow. No second synthetic support
batch or authenticated local app backend was available then. The 2026-11-05 continuation below
adds a second tenant for local decision-path inference only; no authenticated local app backend,
credentials, or hosted service were used.

## Continuation — fresh offline inference and second synthetic tenant — 2026-11-05

The Node embedder path now loads the pinned model from the repository cache with remote model
loading disabled. `tooling/eval/run-local-synthetic-evaluation.mjs` runs the existing 500-ticket
WaveCast full batch and independent holdout through the local MiniLM → cosine retrieval →
confidence gate → agent-view path, then evaluates two deterministic 50-ticket splits for a second,
fictional Cedar Grove Online School tenant. The second tenant's corpus and inputs are generated
from fixed source text and seeds in the runner; its batch and corpus hashes are included in the
result. All data is visibly tagged `simulated`.

| Tenant / split | Tickets | Correct | Accuracy | False escalations | Unsafe answers | Runtime errors |
|---|---:|---:|---:|---:|---:|---:|
| WaveCast / full | 500 | 354 | 70.8% | 145 | 1 | 0 |
| WaveCast / holdout | 500 | 370 | 74.0% | 128 | 2 | 0 |
| Cedar Grove / full | 50 | 26 | 52.0% | 24 | 0 | 0 |
| Cedar Grove / holdout | 50 | 23 | 46.0% | 27 | 0 | 0 |

This is a fresh local inference observation, not an app/tenant-isolation test or production result.
The low Cedar Grove accuracy and high false-escalation rate are retained as negative evidence;
the fictional corpus was not tuned after seeing the results. The historical 2026-11-04 run's
metrics remain separately dated and must not be conflated with these fresh results.

Evidence: `docs/program/evidence/live-support-local-eval-2026-11-05/local-inference-results.json`.
Run from the repository root with:

```bash
node tooling/eval/run-local-synthetic-evaluation.mjs
```

The runner refuses untagged inputs, uses the pinned model revision with
`allowRemoteModels: false`, records hashes of all batch/corpus inputs and of the runner, and fails
on runtime inference errors. The model was loaded from the checked-in local cache. No hosted
service, credentials, or customer data were used.

### F-1 boundary reaffirmed

The 2026-10-08 owner decision remains the authority: F-1 is accepted on conditions, its tripwire
and seven expected-red probes stay unchanged, and the plain-English owner re-confirmation remains
pending in `docs/program/OWNER_QUEUE.md`. This execution made no SQL, migration, severity,
acceptance, or probe-expectation changes. The current local PostgreSQL image still does not expose
the hosted `anon` role; this does not negate the owner-recorded 2026-10-08 hosted coverage, but
that prior evidence was not re-run here. No readiness phase is closed by this continuation.
