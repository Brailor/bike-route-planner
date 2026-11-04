import { gpxFileName, toGpx } from './exportGpx';

/** Saves a track as a GPX file through the browser's download. */
export function downloadGpx(name: string, coordinates: readonly (readonly number[])[]) {
  const url = URL.createObjectURL(
    new Blob([toGpx({ name, coordinates })], { type: 'application/gpx+xml' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = gpxFileName(name);
  a.click();
  URL.revokeObjectURL(url);
}
