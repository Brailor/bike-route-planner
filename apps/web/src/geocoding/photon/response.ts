import type { Place } from '../types';

/** The parts of Photon's GeoJSON we use. Every property is optional; which ones are set depends on the place. */
export interface PhotonProperties {
  name?: string;
  street?: string;
  housenumber?: string;
  postcode?: string;
  city?: string;
  county?: string;
  state?: string;
  country?: string;
}

export interface PhotonResponse {
  features: { geometry: { coordinates: number[] }; properties: PhotonProperties }[];
}

/** Two display lines for a place, e.g. "Stephansplatz" / "Stock-im-Eisen-Platz, 1010 Wien, Österreich". */
export function placeLabel(p: PhotonProperties): Pick<Place, 'name' | 'detail'> {
  const street = [p.street, p.housenumber].filter(Boolean).join(' ');
  const town = p.city ?? p.county;
  const name = p.name ?? (street || town || p.state || p.country || '');
  const parts = [
    street,
    [p.postcode, town].filter(Boolean).join(' '),
    // Without a town (a region, a mountain) the state is the most useful hint.
    town ? '' : p.state,
    p.country,
  ];
  // A city's own name, or a station named after its square, shouldn't repeat on the second line.
  const detail = parts.filter((part, i) => part && part !== name && parts.indexOf(part) === i);
  return { name, detail: detail.join(', ') };
}

/** Places in Photon's order, with entries that would look identical in a list merged into the first. */
export function mapSearchResponse(response: PhotonResponse): Place[] {
  const seen = new Set<string>();
  const places: Place[] = [];
  for (const { geometry, properties } of response.features) {
    const [lon, lat] = geometry.coordinates;
    if (lon === undefined || lat === undefined) continue;
    const label = placeLabel(properties);
    const key = `${label.name}\n${label.detail}`;
    if (!label.name || seen.has(key)) continue;
    seen.add(key);
    places.push({ ...label, point: [lon, lat] });
  }
  return places;
}
