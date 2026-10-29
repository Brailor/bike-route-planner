const escapeXml = (s: string) =>
  s.replace(
    /[<>&'"]/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c] ?? c,
  );

export interface GpxTrack {
  name: string;
  /** [lon, lat, ele?] — GPX itself is lat/lon, the conversion happens here. */
  coordinates: readonly (readonly number[])[];
}

export function toGpx({ name, coordinates }: GpxTrack, createdAt = new Date()): string {
  const points = coordinates
    .map(([lon = 0, lat = 0, ele]) => {
      const eleTag = ele === undefined ? '' : `<ele>${ele.toFixed(1)}</ele>`;
      return `      <trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}">${eleTag}</trkpt>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="bike-route-planner" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(name)}</name>
    <time>${createdAt.toISOString()}</time>
  </metadata>
  <trk>
    <name>${escapeXml(name)}</name>
    <trkseg>
${points}
    </trkseg>
  </trk>
</gpx>
`;
}

/** File name for a route, e.g. "Lobau loop" → "lobau-loop.gpx". */
export function gpxFileName(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'route'}.gpx`;
}
