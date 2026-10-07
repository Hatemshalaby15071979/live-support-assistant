# Prereg — G9: exclude `@sop/mobile` from the workspace install

**Zone.** Y (dropping or vendoring the unbuilt mobile package — V2 §2.2).
**Date.** 2026-10-06.
**Status.** registered before the run. Immutable after the run; a later change of rule
requires a new prereg and this one marked `superseded`.

> **Annotation added after the run (2026-10-07) — the rule above is unchanged.**
> **Outcome: ACCEPTED.** All three accept conditions met: `pnpm run verify` 8/8 green;
> `pnpm run audit` exits 0; the baselined advisory set went 3 → 0.
> A fourth advisory (`GHSA-wq5f-xc86-pv6w`, sharp, high) appeared in the audit during the
> measurement. It was published to the advisory database on 2026-10-06 and is not a
> consequence of this change — `sharp` resolves to 0.35.4 both before and after. It was
> handled separately as a Zone G patch bump (`sharp: 0.35.5`). Full result:
> `docs/program/DECISIONS.md`, 2026-10-07.

---

## Hypothesis

`@sop/mobile` is a shell that has never been built or packaged, and no shipped path
depends on it. Excluding it from the pnpm workspace removes the dependency subtree that
carries the repository's entire remaining accepted-advisory set, without changing any
verified behaviour.

## Why this is worth running

The owner's dependency pass on 2026-10-06 (`c9de5a2`) cleared 36 of 39 advisories and
baselined three. All three baselined entries are recorded as reachable **only** through
`apps/mobile`:

| Advisory | Severity | Path recorded in `tooling/audit-baseline.json` |
| --- | --- | --- |
| `GHSA-86w9-cpqp-85rv` (node-forge) | high | Expo/Sentry toolchain in `apps/mobile` |
| `GHSA-vfj7-8cjw-p6xm` (braces) | high | `micromatch` → jest-message-util, jscodeshift, metro-file-map, fast-glob — build tooling |
| `GHSA-hp3w-g68c-fv3c` (sprintf-js) | moderate | `js-yaml` → `@expo/cli` → `expo` → `@sop/mobile` |

If that record is accurate, excluding the package removes all three and `pnpm run audit`
runs with an empty baseline — D11 met with no expiring exception and no owner sign-off
needed on a High residual risk.

## Metric

1. The advisory ids present in `tooling/audit-baseline.json` after the change.
2. `pnpm run audit` exit status.
3. `pnpm run verify` exit status and its eight suite verdicts.

## Dataset and split

Not applicable — this is a dependency-graph change, not a measurement on data. The
"dataset" is the resolved lockfile.

## Margin band, seeds

Not applicable.

## Pre-conditions to check before the run

- No file under `apps/web/src`, `packages/*/src`, `tooling/**`, or `supabase/**` imports
  from `apps/mobile`. Checked by name, not by assumption.
- `apps/mobile` appears in no CI job that gates a shipped artifact.

## Change under test

Exclude `apps/mobile` from `pnpm-workspace.yaml`. The package directory is **kept** — only
its membership of the workspace install is withdrawn, so the shell remains for a future
mobile phase and the change is reversible by one line.

```
packages:
  - "apps/*"
  - "!apps/mobile"
  - "packages/*"
```

## Accept rule

All three must hold:

1. `pnpm run verify` exits 0 with every suite verdict green.
2. `pnpm run audit` exits 0.
3. The baselined advisory set is **strictly smaller** than three entries, or empty.

## Reject rule

Any of these rejects the change, and the branch is kept with the result logged:

1. Any `pnpm run verify` suite fails or changes verdict.
2. `pnpm run audit` fails.
3. The baseline does not shrink — meaning the advisories arrive by another path and the
   hypothesis was wrong.
4. Any shipped path is found to depend on `apps/mobile`.

## What is published either way

- Accepted: `docs/program/DECISIONS.md` entry, `docs/BASELINE.md` updated with the new
  baseline state, and `docs/KNOWN_ISSUES.md` §9 rewritten to record that the advisory set
  is cleared by exclusion rather than accepted as residual risk.
- Rejected: an entry in the rejected-experiment register naming which accept condition
  failed, with the observed values. A rejected result here is a real finding: it would mean
  the three advisories are reachable from a shipped path after all.

## Rollback

Revert the single line in `pnpm-workspace.yaml` and re-run `pnpm install`. No other file
changes, so there is nothing else to undo.
