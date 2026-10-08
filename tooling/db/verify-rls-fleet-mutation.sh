#!/usr/bin/env bash
#
# Mutation check for the fleet isolation suite — P5.
#
# A suite that cannot fail is not a probe. `rls_bypass_fleet.sql` asserts >1,000 refusals; this
# script proves that assertion is load-bearing by weakening exactly ONE policy in a throwaway
# database and showing the suite goes red FOR THAT REASON — then discarding the database.
#
# ---------------------------------------------------------------------------------------------
# THE ACCEPTED BASELINE (finding F-1, accepted 2026-10-08 as option D)
# ---------------------------------------------------------------------------------------------
# The fleet suite is NOT green at baseline, and must not be made green. Its "claim override
# capability" section is the tripwire for finding F-1, which the owner ACCEPTED as a documented
# platform-inherent risk (docs/SECURITY_FINDING_F1_claim_override.md §8). The expected baseline is:
#
#   verdict                       RLS BYPASS FLEET FAILED: 7 probe(s)
#   total failures                7, ALL in section "claim override capability"
#   "cross-tenant read" failures  0
#   "positive control" failures   0
#   probes                        >= 1000
#
# The mutation must ADD failures in "cross-tenant read" while the positive controls stay green.
# If the baseline is anything else this script stops and reports INCONCLUSIVE — the accepted
# baseline moved, and a mutation result measured against a different baseline proves nothing.
#
# ---------------------------------------------------------------------------------------------
# WHY `alter policy … using (true)` AND NOT `drop policy`
# ---------------------------------------------------------------------------------------------
# `sops` has RLS enabled and EXACTLY ONE select policy (`sops_select`). Dropping it leaves no select
# policy at all, and PostgreSQL treats that as default-deny: Alpha can no longer read its OWN rows.
# The suite would then go red on a POSITIVE CONTROL — an outage — not on a cross-tenant read. That
# proves the suite notices a broken policy; it does NOT prove the isolation assertion is load-bearing.
# Replacing the USING clause with `true` keeps the policy present and permissive, so the positive
# controls still pass and only the isolation assertion fails. That is the signal we want.
#
# Not wired into `verify-phase7.sh`; run it on its own.
#
# Usage:
#   bash tooling/db/verify-rls-fleet-mutation.sh

set -euo pipefail

CONTAINER="${CONTAINER:-sop-pg-test}"
IMAGE="${IMAGE:-postgres:17-alpine}"
PORT="${PORT:-55432}"
DB="${DB:-sop}"
MUTATION_DB="${DB}_mutation"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

echo "==> [0/3] offline lint: the fleet suite parses"
node tooling/db/lint-sql-suites.mjs supabase/tests/rls_bypass_fleet.sql

echo "==> ensuring container '$CONTAINER'"
if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB="$DB" -p "${PORT}:5432" "$IMAGE" >/dev/null
  echo "    created from $IMAGE"
else
  docker start "$CONTAINER" >/dev/null 2>&1 || true
  echo "    reusing existing container"
fi

echo "==> waiting for the server"
for attempt in $(seq 1 60); do
  if docker exec "$CONTAINER" psql -U postgres -d postgres -c 'select 1' >/dev/null 2>&1; then
    echo "    ready after ${attempt} attempt(s)"; break
  fi
  sleep 2
  [ "$attempt" = "60" ] && { echo "    server never became ready" >&2; exit 1; }
done

psql_db() { docker exec -i "$CONTAINER" psql -U postgres -d "$1" "${@:2}"; }

build_db() {
  local db="$1"
  echo "==> recreating '$db' from empty and applying migrations"
  docker exec "$CONTAINER" psql -U postgres -d postgres -q \
    -c "drop database if exists $db with (force)" -c "create database $db"
  for file in supabase/migrations/*.sql; do
    docker exec -i "$CONTAINER" psql -U postgres -d "$db" -v ON_ERROR_STOP=1 -q -f - < "$file"
  done
  docker exec -i "$CONTAINER" psql -U postgres -d "$db" -v ON_ERROR_STOP=1 -q -f - < supabase/seed/0001_fixtures.sql
}

run_fleet() {
  docker exec -i "$CONTAINER" psql -U postgres -d "$1" -f - < supabase/tests/rls_bypass_fleet.sql 2>&1
}

# Read a count out of the suite's OWN results table. The suite drops and recreates `fleet_results`
# at the top of every run, so it always holds the most recent run's rows. `|| true` keeps a failed
# query from tripping `set -e` before `is_number` can report it as an inconclusive baseline.
fleet_count() {  # db, predicate
  psql_db "$1" -At -c "select count(*) from fleet_results where $2;" 2>/dev/null | tr -d '[:space:]' || true
}

is_number() { case "${1:-}" in '' | *[!0-9]*) return 1 ;; *) return 0 ;; esac; }

show_sections() {  # db
  psql_db "$1" -c "select section,
                          count(*)                                     as probes,
                          count(*) filter (where ok)                   as passed,
                          count(*) filter (where not ok)               as failed,
                          count(*) filter (where observed = 'vacuous') as vacuous
                   from fleet_results group by section order by section;"
}

verdict_of() { printf '%s\n' "$1" | grep -E 'RLS BYPASS FLEET (OK|FAILED)' | tail -1 || true; }

build_db "$MUTATION_DB"

# ---------------------------------------------------------------- baseline ---
echo ""
echo "==> [1/3] baseline: the ACCEPTED F-1 red, and nothing else"
baseline_out="$(run_fleet "$MUTATION_DB")"
echo "    verdict: $(verdict_of "$baseline_out")"
show_sections "$MUTATION_DB"

b_total=$(fleet_count "$MUTATION_DB" "true")
b_failed=$(fleet_count "$MUTATION_DB" "not ok")
b_ct=$(fleet_count "$MUTATION_DB" "not ok and section = 'cross-tenant read'")
b_4b=$(fleet_count "$MUTATION_DB" "not ok and section = 'claim override capability'")
b_ctrl=$(fleet_count "$MUTATION_DB" "not ok and section = 'positive control'")

inconclusive() {
  echo "" >&2
  echo "MUTATION CHECK INCONCLUSIVE: the baseline is not the accepted F-1 state, so a mutation" >&2
  echo "result measured against it would prove nothing." >&2
  echo "  expected: probes>=1000, failed=7 (all in 'claim override capability')," >&2
  echo "            'cross-tenant read' failed=0, 'positive control' failed=0" >&2
  echo "  observed: probes=${b_total:-?}, failed=${b_failed:-?}, claim-override=${b_4b:-?}," >&2
  echo "            cross-tenant-read=${b_ct:-?}, positive-control=${b_ctrl:-?}" >&2
  echo "Fix the suite or the fixtures, or update this script if the accepted baseline changed." >&2
  exit 1
}

for v in "$b_total" "$b_failed" "$b_ct" "$b_4b" "$b_ctrl"; do
  is_number "$v" || inconclusive
done
[ "$b_total" -ge 1000 ] || inconclusive
[ "$b_failed" -eq 7 ] || inconclusive
[ "$b_4b" -eq 7 ] || inconclusive
[ "$b_ct" -eq 0 ] || inconclusive
[ "$b_ctrl" -eq 0 ] || inconclusive
printf '%s' "$baseline_out" | grep -q 'RLS BYPASS FLEET FAILED' || inconclusive

echo "    accepted baseline confirmed: 7 failures, all F-1 (section 4b); controls green."

# ---------------------------------------------------------------- mutation ---
echo ""
echo "==> [2/3] mutation: make sops_select permissive (alter policy … using (true))"
if ! psql_db "$MUTATION_DB" -q -c 'alter policy sops_select on public.sops using (true);' >/dev/null; then
  echo "    could not weaken public.sops / sops_select — has the policy been renamed or moved?" >&2
  exit 1
fi
echo "    policy weakened: the row filter is gone, the policy itself is still present."

mutated_out="$(run_fleet "$MUTATION_DB")"
echo "    verdict: $(verdict_of "$mutated_out")"
show_sections "$MUTATION_DB"

m_failed=$(fleet_count "$MUTATION_DB" "not ok")
m_ct=$(fleet_count "$MUTATION_DB" "not ok and section = 'cross-tenant read'")
m_ctrl=$(fleet_count "$MUTATION_DB" "not ok and section = 'positive control'")

# ---------------------------------------------------------------- restore ---
echo ""
echo "==> [3/3] restoring: discarding '$MUTATION_DB'"
docker exec "$CONTAINER" psql -U postgres -d postgres -q -c "drop database if exists $MUTATION_DB with (force)" || true

for v in "$m_failed" "$m_ct" "$m_ctrl"; do
  is_number "$v" || { echo "MUTATION CHECK FAILED — could not read the mutated counts." >&2; exit 1; }
done

if [ "$m_ct" -gt 0 ] && [ "$m_failed" -gt "$b_failed" ] && [ "$m_ctrl" -eq 0 ]; then
  echo ""
  echo "MUTATION CHECK OK — baseline was the accepted F-1 red (7 failures, section 4b); with"
  echo "sops_select made permissive the suite added ${m_ct} cross-tenant read failure(s)"
  echo "(total ${m_failed}) while every positive control stayed green. The isolation assertion is"
  echo "load-bearing, and it fails for the right reason."
  exit 0
fi

echo "" >&2
echo "MUTATION CHECK FAILED — the mutation did not produce the expected signal." >&2
echo "  cross-tenant read failures: ${m_ct} (want > 0)" >&2
echo "  total failures:             ${m_failed} (want > ${b_failed})" >&2
echo "  positive control failures:  ${m_ctrl} (want 0 — a non-zero value means the mutation" >&2
echo "                              caused an outage, not a leak)" >&2
exit 1
