import { describe, expect, it } from 'vitest';
import { gpxFileName, toGpx } from './exportGpx';

const parse = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml');

describe('toGpx', () => {
  const xml = toGpx(
    {
      name: 'Lobau <loop> & back',
      coordinates: [
        [16.559, 48.2004, 152.3],
        [16.59, 48.19],
      ],
    },
    new Date('2026-10-29T10:00:00Z'),
  );
  const doc = parse(xml);

  it('is well-formed GPX 1.1', () => {
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
    expect(doc.documentElement.getAttribute('version')).toBe('1.1');
  });

  it('writes lat/lon from [lon, lat] coordinates', () => {
    const pt = doc.getElementsByTagName('trkpt')[0]!;
    expect(pt.getAttribute('lat')).toBe('48.200400');
    expect(pt.getAttribute('lon')).toBe('16.559000');
    expect(pt.getElementsByTagName('ele')[0]?.textContent).toBe('152.3');
  });

  it('omits elevation when it is unknown', () => {
    expect(doc.getElementsByTagName('trkpt')[1]!.getElementsByTagName('ele')).toHaveLength(0);
  });

  it('escapes the name', () => {
    expect(doc.getElementsByTagName('name')[0]?.textContent).toBe('Lobau <loop> & back');
  });
});

describe('gpxFileName', () => {
  it('slugifies', () => {
    expect(gpxFileName('Wienerwald: Hütteldorf → Pressbaum')).toBe(
      'wienerwald-hutteldorf-pressbaum.gpx',
    );
    expect(gpxFileName('***')).toBe('route.gpx');
  });
});
