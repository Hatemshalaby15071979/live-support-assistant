#!/usr/bin/env python3
"""Record why GHSA-vfj7-8cjw-p6xm is baselined, in tooling/audit-baseline.json.

The baseline maps advisory id -> severity and has no per-entry comment field, so
the justification goes in the top-level `note`, which is the only prose the
schema carries. The alternative -- a bare added entry -- is exactly the silent
suppression the gate's own docstring says it exists to prevent.

Rewrites the JSON with 2-space indent and a trailing newline, preserving key
order (note first, then advisories).
"""

from __future__ import annotations

import json
import pathlib
import sys

BASELINE = pathlib.Path(__file__).resolve().parents[1] / "tooling" / "audit-baseline.json"

ADVISORY = "GHSA-vfj7-8cjw-p6xm"

NOTE = (
    "Committed by `pnpm run audit:update`. See tooling/audit-gate.mjs.\n\n"
    f"`{ADVISORY}` (CVE-2026-93687, braces <= 3.0.3, high) was baselined "
    "2026-10-05 on purpose and cannot be upgraded away:\n\n"
    "- **No patched version exists.** The advisory lists patched versions: None, "
    "and the affected range is <= 3.0.3, which is the version already resolved "
    "here. There is no version to move to, so `pnpm update` cannot clear it and "
    "the gate would stay red indefinitely.\n"
    "- **Not runtime-reachable.** braces arrives only through build-time "
    "tooling: micromatch 4.0.8 -> jest-message-util, jscodeshift, "
    "metro-file-map, fast-glob. Nothing in a served request path imports it.\n"
    "- **Low practical risk.** The defect is stack exhaustion from a "
    "deeply-nested glob pattern supplied by an attacker (CWE-674, "
    "uncontrolled recursion). Exploiting it requires the attacker to control a "
    "glob pattern that this project does not accept from untrusted input. "
    "CVSS 8.7, EPSS 0.74%.\n\n"
    "Baselining keeps the advisory visible and tracked: it is counted, it is "
    "reported by `pnpm run audit`, and the gate still fails on anything new or "
    "anything escalated. Revisit when upstream publishes a fixed braces "
    "release -- at that point remove this note and the entry together, and the "
    "gate will hold the improvement without a code change. Suppressing it "
    "silently instead would have been the failure mode this file was written "
    "to avoid."
)


def main() -> int:
    if not BASELINE.exists():
        print(f"error: {BASELINE} not found", file=sys.stderr)
        return 1

    data = json.loads(BASELINE.read_text(encoding="utf-8"))
    advisories = data.get("advisories", {})

    if ADVISORY not in advisories:
        print(f"error: {ADVISORY} is not in the baseline. Run "
              f"`node tooling/audit-gate.mjs --update` first.", file=sys.stderr)
        return 1

    if data.get("note") == NOTE:
        print("note already up to date; nothing written")
        return 0

    before = len(data.get("note", ""))
    data["note"] = NOTE

    ordered = {"note": data["note"], "advisories": advisories}
    BASELINE.write_text(json.dumps(ordered, indent=2) + "\n",
                        encoding="utf-8", newline="\n")

    print(f"note updated: {before} -> {len(NOTE)} chars")
    print(f"advisories recorded: {len(advisories)}")
    print(f"{ADVISORY} severity: {advisories[ADVISORY]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())