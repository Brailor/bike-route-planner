#!/usr/bin/env bash
# Downloads the pinned GraphHopper jar and the OSM extracts into services/routing, and merges the extracts into
# data/region.osm.pbf (GraphHopper reads a single file; one merged graph also allows cross-border routes).
# Usage: scripts/setup.sh [--update]   (--update re-downloads the extracts even if present)
# Requires osmium-tool (brew install osmium-tool / apt install osmium-tool).
set -euo pipefail

GH_VERSION="11.1"
REGIONS=("europe/austria" "europe/hungary")
MERGED="data/region.osm.pbf"

cd "$(dirname "$0")/.."
mkdir -p data

if ! command -v osmium >/dev/null; then
  echo "osmium not found; install osmium-tool (brew install osmium-tool / apt install osmium-tool)" >&2
  exit 1
fi

jar="graphhopper-web-${GH_VERSION}.jar"
if [[ ! -f "$jar" ]]; then
  echo "Downloading $jar"
  curl -fL --progress-bar -o "$jar.part" \
    "https://github.com/graphhopper/graphhopper/releases/download/${GH_VERSION}/${jar}"
  mv "$jar.part" "$jar"
fi

extracts=()
for region in "${REGIONS[@]}"; do
  pbf="data/$(basename "$region")-latest.osm.pbf"
  url="https://download.geofabrik.de/${region}-latest.osm.pbf"
  extracts+=("$pbf")
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
done

# Re-merge when any extract is newer than the merged file (or the region list changed).
needs_merge=false
[[ -f "$MERGED" ]] || needs_merge=true
for pbf in "${extracts[@]}"; do
  [[ "$pbf" -nt "$MERGED" ]] && needs_merge=true
done
if [[ -f data/regions.txt && "$(cat data/regions.txt)" != "${REGIONS[*]}" ]]; then
  needs_merge=true
fi

if [[ "$needs_merge" == true ]]; then
  echo "Merging ${extracts[*]} → $MERGED"
  osmium merge "${extracts[@]}" -o "$MERGED" --overwrite
  echo "${REGIONS[*]}" > data/regions.txt
  # A new extract invalidates the imported graph.
  rm -rf data/graph-cache
else
  echo "$MERGED up to date"
fi
