// An imported track against the user's flags (ADR 0010): where the track runs along a flagged stretch, and splicing
// a way around one into the track. Everything else about the track stays as it was. Positions are indices into the
// track's coordinates.
import { END_TRIM_M, trimEnds } from '../flags/avoid';
import { distanceM, projectOnSegment, segmentLengthsM } from '../geo';
import type { AvoidFlag } from '../types';

type Coordinates = readonly (readonly number[])[];

/** How far a track may stray from a flagged stretch and still be on it: GPS error on a recorded ride. */
export const MATCH_M = 15;
/** The track is checked every few metres, so a long straight segment (a planned track) is checked all along. */
export const SAMPLE_M = 5;
/** A gap this long along the track (a stray GPS point, out and back to it) doesn’t end a run along a flag. */
export const GAP_M = 60;
/** A run rides the flag when it covers this share of the stretch; crossing it covers little. */
export const MIN_COVERAGE = 0.5;
/** Sections closer together than this along the track are asked about, and rerouted, as one. */
export const MERGE_M = 100;

/** A stretch of the track along one or more flags: its first and last coordinate. */
export interface FlaggedSection {
  from: number;
  to: number;
  flagIds: string[];
}

/** Where a way around may start and end: between the neighbouring sections, so it never reaches into them. */
export interface Bounds {
  min: number;
  max: number;
}

/** Distance along the track to each coordinate. */
export function cumulativeM(coordinates: Coordinates): number[] {
  const along = [0];
  for (const l of segmentLengthsM(coordinates)) along.push((along.at(-1) ?? 0) + l);
  return along;
}

interface Sample {
  point: readonly number[];
  segment: number;
  alongM: number;
}

/** Points every SAMPLE_M along the track, each with the segment it lies on. */
function samples(track: Coordinates, along: number[]): Sample[] {
  const out: Sample[] = [];
  for (let i = 0; i + 1 < track.length; i++) {
    const [ax = 0, ay = 0] = track[i] ?? [];
    const [bx = 0, by = 0] = track[i + 1] ?? [];
    const length = (along[i + 1] ?? 0) - (along[i] ?? 0);
    const n = Math.max(1, Math.ceil(length / SAMPLE_M));
    for (let j = 0; j < n; j++) {
      const t = j / n;
      out.push({
        point: [ax + (bx - ax) * t, ay + (by - ay) * t],
        segment: i,
        alongM: (along[i] ?? 0) + length * t,
      });
    }
  }
  return out;
}

/** Where the track runs along one flag: one section per pass. */
function sectionsAlong(flag: AvoidFlag, track: Sample[]): FlaggedSection[] {
  // Matched against what routing avoids: the stretch less its ends, which run on into the next ways.
  const core = trimEnds(flag.geometry, END_TRIM_M);
  const line = core.type === 'Point' ? [core.coordinates] : core.coordinates;
  const along = cumulativeM(line);
  const total = along.at(-1) ?? 0;
  const lats = line.map((p) => p[1] ?? 0);
  const lons = line.map((p) => p[0] ?? 0);
  const marginLat = MATCH_M / 111_000;
  const marginLon = marginLat / Math.cos(((lats[0] ?? 0) * Math.PI) / 180);
  const [west, east] = [Math.min(...lons) - marginLon, Math.max(...lons) + marginLon];
  const [south, north] = [Math.min(...lats) - marginLat, Math.max(...lats) + marginLat];

  /** How far along the flag the point lies, when it's on it. */
  function onFlag(point: readonly number[]): number | undefined {
    const [x = 0, y = 0] = point;
    // Most of a track is nowhere near a given flag: a cheap check first (for speed only).
    if (x < west || x > east || y < south || y > north) return undefined;
    if (line.length === 1) return distanceM(point, line[0] ?? []) <= MATCH_M ? 0 : undefined;
    let best: { distanceM: number; alongM: number } | undefined;
    for (let i = 0; i + 1 < line.length; i++) {
      const { t, distanceM } = projectOnSegment(point, line[i] ?? [], line[i + 1] ?? []);
      const a = along[i] ?? 0;
      if (!best || distanceM < best.distanceM)
        best = { distanceM, alongM: a + ((along[i + 1] ?? 0) - a) * t };
    }
    return best && best.distanceM <= MATCH_M ? best.alongM : undefined;
  }

  const out: FlaggedSection[] = [];
  let run: { first: Sample; last: Sample; lo: number; hi: number } | undefined;
  const close = () => {
    if (run && (total === 0 || (run.hi - run.lo) / total >= MIN_COVERAGE))
      out.push({ from: run.first.segment, to: run.last.segment + 1, flagIds: [flag.id] });
    run = undefined;
  };
  for (const sample of track) {
    const at = onFlag(sample.point);
    if (at === undefined) continue;
    if (run && sample.alongM - run.last.alongM <= GAP_M) {
      run = { ...run, last: sample, lo: Math.min(run.lo, at), hi: Math.max(run.hi, at) };
    } else {
      close();
      run = { first: sample, last: sample, lo: at, hi: at };
    }
  }
  close();
  return out;
}

/**
 * The stretches of the track that ride along flags, in track order. Crossing a flagged way, or brushing past one,
 * doesn't count. Sections close together are merged, since a way around one would run into the next.
 */
export function flaggedSections(track: Coordinates, flags: readonly AvoidFlag[]): FlaggedSection[] {
  if (track.length < 2) return [];
  const along = cumulativeM(track);
  const points = samples(track, along);
  const all = flags.flatMap((flag) => sectionsAlong(flag, points)).sort((a, b) => a.from - b.from);
  const merged: FlaggedSection[] = [];
  for (const section of all) {
    const previous = merged.at(-1);
    if (previous && (along[section.from] ?? 0) - (along[previous.to] ?? 0) < MERGE_M) {
      previous.to = Math.max(previous.to, section.to);
      if (!previous.flagIds.includes(section.flagIds[0] ?? ''))
        previous.flagIds.push(...section.flagIds);
    } else merged.push({ ...section, flagIds: [...section.flagIds] });
  }
  return merged;
}

/** Track indices for a way around to start and end at: `distance` metres either side of the section, within bounds. */
export function anchors(
  track: Coordinates,
  section: FlaggedSection,
  bounds: Bounds,
  distance: number,
): [from: number, to: number] {
  const along = cumulativeM(track);
  const at = (i: number) => along[i] ?? 0;
  let from = section.from;
  while (from > bounds.min && at(section.from) - at(from) < distance) from--;
  let to = section.to;
  while (to < bounds.max && at(to) - at(section.to) < distance) to++;
  return [from, to];
}

export interface Splice {
  coordinates: number[][];
  /** First and last coordinate of the way around in the new track. */
  from: number;
  to: number;
  /** The last coordinate of the old track kept before the way around, and the first one after it. */
  kept: number;
  resumed: number;
  /** The first and last coordinate of the way around (as routed) that went into the track. */
  detourFrom: number;
  detourTo: number;
}

/**
 * The track with the way around in place of the section. The way around starts and ends at the anchors, but often
 * first rides back or on along the track to the junction where it turns off: that part is dropped, so the track
 * leaves itself where the way around does, without riding there and back.
 */
export function spliceDetour(
  track: Coordinates,
  section: FlaggedSection,
  bounds: Bounds,
  [anchorFrom, anchorTo]: [number, number],
  detour: Coordinates,
): Splice {
  const offM = (point: readonly number[], s: number) =>
    projectOnSegment(point, track[s] ?? [], track[s + 1] ?? []).distanceM;
  /**
   * The segment the point lies on, searching from `start` in `step` direction up to `end`: of the first run of
   * segments within MATCH_M, the closest. Searching outwards from the section finds, on a track that rides a road
   * out and back, the pass nearer the section.
   */
  const segmentAt = (point: readonly number[], start: number, step: 1 | -1, end: number) => {
    let best: { s: number; off: number } | undefined;
    for (let s = start; step > 0 ? s < end : s >= end; s += step) {
      const off = offM(point, s);
      if (off > MATCH_M) {
        if (best) break;
        continue;
      }
      if (!best || off < best.off) best = { s, off };
    }
    return best?.s;
  };
  const before = (point: readonly number[]) => segmentAt(point, section.from - 1, -1, bounds.min);
  const after = (point: readonly number[]) => segmentAt(point, section.to, 1, bounds.max);

  // The way around's first point off the track before the section, and its last point off it after.
  let head = { keep: anchorFrom, start: 0 };
  for (let i = 0; i < detour.length; i++) {
    const s = before(detour[i] ?? []);
    if (s === undefined) break;
    head = { keep: s, start: i };
  }
  let tail = { resume: anchorTo, end: detour.length - 1 };
  for (let i = detour.length - 1; i >= 0; i--) {
    const s = after(detour[i] ?? []);
    if (s === undefined) break;
    tail = { resume: s + 1, end: i };
  }
  if (head.start >= tail.end) {
    head = { keep: anchorFrom, start: 0 };
    tail = { resume: anchorTo, end: detour.length - 1 };
  }

  const withEle = track.every((p) => p.length > 2);
  const way = detour
    .slice(head.start, tail.end + 1)
    .map((p) => (withEle ? [...p] : [p[0] ?? 0, p[1] ?? 0]));
  const kept = track.slice(0, head.keep + 1).map((p) => [...p]);
  return {
    coordinates: [...kept, ...way, ...track.slice(tail.resume).map((p) => [...p])],
    from: kept.length,
    to: kept.length + way.length - 1,
    kept: head.keep,
    resumed: tail.resume,
    detourFrom: head.start,
    detourTo: tail.end,
  };
}
