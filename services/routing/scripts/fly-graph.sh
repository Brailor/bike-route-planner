#!/usr/bin/env bash
# Copies the graph built on this computer (data/graph-cache, from pnpm routing:start) to the engine's volume on
# Fly.io and deploys the engine on it (docs/deploy.md). The files go compressed, so it's limited by the upload speed:
# about 20 minutes at 8 Mbit/s.
# A volume is attached to one machine at a time, so this removes the engine's machine (it keeps nothing else), fills
# the volume from a temporary machine, and deploys the engine again.
set -euo pipefail
cd "$(dirname "$0")/.."
app=bike-route-planner-routing
temp=graph-setup

# Machine or volume ids by name, from flyctl's JSON.
ids() { node -e 'const want = process.argv[1], neg = want.startsWith("!"), name = want.replace("!", "");
  for (const x of JSON.parse(require("fs").readFileSync(0, "utf8")))
    if ((x.name === name) !== neg) console.log(x.id)' "$1"; }

[[ -f data/graph-cache/properties ]] || { echo "No graph in data/graph-cache; run pnpm routing:start" >&2; exit 1; }
volume=$(fly volumes list -a $app --json | ids graph)
[[ -n $volume ]] || { echo "No graph volume on $app; see docs/deploy.md" >&2; exit 1; }

for machine in $(fly machine list -a $app --json | ids "!$temp"); do fly machine destroy "$machine" -a $app --force; done
if [[ -z $(fly machine list -a $app --json | ids $temp) ]]; then
  fly machine run alpine:3.22 sleep infinity -a $app -r fra -v "$volume:/data" --name $temp --restart no --detach
fi
machine=$(fly machine list -a $app --json | ids $temp)
on_machine() { fly ssh console -q -a $app --machine "$machine" -C "sh -c '$1'"; }

on_machine 'apk add --quiet zstd && find /data -mindepth 1 -maxdepth 1 ! -name lost+found -exec rm -rf {} +'
# One file at a time, so a dropped connection costs one file; each is tried twice. (sftp was slower and lost the
# connection halfway.)
for path in data/graph-cache/*; do
  file=$(basename "$path")
  echo "$file"
  for _ in 1 2; do
    zstd -q -3 -T0 -c "$path" | on_machine "zstd -q -d > /data/$file" && break
  done
done
# Same files on both sides, then the engine (uid 1000) may write its lock file in the volume.
(cd data/graph-cache && md5 -r ./* | sort) >"${TMPDIR:-/tmp}/graph-local.md5"
on_machine 'cd /data && md5sum ./* 2>/dev/null | sort' | tr -d '\r' | sed 's/  / /' | diff "${TMPDIR:-/tmp}/graph-local.md5" -
on_machine 'chown -R 1000:1000 /data && ls -l /data'
fly machine destroy "$machine" -a $app --force
fly deploy --ha=false
