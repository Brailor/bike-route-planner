#!/usr/bin/env bash
# Starts GraphHopper on :8989. The first start imports the graph into data/graph-cache (several minutes).
# Heap size can be overridden with GH_HEAP, e.g. GH_HEAP=12g scripts/start.sh. Austria + Hungary peaks at ~6.3 GB used.
# For the container (ADR 0013), GH_DATAACCESS (RAM_STORE or MMAP) and GH_BIND_HOST override config.yml.
set -euo pipefail

cd "$(dirname "$0")/.."
jar="$(ls graphhopper-web-*.jar 2>/dev/null | head -1)"
if [[ -z "$jar" ]]; then
  echo "No GraphHopper jar found; run scripts/setup.sh first" >&2
  exit 1
fi
opts=()
if [[ -n "${GH_DATAACCESS:-}" ]]; then
  opts+=("-Ddw.graphhopper.graph.dataaccess.default_type=$GH_DATAACCESS")
fi
if [[ -n "${GH_BIND_HOST:-}" ]]; then
  opts+=("-Ddw.server.application_connectors[0].bind_host=$GH_BIND_HOST")
fi
exec java "-Xmx${GH_HEAP:-10g}" ${opts[@]+"${opts[@]}"} -jar "$jar" server config.yml
