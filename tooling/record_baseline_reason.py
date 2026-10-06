#!/usr/bin/env python3
"""Record why newly baselined advisories are baselined, in audit-baseline.json.

The baseline maps advisory id -> severity and has no per-entry comment field, so
the justification goes in the top-level `note`, which is the only prose the
schema carries. A bare added entry is exactly the silent suppression the gate's
own docstring says it exists to prevent.

Existing reasoning for earlier advisories is preserved: the note is extended, not
rewritten, so a future run still explains why the braces advisory is tolerated.

Usage:
    python tooling/record_baseline_reason.py GHSA-xxxx-xxxx-xxxx "<reason text>"
"""

from __future__ import annotations

import json
import pathlib
import sys

BASELINE = pathlib.Path(__file__).resolve().parents[1] / "tooling" / "audit-baseline.json"


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__, file=sys.stderr)
        return 2

    advisory, reason = sys.argv[1], sys.argv[2].strip()
    data = json.loads(BASELINE.read_text(encoding="utf-8"))
    advisories = data.get("advisories", {})

    if advisory not in advisories:
        print(f"error: {advisory} is not in the baseline. Run "
              f"`node tooling/audit-gate.mjs --update` first.", file=sys.stderr)
        return 1

    note = data.get("note", "")
    heading = f"`{advisory}` ({advisories[advisory]})"
    if heading in note:
        print(f"{advisory} is already recorded in the note; nothing written")
        return 0

    block = f"\n\n{heading} was baselined {sys.argv[3] if len(sys.argv) > 3 else ''}".rstrip()
    block += f" and cannot be upgraded away:\n\n{reason}\n"

    data["note"] = note.rstrip("\n") + block
    ordered = {"note": data["note"], "advisories": advisories}
    BASELINE.write_text(json.dumps(ordered, indent=2) + "\n",
                        encoding="utf-8", newline="\n")

    print(f"note extended for {advisory} (severity {advisories[advisory]})")
    print(f"note is now {len(data['note'])} chars; {len(advisories)} advisories recorded")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())