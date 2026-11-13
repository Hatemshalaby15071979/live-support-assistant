#!/usr/bin/env bash
#
# Phase 7 verification.
#
# Brings up a throwaway PostgreSQL, applies ALL migrations, seeds fixtures, and
# runs every database suite in one session. Step 0 is an offline lint of the suite
# files (dollar-quote pairing), so a malformed suite fails without booting the database:
#
#   0. lint-sql-suites.mjs   — every suite file parses (delimiters paired, no psql var in a body)
#   1. rbac_matrix.sql       — the privilege matrix (99 probes)
#   2. phase5_telemetry.sql  — ingest contracts + dashboards (17 probes)
#   3. rls_bypass.sql        — the attack suite (40 probes)
#   4. rls_bypass_fleet.sql  — the same guarantee at fleet scale (>1,000 probes, negative controls)
#   5. phase8_retention.sql  — retention removes expired data, redacts escalations, stays closed
#   6. rls_surface_audit.sql — no callable function builds SQL (the F-1 compensating control)
#   7. hi04_device_ownership.sql — HI-04 regression: bundle_for_device scopes to auth.uid(), not just tenant
#
# THE FLEET SUITE IS AN ACCEPTED RED (finding F-1, accepted 2026-10-08 as option D).
# Suite 4 is EXPECTED to report `RLS BYPASS FLEET FAILED`, with exactly 7 failures — the
# `claim override capability` probes. A green fleet suite is a REGRESSION, not a success.
# The gate does not take that on trust: `fleet_acceptance_check` reads the suite's own
# `fleet_results` table and requires the failure set to match the documented F-1 identity
# EXACTLY. The suite emits EIGHT sections; every one must be present, and every one except the
# accepted `claim override capability` must have zero failures — including `object existence`.
# Any deviation fails the phase. The acceptance lives in
# docs/SECURITY_FINDING_F1_claim_override.md §8 and docs/program/DECISIONS.md (2026-10-08);
# the gate refuses to accept the red if that record no longer says ACCEPTED.
#
# anon coverage is UNPROVEN LOCALLY (no `anon` role on this stack). That is an evidence
# limitation, not a failure: this gate may pass locally with it, but P5 is not complete
# until a hosted run proves the coverage (F-1 record §8 condition 3, OQ-012).
#
# The database is dropped and recreated on every run, so the result is
# reproducible from an empty cluster and cannot pass because of leftover state.
#
# Usage:
#   bash tooling/db/verify-phase7.sh

set -euo pipefail

CONTAINER="${CONTAINER:-sop-pg-test}"
IMAGE="${IMAGE:-postgres:17-alpine}"
PORT="${PORT:-55432}"
DB="${DB:-sop}"

# --------------------------------------------------------------- F-1 acceptance ---
# The accepted failure identity. These are NOT a magic number: they mirror the conditions
# recorded in docs/SECURITY_FINDING_F1_claim_override.md §8, and `f1_record_guard` refuses
# to accept the red if that record stops carrying the decision.
#
# F1_RECORD is a FIXED path and is deliberately NOT overridable from the environment: a security
# gate must not let its acceptance authority be redirected by an env var. The record is governance,
# not test configuration. Dry-runs vary the record by running this script from a throwaway repo root.
F1_RECORD="docs/SECURITY_FINDING_F1_claim_override.md"
F1_REVIEW_DATE="2027-01-06"
FLEET_SECTION="claim override capability"
FLEET_OPERATION="override claim then read"
FLEET_OBJECT="sops"
FLEET_OBSERVED_RE='^rows:[1-9]'
FLEET_ACCEPTED_COUNT=7
FLEET_MIN_PROBES=1000
# The complete section vocabulary the fleet suite emits, listed ONCE so the allowed set, the
# required-present set and the required-clean set cannot drift apart. Taken from the suite, not
# from memory: section 0b ("existence assertion") emits `object existence`, and an earlier version
# of this list omitted it, so the wrapper misread its 17 passing probes as an unexpected section.
FLEET_SECTIONS=(
  "anonymous"
  "claim override capability"
  "claim-shape forgery"
  "cross-tenant read"
  "cross-tenant write"
  "key and threshold ledger"
  "object existence"
  "positive control"
)
# Derived: every known section, SQL-quoted — a row from anywhere else is unexpected.
FLEET_KNOWN_SECTIONS="$(printf "'%s'," "${FLEET_SECTIONS[@]}")"
FLEET_KNOWN_SECTIONS="${FLEET_KNOWN_SECTIONS%,}"
# Derived: every section that must have ZERO failures — all of them except the accepted one.
FLEET_CLEAN_SECTIONS=""
for _section in "${FLEET_SECTIONS[@]}"; do
  if [ "$_section" = "$FLEET_SECTION" ]; then
    continue
  fi
  FLEET_CLEAN_SECTIONS="${FLEET_CLEAN_SECTIONS:+$FLEET_CLEAN_SECTIONS,}'$_section'"
done
unset _section

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

# Offline lint before touching the database: a malformed suite should fail in milliseconds,
# not after a container boot. This guards the truncated dollar-quoted block that shipped once
# and silently skipped the test-harness revoke, leaving harness functions callable.
echo "==> [0/6] offline lint: the SQL suites parse"
node tooling/db/lint-sql-suites.mjs

echo "==> ensuring container '$CONTAINER'"
if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  docker run -d --name "$CONTAINER" \
    -e POSTGRES_PASSWORD=postgres \
    -e POSTGRES_DB="$DB" \
    -p "${PORT}:5432" \
    "$IMAGE" >/dev/null
  echo "    created from $IMAGE"
else
  docker start "$CONTAINER" >/dev/null 2>&1 || true
  echo "    reusing existing container"
fi

echo "==> waiting for the server to accept connections"
ready="no"
for attempt in $(seq 1 60); do
  if docker exec "$CONTAINER" psql -U postgres -d postgres -c 'select 1' >/dev/null 2>&1; then
    echo "    ready after ${attempt} attempt(s)"
    ready="yes"
    break
  fi
  sleep 2
done

if [ "$ready" != "yes" ]; then
  echo "    server did not become ready" >&2
  exit 1
fi

echo "==> recreating database '$DB' from empty"
docker exec "$CONTAINER" psql -U postgres -d postgres -q \
  -c "drop database if exists $DB with (force)" \
  -c "create database $DB"

echo "==> applying migrations"
for file in supabase/migrations/*.sql; do
  docker exec -i "$CONTAINER" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q -f - < "$file"
  echo "    $(basename "$file")"
done

echo "==> seeding fixtures"
docker exec -i "$CONTAINER" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q -f - \
  < supabase/seed/0001_fixtures.sql
echo "    applied"

status=0
anon_state="unknown"

run_suite() {
  local file="$1"
  local verdict="$2"
  echo ""
  echo "==> running $file"
  set +e
  output="$(docker exec -i "$CONTAINER" psql -U postgres -d "$DB" -f - < "$file" 2>&1)"
  suite_status=$?
  set -e

  # Print every `=== section ===` block and its table, not just the first 40 lines: a suite whose
  # diagnostics run long was being truncated mid-table, which read as a missing section. psql
  # errors go to stderr so a parse failure is distinguishable from a failing assertion.
  printf '%s\n' "$output" | awk '/=== .* ===/{show=1} show'
  printf '%s\n' "$output" | grep -E '^(psql|ERROR)' >&2 || true

  if [ $suite_status -ne 0 ]; then
    echo "psql exited with status $suite_status for $file" >&2
    status=1
    return
  fi

  if printf '%s' "$output" | grep -q "$verdict"; then
    return
  fi

  # Distinguish "the suite reported its opposite" from "the suite never reported at all".
  local opposite="${verdict% OK} FAILED"
  if printf '%s' "$output" | grep -q "$opposite"; then
    echo "$file REPORTED FAILURE: '$opposite'" >&2
  else
    echo "$file DID NOT REPORT '$verdict' (and did not report '$opposite' either)" >&2
  fi
  status=1
}

is_number() { case "${1:-}" in '' | *[!0-9]*) return 1 ;; *) return 0 ;; esac; }

# One scalar out of the fleet suite's own results table. `|| true` keeps a failed query from
# tripping `set -e` before `is_number` can report it.
fleet_count() {  # predicate
  docker exec -i "$CONTAINER" psql -U postgres -d "$DB" -At -c \
    "select count(*) from fleet_results where $1;" 2>/dev/null | tr -d '[:space:]' || true
}

# One text value out of the suite's table. Only CR/LF are stripped: section labels contain spaces.
fleet_scalar() {  # sql returning a single value
  docker exec -i "$CONTAINER" psql -U postgres -d "$DB" -At -c "$1" 2>/dev/null | tr -d '\r\n' || true
}

# The acceptance must not outlive the record that justifies it.
f1_record_guard() {
  if [ ! -f "$F1_RECORD" ]; then
    echo "    FLEET ACCEPTANCE FAILED: the F-1 record is missing ($F1_RECORD)." >&2
    return 1
  fi
  if ! grep -qE 'ACCEPTED.*option D' "$F1_RECORD"; then
    echo "    FLEET ACCEPTANCE FAILED: $F1_RECORD no longer says ACCEPTED (option D)." >&2
    echo "      The accepted red must not outlive its record — re-decide, or restore the record." >&2
    return 1
  fi
  if ! grep -q "$F1_REVIEW_DATE" "$F1_RECORD"; then
    echo "    FLEET ACCEPTANCE FAILED: $F1_RECORD no longer carries the review date $F1_REVIEW_DATE." >&2
    return 1
  fi
  return 0
}

# The whole accepted-red decision. Every condition is an equality against the documented
# expectation, so an unexamined state can never yield a pass.
fleet_acceptance_check() {
  local fails=0
  local probes total accepted other clean missing unknown vacuous obj_failed absent_sections

  probes=$(fleet_count "true")
  total=$(fleet_count "not ok")
  accepted=$(fleet_count "not ok and section = '$FLEET_SECTION' and operation = '$FLEET_OPERATION' and object_name = '$FLEET_OBJECT' and observed ~ '$FLEET_OBSERVED_RE'")
  other=$(fleet_count "not ok and not (section = '$FLEET_SECTION' and operation = '$FLEET_OPERATION' and object_name = '$FLEET_OBJECT' and observed ~ '$FLEET_OBSERVED_RE')")
  clean=$(fleet_count "not ok and section in ($FLEET_CLEAN_SECTIONS)")
  missing=$(fleet_count "not ok and observed = 'MISSING'")
  unknown=$(fleet_count "section not in ($FLEET_KNOWN_SECTIONS)")
  vacuous=$(fleet_count "observed = 'vacuous'")
  # `object existence` is required to be present AND clean, checked by name and not only via the list.
  obj_failed=$(fleet_count "not ok and section = 'object existence'")
  # Every known section must actually be emitted. A section that silently stops running must not pass.
  absent_sections=$(fleet_scalar "select coalesce(string_agg(s, ', ' order by s), '') from unnest(array[$FLEET_KNOWN_SECTIONS]) s where not exists (select 1 from fleet_results where section = s);")

  for v in "$probes" "$total" "$accepted" "$other" "$clean" "$missing" "$unknown" "$vacuous" "$obj_failed"; do
    if ! is_number "$v"; then
      echo "    FLEET ACCEPTANCE FAILED: could not read fleet_results (psql error, or the suite never populated it)." >&2
      return 1
    fi
  done

  if [ "$probes" -lt "$FLEET_MIN_PROBES" ]; then
    echo "    FLEET ACCEPTANCE FAILED: $probes probes, need >= $FLEET_MIN_PROBES." >&2
    fails=1
  fi
  if [ "$total" -ne "$FLEET_ACCEPTED_COUNT" ]; then
    echo "    FLEET ACCEPTANCE FAILED: $total failure(s); the accepted set is exactly $FLEET_ACCEPTED_COUNT." >&2
    fails=1
  fi
  if [ "$accepted" -ne "$FLEET_ACCEPTED_COUNT" ]; then
    echo "    FLEET ACCEPTANCE FAILED: only $accepted of $FLEET_ACCEPTED_COUNT failures carry the documented F-1 identity." >&2
    fails=1
  fi
  if [ "$other" -ne 0 ]; then
    echo "    FLEET ACCEPTANCE FAILED: $other failure(s) outside the documented F-1 identity." >&2
    fails=1
  fi
  if [ "$clean" -ne 0 ]; then
    echo "    FLEET ACCEPTANCE FAILED: $clean failure(s) in sections that must be clean ($FLEET_CLEAN_SECTIONS)." >&2
    fails=1
  fi
  if [ "$missing" -ne 0 ]; then
    echo "    FLEET ACCEPTANCE FAILED: $missing object-resolution failure(s) (observed = 'MISSING')." >&2
    fails=1
  fi
  if [ "$unknown" -ne 0 ]; then
    echo "    FLEET ACCEPTANCE FAILED: $unknown row(s) from an unexpected section." >&2
    fails=1
  fi
  if [ "$obj_failed" -ne 0 ]; then
    echo "    FLEET ACCEPTANCE FAILED: 'object existence' has $obj_failed failure(s); it must have zero." >&2
    fails=1
  fi
  if [ -n "$absent_sections" ]; then
    echo "    FLEET ACCEPTANCE FAILED: expected section(s) absent from fleet_results: $absent_sections" >&2
    fails=1
  fi
  if [ $(( vacuous * 10 )) -gt "$probes" ]; then
    echo "    FLEET ACCEPTANCE FAILED: $vacuous vacuous probe(s) exceed 10% of $probes — the fixture is too thin." >&2
    fails=1
  fi

  if [ "$fails" -ne 0 ]; then
    return 1
  fi

  echo "    RLS FLEET ACCEPTED RED — $accepted documented F-1 probes"
  echo "      identity: section='$FLEET_SECTION' · operation='$FLEET_OPERATION' · object='$FLEET_OBJECT' · observed ~ '$FLEET_OBSERVED_RE'"
  echo "      probes:   $probes (vacuous $vacuous)"
  echo "      record:   $F1_RECORD §8 · review $F1_REVIEW_DATE"
  return 0
}

run_fleet_suite() {
  local file="supabase/tests/rls_bypass_fleet.sql"
  echo ""
  echo "==> running $file  [ACCEPTED RED — see $F1_RECORD §8]"
  set +e
  output="$(docker exec -i "$CONTAINER" psql -U postgres -d "$DB" -f - < "$file" 2>&1)"
  local suite_status=$?
  set -e

  printf '%s\n' "$output" | awk '/=== .* ===/{show=1} show'
  printf '%s\n' "$output" | grep -E '^(psql|ERROR)' >&2 || true

  if [ $suite_status -ne 0 ]; then
    echo "psql exited with status $suite_status for $file" >&2
    status=1
    return
  fi

  # The suite must report its expected failure state. A green fleet suite means the accepted
  # failure DISAPPEARED — a regression against the acceptance, not a success.
  if printf '%s' "$output" | grep -q 'RLS BYPASS FLEET OK'; then
    echo "FLEET ACCEPTANCE FAILED: the suite reported OK — the accepted F-1 failure is gone." >&2
    echo "  If F-1 was genuinely fixed, re-decide the acceptance in $F1_RECORD §8." >&2
    status=1
    return
  fi
  if ! printf '%s' "$output" | grep -q 'RLS BYPASS FLEET FAILED'; then
    echo "FLEET ACCEPTANCE FAILED: the suite reported neither OK nor FAILED — it did not run." >&2
    status=1
    return
  fi

  if ! f1_record_guard; then
    status=1
    return
  fi

  if ! fleet_acceptance_check; then
    echo "    The fleet suite is only accepted in the exact documented F-1 state." >&2
    status=1
  fi
}

run_suite supabase/tests/rbac_matrix.sql       "RBAC MATRIX OK"
run_suite supabase/tests/phase5_telemetry.sql  "PHASE5 OK"
run_suite supabase/tests/rls_bypass.sql        "RLS BYPASS SUITE OK"
run_fleet_suite
run_suite supabase/tests/phase8_retention.sql  "RETENTION SUITE OK"
run_suite supabase/tests/rls_surface_audit.sql "SURFACE AUDIT OK"
run_suite supabase/tests/hi04_device_ownership.sql "HI-04 DEVICE OWNERSHIP OK"

# `output` still holds the audit's verdict, which carries the anon coverage note verbatim.
if printf '%s' "$output" | grep -q 'anon coverage UNPROVEN LOCALLY'; then
  anon_state="UNPROVEN LOCALLY"
elif printf '%s' "$output" | grep -q 'SURFACE AUDIT OK'; then
  anon_state="PROVEN LOCALLY"
fi

if [ $status -ne 0 ]; then
  echo ""
  echo "Phase 7 verification FAILED." >&2
  exit 1
fi

echo ""
echo "Phase 7 verification complete."
echo "  RLS FLEET ACCEPTED RED — $FLEET_ACCEPTED_COUNT documented F-1 probes"
echo "  ANON COVERAGE: $anon_state"
echo "  5 of 6 suites reported OK; suite 4 (fleet RLS) is the accepted red above."
if [ "$anon_state" = "UNPROVEN LOCALLY" ]; then
  echo ""
  echo "  anon coverage UNPROVEN LOCALLY — no anon role on this stack"
  echo "  NOT COMPLETE: anon coverage is unproven until a hosted run produces the evidence."
  echo "  See $F1_RECORD §8 condition 3 and OQ-012 in docs/program/OWNER_QUEUE.md."
fi
