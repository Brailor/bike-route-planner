#!/usr/bin/env bash
# Downloads the pinned GraphHopper jar and the OSM extracts into services/routing.
# Usage: scripts/setup.sh [--update]   (--update re-downloads the .pbf even if present)
set -euo pipefail

GH_VERSION="11.1"
REGIONS=("europe/austria")

cd "$(dirname "$0")/.."
mkdir -p data

jar="graphhopper-web-${GH_VERSION}.jar"
if [[ ! -f "$jar" ]]; then
  echo "Downloading $jar"
  curl -fL --progress-bar -o "$jar.part" \
    "https://github.com/graphhopper/graphhopper/releases/download/${GH_VERSION}/${jar}"
  mv "$jar.part" "$jar"
fi

for region in "${REGIONS[@]}"; do
  pbf="data/$(basename "$region")-latest.osm.pbf"
  url="https://download.geofabrik.de/${region}-latest.osm.pbf"
  if [[ -f "$pbf" && "${1:-}" != "--update" ]]; then
    echo "$pbf present (pass --update to refresh)"
    continue
  fi
  echo "Downloading $pbf"
  curl -fL --progress-bar -o "$pbf.part" "$url"
  expected="$(curl -fsSL "$url.md5" | cut -d' ' -f1)"
  actual="$(md5 -q "$pbf.part" 2>/dev/null || md5sum "$pbf.part" | cut -d' ' -f1)"
  if [[ "$expected" != "$actual" ]]; then
    echo "Checksum mismatch for $pbf: expected $expected, got $actual" >&2
    rm -f "$pbf.part"
    exit 1
  fi
  mv "$pbf.part" "$pbf"
  # A new extract invalidates the imported graph.
  rm -rf data/graph-cache
done
