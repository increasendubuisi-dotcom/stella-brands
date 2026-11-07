#!/usr/bin/env bash
# Runs the migrations and database tests against a throwaway Postgres cluster.
# Requires Postgres 15+ binaries (initdb, pg_ctl, psql). Data lives in a temp dir.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="${PG_BIN:-$(dirname "$(command -v initdb 2>/dev/null || ls -d /usr/lib/postgresql/*/bin/initdb | sort -V | tail -1)")}"
PORT="${PG_TEST_PORT:-54329}"
DATA="$(mktemp -d /tmp/stella-pg.XXXXXX)"

# Postgres refuses to run as root; use the postgres user when we are root.
run() {
  if [ "$(id -u)" = "0" ]; then
    runuser -u postgres -- "$@"
  else
    "$@"
  fi
}

cleanup() {
  run "$PG_BIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$DATA"
}
trap cleanup EXIT

if [ "$(id -u)" = "0" ]; then chown postgres "$DATA"; fi
run "$PG_BIN/initdb" -D "$DATA" -U postgres -A trust >/dev/null
run "$PG_BIN/pg_ctl" -D "$DATA" -o "-p $PORT -k /tmp -c listen_addresses=''" -w start >/dev/null

PSQL=(psql -h /tmp -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)

"${PSQL[@]}" -f "$ROOT/supabase/tests/_bootstrap.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "migrate: $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done
"${PSQL[@]}" -f "$ROOT/supabase/tests/_helpers.sql"

# Template ops generated from the TypeScript source, passed to tests as psql variables.
TSX="$ROOT/node_modules/.bin/tsx"
OPS_VARS=()
for t in complete essentials blank; do
  OPS_VARS+=(-v "ops_$t=$("$TSX" "$ROOT/scripts/template-ops.ts" "$t")")
done
OPS_VARS+=(-v "editor_session=$("$TSX" "$ROOT/scripts/editor-session.ts")")

for f in "$ROOT"/supabase/tests/[0-9]*.sql; do
  echo "test: $(basename "$f")"
  "${PSQL[@]}" "${OPS_VARS[@]}" -o /dev/null -f "$f" 2>&1 | sed -e 's/^psql:[^ ]* NOTICE:  /  /' -e 's/^NOTICE:  /  /'
  status=${PIPESTATUS[0]}
  if [ "$status" -ne 0 ]; then exit "$status"; fi
done
