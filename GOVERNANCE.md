# GOVERNANCE.md — Operating Policy & Repo Map for LIVE Support Assistant

> Companion to [`CONSTITUTION.md`](CONSTITUTION.md), [`Hatem_specific.md`](Hatem_specific.md),
> and [`AGENTS.md`](AGENTS.md). Read all four before acting. This file may be updated by any
> agent **as a logged governance change**; `CONSTITUTION.md` is owner-only across the portfolio.

## 1. Repository map

| Path | Purpose (one line) |
|---|---|
| `apps/web/` | React 19 + Vite web client (`@sop/web`) — the prototype UI. |
| `apps/desktop/` | Tauri desktop shell (`@sop/desktop`) wrapping the web bundle. |
| `apps/mobile/` | Expo / React Native mobile shell (`@sop/mobile`). |
| `packages/core/` | `@sop/core` — domain types, Confidence Gate, and margin scoring. |
| `packages/embedder/` | `@sop/embedder` — pinned local MiniLM embedder (transformers.js, ONNX). |
| `packages/vector-store/` | `@sop/vector-store` — passage extraction and cosine retrieval. |
| `packages/sync/` | `@sop/sync` — encrypted bundle protocol, install pipeline, and publish client. |
| `supabase/` | Postgres migrations, seed fixtures, edge functions, and RLS/RBAC SQL suites. |
| `tooling/` | Verification gate (`run-verification.mjs`), evidence verifier, dependency audit, secret-history scanner, evaluation harnesses, and video tooling. |
| `scripts/` | Portfolio root-document gate (`check_root_docs.py`). |
| `docs/` | System design, evidence, threat model, known issues, local `00_CONSTITUTION.md`, and `docs/program/` / `docs/archive/`. |
| `.github/workflows/` | `ci.yml` — `workspace`, `database`, `desktop`, `audit`, and `governance` jobs on `prog/**` pushes and pull requests. |

The product runs procedure retrieval and confidence gating locally on the client device against
a tenant's signed procedure bundle. It is a pre-production prototype, not a production service.

## 2. Documentation policy (what belongs where)

**Root holds only the requested set** — nothing else:

| File | State | Purpose |
|---|---|---|
| `README.md` | required | Single source of truth for readers: what the app is, honest measured limits, demo steps, and pilot prerequisites. Carries the Helix Solutions logo. |
| `AGENTS.md` | required | Agent charter, standing branch/push rules, and the chronological build ledger. |
| `CONSTITUTION.md` | required | Portfolio-wide engineering philosophy and clean-code policy (owner-only). Project-specific operational rules remain in [`docs/00_CONSTITUTION.md`](docs/00_CONSTITUTION.md). |
| `GOVERNANCE.md` | required | This file: repo map, documentation policy, status-truth policy, archiving rules. |
| `Hatem_specific.md` | required | Portable owner rules enforced at the root by `tooling/verify-agent-skill.mjs` inside `pnpm run verify`. Moving it would break the CI verification gate, so it stays at the root. |
| `CHANGELOG.md` | standard | Dated, user-visible changes. |
| `LICENSE` / `LICENSE.md` | standard | MIT. |
| `SECURITY.md` | standard | Security policy, honest support status, and reporting instructions. |

**Everything else lives in `docs/`** — system design, threat models, ADRs, program logs,
proof-of-concept writeups, and dated readiness snapshots (`docs/archive/`). No stray
`.md`/`.txt` at the root. If a document at the root is not in the table above, move it to
`docs/` (or `docs/archive/` if it is historical) and record the move in `AGENTS.md`.

## 3. Status truth policy

`README.md`'s "Current status — read this first" and "What the measurements honestly show"
sections are the single source of truth for project status. Headline figures are backed by
`docs/EVIDENCE.md` and `tooling/evidence/verify-claims.mjs`.

A green CI run on `prog/main` proves the workspace build, 17-suite local verification gate,
Docker database suite (with documented F-1 boundaries), desktop compile, dependency audit, and
root-document gate passed on that commit. It does not prove production readiness, per-tenant
threshold calibration, or external security acceptance.

## 4. Archiving rule

- Archive (move to `docs/archive/`), never delete: historical reports, dated readiness snapshots,
  superseded plans, and one-off execution logs.
- Delete outright only regenerable artifacts: `node_modules/`, `dist/`, `.turbo/`, caches, and
  derived media outputs.
