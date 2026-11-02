import type { Geocoder } from '../geocoding/types';
import { pointKey, usePlanner } from '../state/store';
import type { LonLat } from '../types';
import { AddressField } from './AddressField';

/** What a field shows for a waypoint placed on the map rather than picked from a search. */
export const MAP_POINT_LABEL = 'Point on map';

/** Start and destination as address fields; the map stays the other way to set them. */
export function RouteEnds({ geocoder }: { geocoder?: Geocoder }) {
  const waypoints = usePlanner((s) => s.waypoints);
  const placeNames = usePlanner((s) => s.placeNames);
  // Like the map, the ends are frozen while a stretch is being picked for a flag.
  const flagging = usePlanner((s) => s.flagSelection !== undefined);
  const { setStart, setDestination } = usePlanner.getState();

  const start = waypoints[0];
  const destination = waypoints.length >= 2 ? waypoints.at(-1) : undefined;
  const name = (point: LonLat | undefined) =>
    point ? (placeNames[pointKey(point)] ?? MAP_POINT_LABEL) : '';

  return (
    <section className="panel-section route-ends" aria-label="Start and destination">
      <AddressField
        label="Start"
        value={name(start)}
        placeholder="Search an address or click the map"
        disabled={flagging}
        onPick={setStart}
        geocoder={geocoder}
      />
      <AddressField
        label="Destination"
        value={name(destination)}
        placeholder={start ? 'Search an address or click the map' : 'Set a start first'}
        disabled={flagging || !start}
        onPick={setDestination}
        geocoder={geocoder}
      />
    </section>
  );
}
