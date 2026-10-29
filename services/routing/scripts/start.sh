#!/usr/bin/env bash
# Starts GraphHopper on :8989. The first start imports the graph into data/graph-cache (several minutes).
# Heap size can be overridden with GH_HEAP, e.g. GH_HEAP=12g scripts/start.sh
set -euo pipefail

cd "$(dirname "$0")/.."
jar="$(ls graphhopper-web-*.jar 2>/dev/null | head -1)"
if [[ -z "$jar" ]]; then
  echo "No GraphHopper jar found; run scripts/setup.sh first" >&2
  exit 1
fi
exec java "-Xmx${GH_HEAP:-8g}" -jar "$jar" server config.yml
