#!/usr/bin/env bash
#
# Mutation check for the fleet isolation suite — P5.
#
# A suite that cannot fail is not a probe. `rls_bypass_fleet.sql` asserts >1,000 refusals; this
# script proves the assertion is load-bearing by breaking exactly ONE policy in a throwaway
# database and showing the suite goes red — then restoring the database.
#
# What it does:
#   1. fresh database, all migrations, seed fixtures
#   2. run the fleet suite            -> MUST report RLS BYPASS FLEET OK
#   3. drop policy `sops_select` on app.sops   (the tenant-isolation read policy)
#   4. run the fleet suite again      -> MUST report RLS BYPASS FLEET FAILED
#   5. recreate the database          -> leaves no mutated state behind
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

psql_db() { docker exec -i "$CONTAINER" psql -U postgres -d "$1" "${@:2}"; }

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

build_db "$MUTATION_DB"

echo ""
echo "==> [1/2] baseline: the fleet suite must be GREEN on an intact schema"
baseline="$(run_fleet "$MUTATION_DB")"
printf '%s\n' "$baseline" | grep -E 'RLS BYPASS FLEET (OK|FAILED)' || true
if ! printf '%s' "$baseline" | grep -q 'RLS BYPASS FLEET OK'; then
  echo "" >&2
  echo "MUTATION CHECK INCONCLUSIVE: the suite did not pass on the intact schema, so breaking a" >&2
  echo "policy proves nothing. Fix the suite (or the fixtures) before trusting this check." >&2
  exit 1
fi

echo ""
echo "==> [2/2] mutation: drop policy sops_select on app.sops"
psql_db "$MUTATION_DB" -q -c 'drop policy sops_select on app.sops;'
mutated="$(run_fleet "$MUTATION_DB")"
printf '%s\n' "$mutated" | grep -E 'RLS BYPASS FLEET (OK|FAILED)' || true
printf '%s\n' "$mutated" | grep -E '^\s*cross-tenant read' | head -3 || true

echo ""
echo "==> restoring"
build_db "$MUTATION_DB"
docker exec "$CONTAINER" psql -U postgres -d postgres -q -c "drop database if exists $MUTATION_DB with (force)"

if printf '%s' "$mutated" | grep -q 'RLS BYPASS FLEET FAILED'; then
  echo ""
  echo "MUTATION CHECK OK — the suite passed intact and failed when one policy was dropped."
  exit 0
fi

echo "" >&2
echo "MUTATION CHECK FAILED — the suite still passed with sops_select dropped. The suite is inert." >&2
exit 1
