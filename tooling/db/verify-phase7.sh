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
#
# The fleet suite (suite 4) is now expected to report `RLS BYPASS FLEET OK` with zero
# failures. It was previously an "accepted red" (finding F-1, option D) requiring exactly 7
# `claim override capability` failures; that acceptance was reversed under G5, and the tenant
# claim is no longer client-spoofable (see migration 20261113000000_fix_tenant_claim_spoof.sql
# and docs/SECURITY_FINDING_F1_claim_override.md). A green fleet suite is now the PASS state.
#
# anon/authenticated coverage is PROVEN LOCALLY: this harness provisions those two roles
# (Supabase supplies them in the hosted target; the bare postgres image does not), so the
# surface audit's role-coverage check actually exercises them. The hosted run still
# re-confirms coverage as part of F-1 record §8 / OQ-012, but it is no longer deferred
# from the local gate.
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

# ----------------------------------------------------- fleet suite gate ---
# The fleet RLS suite (suite 4) must report `RLS BYPASS FLEET OK`. The earlier "accepted red"
# machinery (FLEET_ACCEPTED_COUNT, f1_record_guard, fleet_acceptance_check) was removed with the
# option-D acceptance; the suite is now a normal green gate like the others.

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

# Supabase supplies the anon and authenticated roles in the hosted target; the bare
# postgres image does not. The surface audit's role-coverage check and the fleet claim-
# override probes need anon present to actually exercise it, so provision both (nologin)
# when missing. This keeps the verification reproducible from an empty cluster.
echo "==> ensuring anon/authenticated roles exist (Supabase provides these)"
for r in anon authenticated; do
  if ! docker exec "$CONTAINER" psql -U postgres -d postgres -tAc "select 1 from pg_roles where rolname = '$r'" | grep -q 1; then
    docker exec "$CONTAINER" psql -U postgres -d postgres -q -c "create role $r nologin"
    echo "    created role $r"
  fi
done

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

run_fleet_suite() {
  local file="supabase/tests/rls_bypass_fleet.sql"
  echo ""
  echo "==> running $file"
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

  if printf '%s' "$output" | grep -q 'RLS BYPASS FLEET OK'; then
    return
  fi

  local opposite='RLS BYPASS FLEET FAILED'
  if printf '%s' "$output" | grep -q "$opposite"; then
    echo "$file REPORTED FAILURE: '$opposite'" >&2
  else
    echo "$file DID NOT REPORT 'RLS BYPASS FLEET OK' (and did not report '$opposite' either)" >&2
  fi
  status=1
}

run_suite supabase/tests/rbac_matrix.sql       "RBAC MATRIX OK"
run_suite supabase/tests/phase5_telemetry.sql  "PHASE5 OK"
run_suite supabase/tests/rls_bypass.sql        "RLS BYPASS SUITE OK"
run_fleet_suite
run_suite supabase/tests/phase8_retention.sql  "RETENTION SUITE OK"
run_suite supabase/tests/rls_surface_audit.sql "SURFACE AUDIT OK"

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
echo "  RLS FLEET SUITE: green (RLS BYPASS FLEET OK) — tenant claim no longer client-spoofable (G5/HI-01)"
echo "  ANON COVERAGE: $anon_state"
echo "  6 of 6 suites reported OK."
if [ "$anon_state" = "UNPROVEN LOCALLY" ]; then
  echo ""
  echo "  anon coverage UNPROVEN LOCALLY — no anon role on this stack"
  echo "  NOT COMPLETE: anon coverage is unproven until a hosted run produces the evidence."
  echo "  See docs/SECURITY_FINDING_F1_claim_override.md §8 and OQ-012 in docs/program/OWNER_QUEUE.md."
fi
