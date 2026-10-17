#!/usr/bin/env bash
# F11b: concurrency check for internal.ask_consume on the LOCAL CI Supabase stack only.
# 25 parallel consumers against a limit of 10 → exactly 10 succeed, count = 10.
set -euo pipefail
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DB_URL" in
  *127.0.0.1*|*localhost*) ;;
  *) echo "refusing: local database only" >&2; exit 2 ;;
esac
U="f11b0000-0000-4000-8000-00000000c0de"
DAY="2026-10-16"
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "insert into auth.users (id) values ('$U') on conflict do nothing; insert into internal.users (id) values ('$U') on conflict do nothing; delete from internal.ask_usage where user_id = '$U';"
OUT="$(mktemp -d)"
for i in $(seq 1 25); do
  psql "$DB_URL" -At -c "select internal.ask_consume('$U', 10, '$DAY')" > "$OUT/$i" &
done
wait
OK=$(cat "$OUT"/* | awk '$1 >= 0' | wc -l | tr -d ' ')
DENIED=$(cat "$OUT"/* | awk '$1 == -1' | wc -l | tr -d ' ')
REMAINING=$(cat "$OUT"/* | awk '$1 >= 0' | sort -n | tr '\n' ' ')
COUNT=$(psql "$DB_URL" -At -c "select count from internal.ask_usage where user_id = '$U' and day = '$DAY'")
echo "ok=$OK denied=$DENIED count=$COUNT remaining=[$REMAINING]"
test "$OK" = "10" && test "$DENIED" = "15" && test "$COUNT" = "10"
test "$REMAINING" = "0 1 2 3 4 5 6 7 8 9 "
# refund never goes below zero; prune keeps today's row
psql "$DB_URL" -v ON_ERROR_STOP=1 -At -c "select internal.ask_refund('$U', '$DAY')" >/dev/null
test "$(psql "$DB_URL" -At -c "select count from internal.ask_usage where user_id = '$U' and day = '$DAY'")" = "9"
test "$(psql "$DB_URL" -At -c "select internal.ask_consume('$U', 0, '$DAY')")" = "-1"
# anon/authenticated cannot execute
if psql "$DB_URL" -At -c "set role authenticated; select internal.ask_consume('$U', 10, '$DAY')" 2>/dev/null; then
  echo "authenticated must not execute ask_consume" >&2; exit 1
fi
psql "$DB_URL" -q -c "delete from internal.users where id = '$U'; delete from auth.users where id = '$U';"
echo "ask_consume concurrency OK"
