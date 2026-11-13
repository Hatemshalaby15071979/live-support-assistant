# History provenance and branch policy (ME-14)

This note records what the Git history can and cannot tell you. It is an
observation, not an excuse: the history was produced by an agent-driven
workflow, and its dates and commit messages must not be read as a
human-verified development timeline.

## What the history actually shows

Measured with `git log --all --format='%ad' --date=short` on 2026-11-13:

- Earliest author date: **2026-08-27**. The GitHub account that owns these
  repositories was created on **2026-10-29**, and the repositories on
  **2026-11-04**. Commit author dates therefore predate the account that
  authored them; they are not wall-clock records of when work happened.
- Latest author date at measurement: 2026-11-13.
- Busiest single day: **69 commits on 2026-10-07**.
- **28** commit messages contain a `[gate: … pass]` self-assertion. These are
  the authoring agent's claim at the time, not evidence. The evidence is the
  gate output recorded in `docs/program/` or re-run by CI; a commit message
  saying "pass" proves nothing and must never be cited as a result.

## What this means

- Do not reconstruct a development timeline from commit dates.
- Do not cite a `[gate: … pass]` message as verification. Re-run the gate.
- History rewriting would require the owner's G2 authorisation and is not
  performed by this change.

## Branch policy

- **Default and integration branch: `prog/main`.** There is no `main` or
  `master` branch; do not assume one exists.
- `.github/workflows/ci.yml` triggers `push` only on `prog/**` and runs on
  every `pull_request` target, so a phase branch is verified by its PR even
  though its push does not trigger CI.
- Tools and workflows that need a base branch must name `prog/main`
  explicitly rather than relying on the remote default.

## CI note

The CI workflow header states the same branch policy and the rule that a
commit message is not a verification result.
