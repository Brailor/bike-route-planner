// Gravel spike (docs/plan.md, M0): routes known gravel areas with several profile variants and reports surface,
// road-class and detour statistics. Writes results.json and one GPX per route into the output directory.
// Usage: node services/routing/spikes/gravel-spike.mjs <out-dir>   (GraphHopper must be running on :8989)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const GH = process.env.GH_URL ?? 'http://localhost:8989';
const outDir = process.argv[2];
if (!outDir) throw new Error('usage: gravel-spike.mjs <out-dir>');

// [lon, lat]
const AREAS = [
  {
    id: 'wienerwald-north',
    name: 'Wien Hütteldorf → Pressbaum',
    points: [
      [16.2615, 48.1975],
      [16.0806, 48.1805],
    ],
  },
  {
    id: 'wienerwald-south',
    name: 'Mödling → Heiligenkreuz',
    points: [
      [16.2876, 48.0857],
      [16.1303, 48.0554],
    ],
  },
  {
    id: 'leithagebirge',
    name: 'Mannersdorf → Donnerskirchen',
    points: [
      [16.6006, 47.9706],
      [16.6446, 47.8963],
    ],
  },
  {
    id: 'donauauen',
    name: 'Groß-Enzersdorf → Orth an der Donau',
    points: [
      [16.559, 48.2004],
      [16.7004, 48.1453],
    ],
  },
  {
    id: 'weinviertel',
    name: 'Mistelbach → Poysdorf',
    points: [
      [16.5735, 48.5707],
      [16.631, 48.6676],
    ],
  },
];

const PAVED =
  'surface == ASPHALT || surface == CONCRETE || surface == PAVED || surface == PAVING_STONES';
const penalisePaved = (f) => ({ priority: [{ if: PAVED, multiply_by: String(f) }] });
// Tagged paved, plus what is probably paved when the surface tag is missing: ordinary roads, and grade1 tracks.
const LIKELY_PAVED =
  `${PAVED} || (surface == MISSING && road_class != TRACK && road_class != PATH && road_class != BRIDLEWAY)` +
  ' || (surface == MISSING && road_class == TRACK && track_type == GRADE1)';
const penaliseLikelyPaved = (f) => ({ priority: [{ if: LIKELY_PAVED, multiply_by: String(f) }] });

const VARIANTS = [
  { id: 'road', profile: 'road' },
  { id: 'gravel', profile: 'gravel' },
  { id: 'gravel-paved-0.8', profile: 'gravel', model: penalisePaved(0.8) },
  { id: 'gravel-paved-0.6', profile: 'gravel', model: penalisePaved(0.6) },
  { id: 'gravel-paved-0.4', profile: 'gravel', model: penalisePaved(0.4) },
  // Penalise everything that is not a track; catches roads whose surface tag is missing.
  {
    id: 'gravel-nontrack-0.6',
    profile: 'gravel',
    model: { priority: [{ if: 'road_class != TRACK', multiply_by: '0.6' }] },
  },
  // Like paved-0.6, but also keeps away from rough singletrack-like ways.
  {
    id: 'gravel-paved-0.6-norough',
    profile: 'gravel',
    model: {
      priority: [
        { if: PAVED, multiply_by: '0.6' },
        { if: 'mtb_rating > 1 || hike_rating > 1', multiply_by: '0.2' },
        {
          if: 'road_class == PATH || road_class == FOOTWAY || road_class == BRIDLEWAY',
          multiply_by: '0.5',
        },
      ],
    },
  },
  { id: 'gravel-likely-0.6', profile: 'gravel', model: penaliseLikelyPaved(0.6) },
  { id: 'gravel-likely-0.4', profile: 'gravel', model: penaliseLikelyPaved(0.4) },
  // Also cancel bike_priority's signed-cycle-route boost (up to 1.5×) on likely-paved roads.
  {
    id: 'gravel-likely-0.4-nonet',
    profile: 'gravel',
    model: {
      priority: [
        { if: LIKELY_PAVED, multiply_by: '0.4' },
        { if: `bike_network != MISSING && (${LIKELY_PAVED})`, multiply_by: '0.67' },
      ],
    },
  },
  { id: 'mtb', profile: 'mtb' },
];

const DETAILS = [
  'surface',
  'track_type',
  'road_class',
  'smoothness',
  'mtb_rating',
  'hike_rating',
  'bike_network',
  'osm_way_id',
];

const SURFACE_GROUP = {
  ASPHALT: 'paved',
  CONCRETE: 'paved',
  PAVED: 'paved',
  PAVING_STONES: 'paved',
  COBBLESTONE: 'paved',
  COMPACTED: 'gravel',
  FINE_GRAVEL: 'gravel',
  GRAVEL: 'gravel',
  UNPAVED: 'gravel',
  GROUND: 'rough',
  DIRT: 'rough',
  GRASS: 'rough',
  SAND: 'rough',
  WOOD: 'rough',
};
const ROUGH_CLASSES = new Set(['path', 'footway', 'bridleway', 'steps', 'pedestrian']);

async function route(area, variant) {
  const body = {
    profile: variant.profile,
    points: area.points,
    points_encoded: false,
    elevation: true,
    instructions: false,
    details: DETAILS,
    ...(variant.model && { custom_model: variant.model }),
  };
  const res = await fetch(`${GH}/route`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${area.id}/${variant.id}: ${res.status} ${json.message}`);
  return json.paths[0];
}

function segmentLengths(coords) {
  const out = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const [x1, y1] = coords[i];
    const [x2, y2] = coords[i + 1];
    const kx = 111320 * Math.cos((((y1 + y2) / 2) * Math.PI) / 180);
    out.push(Math.hypot((x2 - x1) * kx, (y2 - y1) * 110540));
  }
  return out;
}

// Per point-segment value lookup for one path detail.
function perSegment(detail, n) {
  const values = new Array(n).fill(null);
  for (const [from, to, v] of detail ?? []) for (let i = from; i < to; i++) values[i] = v;
  return values;
}

function analyse(path) {
  const coords = path.points.coordinates;
  const len = segmentLengths(coords);
  const n = len.length;
  const d = Object.fromEntries(DETAILS.map((k) => [k, perSegment(path.details[k], n)]));
  const total = len.reduce((a, b) => a + b, 0);
  const share = (pred) => len.reduce((acc, l, i) => (pred(i) ? acc + l : acc), 0) / total;
  const surf = (i) => String(d.surface[i]).toUpperCase();
  const group = (i) => SURFACE_GROUP[surf(i)] ?? (surf(i) === 'MISSING' ? 'missing' : 'other');
  const cls = (i) => String(d.road_class[i]).toLowerCase();
  // Best guess at what is actually unpaved: tagged unpaved, or untagged tracks/paths that aren't grade1.
  const likelyUnpaved = (i) =>
    group(i) === 'gravel' ||
    group(i) === 'rough' ||
    (group(i) === 'missing' &&
      ['track', 'path', 'bridleway'].includes(cls(i)) &&
      d.track_type[i] !== 'grade1');

  const unknownTrackGrades = {};
  len.forEach((l, i) => {
    if (group(i) === 'missing' && cls(i) === 'track') {
      const g = d.track_type[i];
      unknownTrackGrades[g] = (unknownTrackGrades[g] ?? 0) + l / total;
    }
  });

  const missingWays = new Set();
  len.forEach((_, i) => {
    if (group(i) === 'missing' && d.osm_way_id[i] != null) missingWays.add(d.osm_way_id[i]);
  });

  return {
    distanceKm: path.distance / 1000,
    ascentM: path.ascend,
    timeH: path.time / 3.6e6,
    paved: share((i) => group(i) === 'paved'),
    gravel: share((i) => group(i) === 'gravel'),
    rough: share((i) => group(i) === 'rough'),
    missing: share((i) => group(i) === 'missing'),
    missingOffTrack: share(
      (i) => group(i) === 'missing' && !['track', 'path', 'bridleway'].includes(cls(i)),
    ),
    likelyUnpaved: share(likelyUnpaved),
    track: share((i) => cls(i) === 'track'),
    roughClass: share((i) => ROUGH_CLASSES.has(cls(i))),
    mainRoad: share((i) => ['primary', 'secondary', 'trunk'].includes(cls(i))),
    bikeNetwork: share((i) => d.bike_network[i] != null && d.bike_network[i] !== 'missing'),
    mtbOrHikeRated: share((i) => (d.mtb_rating[i] ?? 0) > 1 || (d.hike_rating[i] ?? 0) > 1),
    missingSurfaceTrackByGrade: unknownTrackGrades,
    trackWayIds: [
      ...new Set(
        len.map((_, i) => (cls(i) === 'track' ? d.osm_way_id[i] : null)).filter((x) => x != null),
      ),
    ],
    missingSurfaceWayIds: [...missingWays],
    coordinates: coords,
  };
}

function gpx(name, coords) {
  const pts = coords
    .map(
      ([lon, lat, ele]) =>
        `      <trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}"><ele>${(ele ?? 0).toFixed(1)}</ele></trkpt>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="bike-route-planner gravel spike" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${name}</name>
    <trkseg>
${pts}
    </trkseg>
  </trk>
</gpx>
`;
}

mkdirSync(join(outDir, 'gpx'), { recursive: true });
const results = [];
for (const area of AREAS) {
  const rows = [];
  for (const variant of VARIANTS) {
    const a = analyse(await route(area, variant));
    writeFileSync(
      join(outDir, 'gpx', `${area.id}--${variant.id}.gpx`),
      gpx(`${area.name} (${variant.id})`, a.coordinates),
    );
    delete a.coordinates;
    rows.push({ variant: variant.id, ...a });
  }
  const base = rows.find((r) => r.variant === 'road').distanceKm;
  for (const r of rows) r.detour = r.distanceKm / base;
  results.push({ area: area.id, name: area.name, rows });
}
writeFileSync(
  join(outDir, 'results.json'),
  JSON.stringify({ variants: VARIANTS, results }, null, 2),
);

const pct = (x) => `${Math.round(x * 100)}%`.padStart(4);
for (const { name, rows } of results) {
  console.log(`\n## ${name}`);
  console.log(
    'variant                   km    ×road  ascent  UNPAVED~ paved gravel rough missing (off-track) track path* main  net   rated',
  );
  for (const r of rows) {
    console.log(
      `${r.variant.padEnd(24)} ${r.distanceKm.toFixed(1).padStart(5)}  ${r.detour.toFixed(2)}  ${String(Math.round(r.ascentM)).padStart(5)}  ` +
        `  ${pct(r.likelyUnpaved)}   ${pct(r.paved)}  ${pct(r.gravel)}  ${pct(r.rough)}  ${pct(r.missing)}  (${pct(r.missingOffTrack)})    ${pct(r.track)}  ${pct(r.roughClass)}  ${pct(r.mainRoad)}  ${pct(r.bikeNetwork)}  ${pct(r.mtbOrHikeRated)}`,
    );
  }
}
