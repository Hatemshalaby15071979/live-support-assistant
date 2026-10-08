#!/usr/bin/env bash
#
# Run ONLY the fleet isolation suite (suite 5), on a fresh database. Short loop for iterating
# on `supabase/tests/rls_bypass_fleet.sql` without paying for the other four suites.
#
# Before touching the database it runs an offline lint for the failure that shipped once
# already: a psql variable (`:'name'`) inside a `$$ ... $$` body, which psql does not
# interpolate, so the body reaches the server with a literal `:` and dies with
# `syntax error at or near ":"`. The lint needs no dependency — node is already required.
#
# Usage:
#   bash tooling/db/verify-fleet-only.sh

set -euo pipefail

CONTAINER="${CONTAINER:-sop-pg-test}"
IMAGE="${IMAGE:-postgres:17-alpine}"
PORT="${PORT:-55432}"
DB="${DB:-sop_fleet}"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

SUITE="supabase/tests/rls_bypass_fleet.sql"

echo "==> [0/3] offline lint: no psql variable inside a dollar-quoted body"
node -e '
const { readFileSync } = require("node:fs");
const file = process.argv[1];
const src = readFileSync(file, "utf8");
// Regions between paired dollar-quote delimiters are NOT interpolated by psql.
const offenders = [];
for (const delim of ["$$", "$q$"]) {
  const parts = src.split(delim);
  for (let i = 1; i < parts.length; i += 2) {
    const body = parts[i] ?? "";
    const re = /:\x27[A-Za-z_][A-Za-z0-9_]*\x27/g;
    let m;
    while ((m = re.exec(body)) !== null) offenders.push({ delim, token: m[0] });
  }
}
// Also flag the bare :"name" form.
for (const m of src.matchAll(/:"[A-Za-z_][A-Za-z0-9_]*"/g)) offenders.push({ delim: "(outside)", token: m[0] });
if (offenders.length > 0) {
  console.error(`    FAIL  ${offenders.length} psql variable(s) inside a non-interpolated region:`);
  for (const o of offenders.slice(0, 10)) console.error(`          ${o.token}  [${o.delim}]`);
  console.error("    psql does not interpolate variables inside dollar-quoted bodies.");
  process.exit(1);
}
console.log("    pass  no psql variable inside a dollar-quoted body");
' "$SUITE"

echo "==> [1/3] ensuring container '$CONTAINER'"
if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres -p "${PORT}:5432" "$IMAGE" >/dev/null
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

echo "==> [2/3] recreating '$DB' from empty and applying migrations"
docker exec "$CONTAINER" psql -U postgres -d postgres -q \
  -c "drop database if exists $DB with (force)" -c "create database $DB"
for file in supabase/migrations/*.sql; do
  docker exec -i "$CONTAINER" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q -f - < "$file"
done
docker exec -i "$CONTAINER" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q -f - < supabase/seed/0001_fixtures.sql
echo "    applied"

echo "==> [3/3] running $SUITE"
set +e
output="$(docker exec -i "$CONTAINER" psql -U postgres -d "$DB" -f - < "$SUITE" 2>&1)"
suite_status=$?
set -e

printf '%s\n' "$output" | awk '/=== object resolution/{show=1} show'

echo ""
if printf '%s' "$output" | grep -q 'RLS BYPASS FLEET OK'; then
  echo "FLEET SUITE OK"
  exit 0
fi

echo "FLEET SUITE NOT OK (psql exit $suite_status) — full output above." >&2
exit 1
