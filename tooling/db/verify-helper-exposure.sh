#!/usr/bin/env bash
#
# Local-only regression test for the hosted-helper-residue root cause — P5.
#
# Proves on a DISPOSABLE LOCAL database that a test helper sitting in an API-exposed schema
# and taking SQL text exposes the dynamic-SQL primitive to an API role, and that moving it out
# of the exposed surface removes that path. The suite is supabase/tests/helper_exposure.sql.
#
# NEVER run this against a hosted project. It creates and drops objects, and it exercises the
# primitive by re-pointing a tenant claim (finding F-1) using only local fixture tenants.
#
# A fresh database is built from the migrations on every run, so the result cannot depend on
# leftover state and cannot be mistaken for a hosted result.
#
# Usage:
#   bash tooling/db/verify-helper-exposure.sh

set -euo pipefail

CONTAINER="${CONTAINER:-sop-pg-test}"
IMAGE="${IMAGE:-postgres:17-alpine}"
PORT="${PORT:-55432}"
DB="${DB:-sop_helper_exposure}"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

SUITE="supabase/tests/helper_exposure.sql"

# ---------------------------------------------------------------- check F ------
# Every helper a hosted-capable suite creates must be in verify-hosted.sh's HELPER_NAMES. This is
# the guard against the ORIGINAL failure mode returning by a different route: a new suite helper
# whose name was never registered would otherwise survive the hosted cleanup unnoticed.
HOSTED_SUITES="supabase/tests/rbac_matrix.sql supabase/tests/phase5_telemetry.sql supabase/tests/rls_bypass.sql supabase/tests/rls_bypass_fleet.sql supabase/tests/phase8_retention.sql"

echo "==> [0/4] allowlist coverage: every suite helper is in verify-hosted.sh's HELPER_NAMES"
suite_helpers="$(grep -hoE 'create( or replace)? function +[a-z_][a-z0-9_]*' $HOSTED_SUITES \
  | sed -E 's/.*function +//' | grep -E '^(b_|f_|p5_|r_|rbac_)' | sort -u)"
allowlist="$(sed -n 's/^HELPER_NAMES="\(.*\)"/\1/p' tooling/db/verify-hosted.sh \
  | tr ',' '\n' | tr -d "'" | sed '/^[[:space:]]*$/d' | sort -u)"
if [ -z "$suite_helpers" ] || [ -z "$allowlist" ]; then
  echo "    FAIL  could not read the suite helpers or the allowlist." >&2
  exit 1
fi
missing="$(comm -23 <(printf '%s\n' "$suite_helpers") <(printf '%s\n' "$allowlist"))"
if [ -n "$missing" ]; then
  echo "    FAIL  suite helper(s) missing from HELPER_NAMES — the hosted cleanup would leave them:" >&2
  printf '%s\n' "$missing" | sed 's/^/            /' >&2
  exit 1
fi
echo "    pass  all $(printf '%s\n' "$suite_helpers" | wc -l | tr -d ' ') suite helpers are allowlisted ($(printf '%s\n' "$allowlist" | wc -l | tr -d ' ') names)"

echo "==> [1/4] offline lint: the suite files parse"
node tooling/db/lint-sql-suites.mjs "$SUITE"

echo "==> [2/4] local database (container + migrations + seed)"
if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres -p "${PORT}:5432" "$IMAGE" >/dev/null
  echo "    created from $IMAGE"
else
  docker start "$CONTAINER" >/dev/null 2>&1 || true
  echo "    reusing existing container"
fi

for attempt in $(seq 1 60); do
  if docker exec "$CONTAINER" psql -U postgres -d postgres -c 'select 1' >/dev/null 2>&1; then
    echo "    ready after ${attempt} attempt(s)"; break
  fi
  sleep 2
  [ "$attempt" = "60" ] && { echo "    server never became ready" >&2; exit 1; }
done

docker exec "$CONTAINER" psql -U postgres -d postgres -q \
  -c "drop database if exists $DB with (force)" -c "create database $DB"
for file in supabase/migrations/*.sql; do
  docker exec -i "$CONTAINER" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q -f - < "$file"
done
docker exec -i "$CONTAINER" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q -f - < supabase/seed/0001_fixtures.sql
echo "    applied"

echo "==> [3/4] running $SUITE (LOCAL ONLY)"
set +e
output="$(docker exec -i "$CONTAINER" psql -U postgres -d "$DB" -f - < "$SUITE" 2>&1)"
suite_status=$?
set -e

printf '%s\n' "$output" | awk '/=== .* ===/{show=1} show'
printf '%s\n' "$output" | grep -E '^(psql|ERROR)' >&2 || true

echo ""
if [ $suite_status -ne 0 ]; then
  echo "HELPER EXPOSURE NOT OK (psql exit $suite_status) — full output above." >&2
  exit 1
fi

if printf '%s' "$output" | grep -q 'HELPER EXPOSURE OK'; then
  echo "HELPER EXPOSURE OK — exposed helper exposes the primitive; moving it out removes the path."
  exit 0
fi

echo "HELPER EXPOSURE FAILED — see the failures table above." >&2
exit 1
