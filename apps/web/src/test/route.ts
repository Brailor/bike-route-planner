import gravelFixture from '../routing/graphhopper/__fixtures__/gravel-offroad-80.json';
import { mapRouteResponse, type GhRouteResponse } from '../routing/graphhopper/response';

/** A real recorded route (Lobau, gravel profile): ~3.4 km, mixed asphalt/dirt/untagged. */
export const fixtureRoute = mapRouteResponse(gravelFixture.response as unknown as GhRouteResponse);
