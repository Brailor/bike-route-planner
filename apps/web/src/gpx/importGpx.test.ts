import { describe, expect, it } from 'vitest';
import { toGpx } from './exportGpx';
import { GpxImportError, importGpx, parseGpx } from './importGpx';

const gpx = (body: string, ns = 'xmlns="http://www.topografix.com/GPX/1/1"') =>
  `<?xml version="1.0"?><gpx version="1.1" ${ns}>${body}</gpx>`;

describe('parseGpx', () => {
  it('reads every track segment in order, as [lon, lat, ele]', () => {
    const { name, coordinates } = parseGpx(
      gpx(`<trk><name>Thaya loop</name>
        <trkseg><trkpt lat="48.1" lon="16.1"><ele>200</ele></trkpt><trkpt lat="48.2" lon="16.2"><ele>210.5</ele></trkpt></trkseg>
        <trkseg><trkpt lat="48.3" lon="16.3"><ele>220</ele></trkpt></trkseg>
      </trk>`),
      'ride.gpx',
    );
    expect(name).toBe('Thaya loop');
    expect(coordinates).toEqual([
      [16.1, 48.1, 200],
      [16.2, 48.2, 210.5],
      [16.3, 48.3, 220],
    ]);
  });

  it('drops elevation unless every point has one', () => {
    const { coordinates } = parseGpx(
      gpx(`<trk><trkseg>
        <trkpt lat="48.1" lon="16.1"><ele>200</ele></trkpt><trkpt lat="48.2" lon="16.2"/>
      </trkseg></trk>`),
      'ride.gpx',
    );
    expect(coordinates).toEqual([
      [16.1, 48.1],
      [16.2, 48.2],
    ]);
  });

  it('takes a route’s points when there is no track', () => {
    const { coordinates } = parseGpx(
      gpx(
        `<rte><name>Planned</name><rtept lat="48.1" lon="16.1"/><rtept lat="48.2" lon="16.2"/></rte>`,
      ),
      'x.gpx',
    );
    expect(coordinates).toEqual([
      [16.1, 48.1],
      [16.2, 48.2],
    ]);
  });

  it('ignores the route when there is a track', () => {
    const { coordinates } = parseGpx(
      gpx(`<rte><rtept lat="1" lon="1"/><rtept lat="2" lon="2"/></rte>
        <trk><trkseg><trkpt lat="48.1" lon="16.1"/><trkpt lat="48.2" lon="16.2"/></trkseg></trk>`),
      'x.gpx',
    );
    expect(coordinates[0]).toEqual([16.1, 48.1]);
  });

  it('is named after the metadata, then the track, then the file', () => {
    const track = `<trk><name>Track name</name><trkseg><trkpt lat="1" lon="1"/><trkpt lat="2" lon="2"/></trkseg></trk>`;
    expect(parseGpx(gpx(`<metadata><name>Meta name</name></metadata>${track}`), 'f.gpx').name).toBe(
      'Meta name',
    );
    expect(parseGpx(gpx(track), 'f.gpx').name).toBe('Track name');
    expect(
      parseGpx(
        gpx(`<trk><trkseg><trkpt lat="1" lon="1"/><trkpt lat="2" lon="2"/></trkseg></trk>`),
        'Sunday ride.GPX',
      ).name,
    ).toBe('Sunday ride');
  });

  it('reads GPX 1.0 and files without a namespace', () => {
    const body = `<trk><trkseg><trkpt lat="48.1" lon="16.1"/><trkpt lat="48.2" lon="16.2"/></trkseg></trk>`;
    expect(
      parseGpx(gpx(body, 'xmlns="http://www.topografix.com/GPX/1/0"'), 'a.gpx').coordinates,
    ).toHaveLength(2);
    expect(parseGpx(gpx(body, ''), 'a.gpx').coordinates).toHaveLength(2);
  });

  it('reads back what the app exports', () => {
    const coordinates = [
      [16.1, 48.1, 200],
      [16.2, 48.2, 210.5],
    ];
    expect(parseGpx(toGpx({ name: 'Gravel route 3.4 km', coordinates }), 'x.gpx')).toEqual({
      name: 'Gravel route 3.4 km',
      coordinates,
    });
  });

  it.each([
    ['not XML', 'hello', 'This isn’t a GPX file.'],
    ['another XML file', '<workout_file></workout_file>', 'This isn’t a GPX file.'],
    ['a single point', gpx('<trk><trkseg><trkpt lat="1" lon="1"/></trkseg></trk>'), 'no track'],
    ['only waypoints', gpx('<wpt lat="1" lon="1"/><wpt lat="2" lon="2"/>'), 'no track'],
    [
      'a point without a position',
      gpx('<trk><trkseg><trkpt lat="1"/><trkpt lat="2" lon="2"/></trkseg></trk>'),
      'without a valid position',
    ],
    [
      'a point with a broken position',
      gpx('<trk><trkseg><trkpt lat="x" lon="1"/><trkpt lat="2" lon="2"/></trkseg></trk>'),
      'without a valid position',
    ],
  ])('rejects %s', (_, xml, message) => {
    expect(() => parseGpx(xml, 'x.gpx')).toThrow(GpxImportError);
    expect(() => parseGpx(xml, 'x.gpx')).toThrow(message);
  });
});

describe('importGpx', () => {
  it('reads a file', async () => {
    const file = new File(
      [
        gpx(
          '<trk><trkseg><trkpt lat="48.1" lon="16.1"/><trkpt lat="48.2" lon="16.2"/></trkseg></trk>',
        ),
      ],
      'Lobau.gpx',
    );
    expect(await importGpx(file)).toEqual({
      name: 'Lobau',
      coordinates: [
        [16.1, 48.1],
        [16.2, 48.2],
      ],
    });
  });
});
