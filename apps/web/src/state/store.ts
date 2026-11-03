import { create } from 'zustand';
import { flagFromSelection, type FlagDetails } from '../flags/flag';
import { initialSelection, type FlagHandle, type FlagSelection } from '../flags/selection';
import type { Place } from '../geocoding/types';
import { INITIAL_VIEW } from '../map/view';
import { DEFAULT_SETTINGS } from '../profiles/defaults';
import type { RouteResult, RoutingError } from '../routing/types';
import type { AvoidFlag, LonLat, Profile, ProfileSettings } from '../types';

export type RouteStatus =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'ready' }
  | { state: 'error'; kind: RoutingError['kind']; message: string };

/** Key for `placeNames`. */
export const pointKey = ([lon, lat]: LonLat) => `${lon},${lat}`;

/** Undo steps kept; older ones are dropped. */
const HISTORY_LIMIT = 100;

interface PlannerState {
  waypoints: LonLat[];
  /** Earlier waypoint lists, most recent last. Only waypoint edits are undoable, not profile/settings changes. */
  past: LonLat[][];
  /** Undone waypoint lists, most recently undone last. Cleared by any new edit. */
  future: LonLat[][];
  profile: Profile;
  /** Each profile keeps its own settings, so switching back and forth doesn't lose them. */
  settingsByProfile: Record<Profile, ProfileSettings>;
  route: RouteResult | undefined;
  status: RouteStatus;
  /** Index into the route's coordinates under the pointer (map or elevation chart). */
  hoverIndex: number | undefined;
  /** The stretch being picked for a flag; undefined when not flagging. Indices into `route`'s coordinates. */
  flagSelection: FlagSelection | undefined;
  /** Every flag, oldest first. They apply to all routes; saved in the browser (useFlagPersistence). */
  flags: AvoidFlag[];
  /**
   * Names of waypoints picked by address search, by `pointKey`. Points placed or dragged on the map have none.
   * Keyed by position, not index, so the names follow undo/redo and drop off when a point is dragged away.
   */
  placeNames: Record<string, string>;
  /** Ranks address suggestions near what the user is looking at. Updated when the map stops moving. */
  mapCentre: LonLat;
  /** Asks the map to show these points (fly to one, fit several). A new object per request. */
  mapFocus: { points: LonLat[] } | undefined;

  addWaypoint: (point: LonLat) => void;
  insertWaypoint: (index: number, point: LonLat) => void;
  moveWaypoint: (index: number, point: LonLat) => void;
  removeWaypoint: (index: number) => void;
  clearWaypoints: () => void;
  /** Replaces the start, or sets it when there are no waypoints. Shows it on the map. */
  setStart: (place: Pick<Place, 'name' | 'point'>) => void;
  /** Replaces the destination, or adds it after a lone start. Needs a start. Shows the route's ends on the map. */
  setDestination: (place: Pick<Place, 'name' | 'point'>) => void;
  setMapCentre: (centre: LonLat) => void;
  undo: () => void;
  redo: () => void;
  setProfile: (profile: Profile) => void;
  updateSettings: (patch: Partial<Omit<ProfileSettings, 'profile'>>) => void;
  setHoverIndex: (index: number | undefined) => void;
  /** Puts two handles on the current route. No-op without a route. */
  startFlagSelection: () => void;
  moveFlagHandle: (handle: FlagHandle, index: number) => void;
  cancelFlagSelection: () => void;
  /** Turns the selected stretch into a flag and ends the selection. */
  confirmFlag: (details: FlagDetails) => void;
  /** Adds flags read from storage, keeping any made before they arrived. */
  loadFlags: (saved: AvoidFlag[]) => void;
  setRouteLoading: () => void;
  setRoute: (route: RouteResult | undefined) => void;
  setRouteError: (error: RoutingError) => void;
}

export const usePlanner = create<PlannerState>()((set, get) => {
  /** Applies a waypoint edit as one undoable step. */
  const edit = (change: (waypoints: LonLat[]) => LonLat[]) =>
    set((s) => ({
      waypoints: change(s.waypoints),
      past: [...s.past, s.waypoints].slice(-HISTORY_LIMIT),
      future: [],
    }));

  /** A waypoint edit from address search: also remembers the place's name and brings the waypoints into view. */
  const pick = (
    place: Pick<Place, 'name' | 'point'>,
    change: (waypoints: LonLat[]) => LonLat[],
  ) => {
    edit(change);
    set((s) => ({
      placeNames: { ...s.placeNames, [pointKey(place.point)]: place.name },
      mapFocus: { points: s.waypoints },
    }));
  };

  return {
    waypoints: [],
    past: [],
    future: [],
    profile: 'gravel',
    settingsByProfile: DEFAULT_SETTINGS,
    route: undefined,
    status: { state: 'idle' },
    hoverIndex: undefined,
    flagSelection: undefined,
    flags: [],
    placeNames: {},
    mapCentre: [INITIAL_VIEW.longitude, INITIAL_VIEW.latitude],
    mapFocus: undefined,

    addWaypoint: (point) => edit((w) => [...w, point]),
    insertWaypoint: (index, point) => edit((w) => [...w.slice(0, index), point, ...w.slice(index)]),
    moveWaypoint: (index, point) => edit((w) => w.map((p, i) => (i === index ? point : p))),
    removeWaypoint: (index) => edit((w) => w.filter((_, i) => i !== index)),
    clearWaypoints: () => edit(() => []),
    setStart: (place) => pick(place, (w) => [place.point, ...w.slice(1)]),
    setDestination: (place) => {
      if (get().waypoints.length === 0) return;
      pick(place, (w) => [...(w.length === 1 ? w : w.slice(0, -1)), place.point]);
    },
    setMapCentre: (mapCentre) => set({ mapCentre }),
    undo: () =>
      set((s) => {
        const previous = s.past.at(-1);
        if (!previous) return s;
        return {
          waypoints: previous,
          past: s.past.slice(0, -1),
          future: [...s.future, s.waypoints],
        };
      }),
    redo: () =>
      set((s) => {
        const next = s.future.at(-1);
        if (!next) return s;
        return { waypoints: next, past: [...s.past, s.waypoints], future: s.future.slice(0, -1) };
      }),
    setProfile: (profile) => set({ profile }),
    updateSettings: (patch) =>
      set((s) => ({
        settingsByProfile: {
          ...s.settingsByProfile,
          [s.profile]: { ...s.settingsByProfile[s.profile], ...patch },
        },
      })),
    setHoverIndex: (hoverIndex) => set({ hoverIndex }),
    startFlagSelection: () =>
      set((s) => (s.route ? { flagSelection: initialSelection(s.route.geometry.coordinates) } : s)),
    // Always a new object, even for the same index: MapView relies on the re-render to snap a dragged handle.
    moveFlagHandle: (handle, index) =>
      set((s) =>
        s.flagSelection ? { flagSelection: { ...s.flagSelection, [handle]: index } } : s,
      ),
    cancelFlagSelection: () => set({ flagSelection: undefined }),
    confirmFlag: (details) =>
      set((s) => {
        if (!s.route || !s.flagSelection) return s;
        const flag = flagFromSelection(
          s.route,
          s.flagSelection,
          details,
          crypto.randomUUID(),
          new Date(),
        );
        return { flags: [...s.flags, flag], flagSelection: undefined };
      }),
    loadFlags: (saved) =>
      set((s) => {
        const savedIds = new Set(saved.map((f) => f.id));
        return { flags: [...saved, ...s.flags.filter((f) => !savedIds.has(f.id))] };
      }),
    setRouteLoading: () => set({ status: { state: 'loading' } }),
    setRoute: (route) =>
      // A new route invalidates the selection: its indices point into the old geometry.
      set({
        route,
        hoverIndex: undefined,
        flagSelection: undefined,
        status: { state: route ? 'ready' : 'idle' },
      }),
    setRouteError: (error) =>
      set({ status: { state: 'error', kind: error.kind, message: error.message } }),
  };
});

export const selectSettings = (s: PlannerState) => s.settingsByProfile[s.profile];
