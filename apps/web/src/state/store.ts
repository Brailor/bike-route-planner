import { create } from 'zustand';
import { initialSelection, type FlagHandle, type FlagSelection } from '../flags/selection';
import { DEFAULT_SETTINGS } from '../profiles/defaults';
import type { RouteResult, RoutingError } from '../routing/types';
import type { LonLat, Profile, ProfileSettings } from '../types';

export type RouteStatus =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'ready' }
  | { state: 'error'; kind: RoutingError['kind']; message: string };

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

  addWaypoint: (point: LonLat) => void;
  insertWaypoint: (index: number, point: LonLat) => void;
  moveWaypoint: (index: number, point: LonLat) => void;
  removeWaypoint: (index: number) => void;
  clearWaypoints: () => void;
  undo: () => void;
  redo: () => void;
  setProfile: (profile: Profile) => void;
  updateSettings: (patch: Partial<Omit<ProfileSettings, 'profile'>>) => void;
  setHoverIndex: (index: number | undefined) => void;
  /** Puts two handles on the current route. No-op without a route. */
  startFlagSelection: () => void;
  moveFlagHandle: (handle: FlagHandle, index: number) => void;
  cancelFlagSelection: () => void;
  setRouteLoading: () => void;
  setRoute: (route: RouteResult | undefined) => void;
  setRouteError: (error: RoutingError) => void;
}

export const usePlanner = create<PlannerState>()((set) => {
  /** Applies a waypoint edit as one undoable step. */
  const edit = (change: (waypoints: LonLat[]) => LonLat[]) =>
    set((s) => ({
      waypoints: change(s.waypoints),
      past: [...s.past, s.waypoints].slice(-HISTORY_LIMIT),
      future: [],
    }));

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

    addWaypoint: (point) => edit((w) => [...w, point]),
    insertWaypoint: (index, point) => edit((w) => [...w.slice(0, index), point, ...w.slice(index)]),
    moveWaypoint: (index, point) => edit((w) => w.map((p, i) => (i === index ? point : p))),
    removeWaypoint: (index) => edit((w) => w.filter((_, i) => i !== index)),
    clearWaypoints: () => edit(() => []),
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
