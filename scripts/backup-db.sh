#!/bin/sh
# Periodic Postgres backup — runs inside the `backup` service (docker-compose.prod.yml).
# Each cycle: pg_dump the env's database → gzip → /backups (a Docker volume), then prune
# to the newest $BACKUP_KEEP files. For OFFSITE durability, sync /backups to Cloudflare R2
# from the host via cron + rclone (see docs/deployment/vps-setup.md → "Backups").
#
# Reads from .env.production (env_file): POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB,
# and optional BACKUP_INTERVAL_SECONDS (default 86400 = daily) + BACKUP_KEEP (default 7).
set -u

export PGPASSWORD="$POSTGRES_PASSWORD"
INTERVAL="${BACKUP_INTERVAL_SECONDS:-86400}"
KEEP="${BACKUP_KEEP:-7}"
mkdir -p /backups

echo "[backup] db=${POSTGRES_DB} interval=${INTERVAL}s keep=${KEEP}"
while true; do
	ts="$(date +%Y%m%d-%H%M%S)"
	out="/backups/${POSTGRES_DB}-${ts}.sql.gz"
	if pg_dump -h postgres -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip >"$out"; then
		echo "[backup] wrote $out ($(wc -c <"$out") bytes)"
	else
		echo "[backup] FAILED at $ts" >&2
		rm -f "$out"
	fi
	# Retention: keep the newest $KEEP dumps, delete the rest.
	ls -1t "/backups/${POSTGRES_DB}-"*.sql.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f
	sleep "$INTERVAL"
done
