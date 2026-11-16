#!/usr/bin/env bash
# Runs the migrations and the security/workflow tests against a throwaway Postgres 16.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
DATA=$(mktemp -u /tmp/bs-pg-XXXXXX); mkdir -p "$DATA"
PORT=${PORT:-54329}
[ "$(id -u)" = 0 ] && chown postgres "$DATA"
as_pg() { if [ "$(id -u)" = 0 ]; then su postgres -s /bin/bash -c "$*"; else bash -c "$*"; fi; }
as_pg "$PGBIN/initdb -D $DATA -A trust -U postgres >/dev/null"
as_pg "$PGBIN/pg_ctl -D $DATA -o '-p $PORT -k /tmp' -l $DATA/log -w start >/dev/null"
trap 'as_pg "$PGBIN/pg_ctl -D $DATA -m immediate stop >/dev/null"; rm -rf "$DATA"' EXIT
PSQL="psql -X -q -v ON_ERROR_STOP=1 -h /tmp -p $PORT -U postgres -d postgres"
$PSQL -f "$HERE/supabase_stub.sql"
for f in "$HERE"/../migrations/*.sql; do echo "migrate: $(basename "$f")"; $PSQL -f "$f"; done
for f in "$HERE"/test_*.sql; do echo "test: $(basename "$f")"; $PSQL -o /dev/null -f "$f"; done
echo "ALL SQL TESTS PASSED"
