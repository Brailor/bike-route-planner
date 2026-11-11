// Reading a GPX file someone already has: its track, as it is. GPX is lat/lon; the conversion to [lon, lat, ele?]
// happens here.
import { fillGaps } from '../track/elevation';

/** A file that isn't a usable GPX track; the message is shown to the user. */
export class GpxImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GpxImportError';
  }
}

export interface ImportedGpx {
  name: string;
  /**
   * [lon, lat, ele?]. Elevation on every point or none, so a profile never has gaps: points the file gives none are
   * filled in from their neighbours.
   */
  coordinates: number[][];
}

const children = (parent: Document | Element, tag: string) => [
  ...parent.getElementsByTagNameNS('*', tag),
];

const text = (parent: Document | Element, tag: string) =>
  children(parent, tag)[0]?.textContent?.trim() || undefined;

function position(point: Element): number[] {
  const lat = Number(point.getAttribute('lat'));
  const lon = Number(point.getAttribute('lon'));
  if (!point.hasAttribute('lat') || !point.hasAttribute('lon') || !isFinite(lat) || !isFinite(lon))
    throw new GpxImportError('This GPX file has a point without a valid position.');
  const ele = Number(text(point, 'ele') ?? NaN);
  return isFinite(ele) ? [lon, lat, ele] : [lon, lat];
}

/**
 * The track in a GPX file: every track segment joined in order, or the route's points when it has no track (some
 * planners export routes). Named after the file's metadata or track, or else the file name.
 */
export function parseGpx(xml: string, fileName: string): ImportedGpx {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length || doc.documentElement.localName !== 'gpx')
    throw new GpxImportError('This isn’t a GPX file.');
  const trackPoints = children(doc, 'trkpt');
  const points = (trackPoints.length ? trackPoints : children(doc, 'rtept')).map(position);
  if (points.length < 2) throw new GpxImportError('This GPX file has no track to follow.');
  const coordinates = fillGaps(points) ?? points;
  const metadata = children(doc, 'metadata')[0];
  const track = children(doc, 'trk')[0] ?? children(doc, 'rte')[0];
  const name =
    (metadata && text(metadata, 'name')) ??
    (track && text(track, 'name')) ??
    fileName.replace(/\.gpx$/i, '');
  return { name, coordinates };
}

export async function importGpx(file: File): Promise<ImportedGpx> {
  return parseGpx(await file.text(), file.name);
}
