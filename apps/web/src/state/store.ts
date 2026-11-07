import { create } from 'zustand';
import { flagFromSelection, withDetails, type FlagDetails } from '../flags/flag';
import { initialSelection, type FlagHandle, type FlagSelection } from '../flags/selection';
import type { Place } from '../geocoding/types';
import type { LoopCandidate } from '../loops/candidates';
import type { LoopScore } from '../loops/score';
import { INITIAL_VIEW } from '../map/view';
import { DEFAULT_SETTINGS } from '../profiles/defaults';
import type { RouteResult, RoutingError } from '../routing/types';
import type { Reroute } from '../track/reroute';
import { cumulativeM, flaggedSections, type FlaggedSection } from '../track/sections';
import type { AvoidFlag, LonLat, Profile, ProfileSettings, UserSettings, Workout } from '../types';

export type RouteStatus =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'ready' }
  | { state: 'error'; kind: RoutingError['kind']; message: string };

/**
 * A flag being marked on the map (README M2): its two ends, clicked and then draggable, and the stretch traced
 * between them.
 */
export interface FlagDraft {
  /** The ends clicked so far: none, the start, or start and end. */
  points: LonLat[];
  /** The traced stretch for the current points; undefined while tracing or with fewer than two points. */
  trace: RouteResult | undefined;
  error: string | undefined;
}

export interface RankedLoop {
  loop: LoopCandidate;
  score: LoopScore;
  /** The same loop ridden the other way, once fetched. */
  other?: RankedLoop;
}

/** Loops for the workout from the start point (README M3). */
export interface LoopSearch {
  /** What was asked for. A new object per search: answers to an older one are ignored. */
  request: { start: LonLat; workout: Workout };
  status: 'searching' | 'ready' | 'error';
  /** Best first. */
  results: RankedLoop[];
  /** Index into `results`. */
  selected: number;
  error: string | undefined;
  /** The loop (index into `results`) being fetched the other way round. */
  reversing: number | undefined;
  /** Why the last reversal failed. */
  reverseError: string | undefined;
}

/** What became of a flagged section of an imported track. */
export type SectionOutcome = 'kept' | 'rerouted' | 'no_way_around';

export interface TrackSection extends FlaggedSection {
  /** Unset until the user has answered for it. */
  outcome?: SectionOutcome;
  /** For a rerouted section: how much longer the track got (negative when shorter). */
  changeM?: number;
  /** Why the last try at rerouting it failed. */
  error?: string;
}

/** A GPX track the user opened: kept as it is, apart from flagged sections they chose to reroute around. */
export interface ImportedTrack {
  /** New per file opened: answers for an earlier one are ignored. */
  id: string;
  name: string;
  /** [lon, lat, ele?], with the ways around spliced in. */
  coordinates: number[][];
  /** Where it runs along flags, in track order. A rerouted section becomes its way around. */
  sections: TrackSection[];
  /** The section being asked about; `sections.length` once each one has been answered. */
  current: number;
  /** Rerouting the current section; with 'all', each one after it too. */
  rerouting: 'one' | 'all' | undefined;
}

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
  /** A flag being marked on the map instead of on the route; undefined when not marking one. */
  flagDraft: FlagDraft | undefined;
  /** Every flag, oldest first. They apply to all routes; saved in the browser (useFlagPersistence). */
  flags: AvoidFlag[];
  /** Whether the flags layer is drawn. Hidden flags still apply to routes. */
  flagsVisible: boolean;
  /** The flag open for editing in the panel, highlighted on the map. */
  editingFlagId: string | undefined;
  /**
   * Names of waypoints picked by address search, by `pointKey`. Points placed or dragged on the map have none.
   * Keyed by position, not index, so the names follow undo/redo and drop off when a point is dragged away.
   */
  placeNames: Record<string, string>;
  /** Ranks address suggestions near what the user is looking at. Updated when the map stops moving. */
  mapCentre: LonLat;
  /** Asks the map to show these points (fly to one, fit several). A new object per request. */
  mapFocus: { points: LonLat[] } | undefined;
  /** The rider's FTP, weight and ride power; unset fields use defaults. Saved in the browser (useSettingsPersistence). */
  userSettings: UserSettings;
  /** What the ride should contain: a plain duration or a workout from a file. Undefined when none is set. */
  workout: Workout | undefined;
  /** Loop suggestions on show; the map and sidebar switch to them until closed. */
  loops: LoopSearch | undefined;
  /** An opened GPX track on show; like loops, it takes the route's place until closed. */
  track: ImportedTrack | undefined;

  addWaypoint: (point: LonLat) => void;
  insertWaypoint: (index: number, point: LonLat) => void;
  moveWaypoint: (index: number, point: LonLat) => void;
  removeWaypoint: (index: number) => void;
  clearWaypoints: () => void;
  /**
   * Starts over: removes the waypoints (undoable) and an opened track (not undoable; it can be opened again from its
   * file).
   */
  clearMap: () => void;
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
  /** Starts marking a flag on the map; ends an on-route selection. */
  startFlagDraft: () => void;
  /** Adds a clicked end; clicks after the second are ignored (the ends are dragged instead). */
  addDraftPoint: (point: LonLat) => void;
  moveDraftPoint: (index: number, point: LonLat) => void;
  cancelFlagDraft: () => void;
  /** Stores the trace for `points`; ignored when the points have changed since (a stale answer). */
  setDraftTrace: (points: LonLat[], trace: RouteResult) => void;
  setDraftError: (points: LonLat[], message: string) => void;
  /** Turns the traced stretch into a flag and ends the draft. */
  confirmDraft: (details: FlagDetails) => void;
  /** Turns the selected stretch into a flag and ends the selection. */
  confirmFlag: (details: FlagDetails) => void;
  /** Adds flags read from storage, keeping any made before they arrived. */
  loadFlags: (saved: AvoidFlag[]) => void;
  setFlagsVisible: (visible: boolean) => void;
  editFlag: (id: string | undefined) => void;
  /** Replaces a flag's reason and note (the stretch itself stays) and closes the editor. */
  updateFlag: (id: string, details: FlagDetails) => void;
  deleteFlag: (id: string) => void;
  /** Brings points into view, e.g. a flag picked from the list. */
  showOnMap: (points: LonLat[]) => void;
  /** Sets fields; an undefined value clears one back to its default. */
  updateUserSettings: (patch: Partial<UserSettings>) => void;
  /** Applies settings read from storage, keeping any entered before they arrived. */
  loadUserSettings: (saved: UserSettings) => void;
  setWorkout: (workout: Workout | undefined) => void;
  /** Looks for loops from the start point for the workout. No-op without both. */
  searchLoops: () => void;
  /** Stores the answer to `request`; ignored when a newer search (or none) is on show. Brings the loops into view. */
  setLoopResults: (request: LoopSearch['request'], results: RankedLoop[]) => void;
  setLoopError: (request: LoopSearch['request'], message: string) => void;
  selectLoop: (index: number) => void;
  /** Rides the loop the other way: at once if it's been fetched before, otherwise once fetched (useLoopSearch). */
  reverseLoop: (index: number) => void;
  /** Stores the loop the other way round; ignored when the search has changed since. */
  setReversedLoop: (request: LoopSearch['request'], index: number, reversed: RankedLoop) => void;
  setReverseError: (request: LoopSearch['request'], message: string) => void;
  closeLoops: () => void;
  /** Shows a track from a file and finds where it runs along flags. Brings the first one into view, if any. */
  openTrack: (name: string, coordinates: number[][]) => void;
  /** Leaves the section being asked about as it is, and asks about the next. */
  keepSection: () => void;
  /** Reroutes around the section being asked about, or around it and every one after it (useTrackCorrection). */
  rerouteSections: (all: boolean) => void;
  /** Stores what rerouting section `index` of track `id` came to; ignored when that's no longer the question. */
  setSectionResult: (
    id: string,
    index: number,
    result: Reroute | { outcome: 'failed'; error: string },
  ) => void;
  closeTrack: () => void;
  setRouteLoading: () => void;
  setRoute: (route: RouteResult | undefined) => void;
  setRouteError: (error: RoutingError) => void;
}

/** Two corners of the box around the points, for the map to fit; none without points. */
function corners(points: readonly (readonly number[])[]): LonLat[] {
  if (!points.length) return [];
  const lons = points.map((p) => p[0] ?? 0);
  const lats = points.map((p) => p[1] ?? 0);
  return [
    [Math.min(...lons), Math.min(...lats)],
    [Math.max(...lons), Math.max(...lats)],
  ];
}

/** Brings the section to be asked about into view, or the whole track once each one is answered. */
function trackFocus(track: ImportedTrack): { points: LonLat[] } {
  const section = track.sections[track.current];
  const shown = section ? track.coordinates.slice(section.from, section.to + 1) : track.coordinates;
  return { points: corners(shown) };
}

const trackLengthM = (coordinates: readonly (readonly number[])[]) =>
  cumulativeM(coordinates).at(-1) ?? 0;

/** A draft for new points: their old trace no longer fits them. */
const newDraft = (points: LonLat[]): FlagDraft => ({ points, trace: undefined, error: undefined });

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
    flagDraft: undefined,
    flags: [],
    flagsVisible: true,
    editingFlagId: undefined,
    placeNames: {},
    mapCentre: [INITIAL_VIEW.longitude, INITIAL_VIEW.latitude],
    mapFocus: undefined,
    userSettings: {},
    workout: undefined,
    loops: undefined,
    track: undefined,

    addWaypoint: (point) => edit((w) => [...w, point]),
    insertWaypoint: (index, point) => edit((w) => [...w.slice(0, index), point, ...w.slice(index)]),
    moveWaypoint: (index, point) => edit((w) => w.map((p, i) => (i === index ? point : p))),
    removeWaypoint: (index) => edit((w) => w.filter((_, i) => i !== index)),
    clearWaypoints: () => edit(() => []),
    clearMap: () => {
      if (get().waypoints.length > 0) edit(() => []);
      get().closeTrack();
    },
    setStart: (place) => pick(place, (w) => [place.point, ...w.slice(1)]),
    setDestination: (place) => {
      if (get().waypoints.length === 0) return;
      pick(place, (w) => [...(w.length === 1 ? w : w.slice(0, -1)), place.point]);
    },
    setMapCentre: (mapCentre) => set({ mapCentre }),
    setFlagsVisible: (flagsVisible) =>
      // A hidden flag can't stay highlighted for editing.
      set(flagsVisible ? { flagsVisible } : { flagsVisible, editingFlagId: undefined }),
    editFlag: (editingFlagId) => set({ editingFlagId }),
    updateFlag: (id, details) =>
      set((s) => ({
        flags: s.flags.map((f) => (f.id === id ? withDetails(f, details) : f)),
        editingFlagId: undefined,
      })),
    deleteFlag: (id) =>
      set((s) => ({
        flags: s.flags.filter((f) => f.id !== id),
        editingFlagId: s.editingFlagId === id ? undefined : s.editingFlagId,
      })),
    showOnMap: (points) => set({ mapFocus: { points } }),
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
      set((s) =>
        s.route
          ? { flagSelection: initialSelection(s.route.geometry.coordinates), flagDraft: undefined }
          : s,
      ),
    // Always a new object, even for the same index: MapView relies on the re-render to snap a dragged handle.
    moveFlagHandle: (handle, index) =>
      set((s) =>
        s.flagSelection ? { flagSelection: { ...s.flagSelection, [handle]: index } } : s,
      ),
    cancelFlagSelection: () => set({ flagSelection: undefined }),
    startFlagDraft: () =>
      set({
        flagDraft: { points: [], trace: undefined, error: undefined },
        flagSelection: undefined,
        editingFlagId: undefined,
      }),
    addDraftPoint: (point) =>
      set((s) => {
        if (!s.flagDraft) return s;
        if (s.flagDraft.points.length >= 2) return s;
        return { flagDraft: newDraft([...s.flagDraft.points, point]) };
      }),
    moveDraftPoint: (index, point) =>
      set((s) =>
        s.flagDraft
          ? { flagDraft: newDraft(s.flagDraft.points.map((p, i) => (i === index ? point : p))) }
          : s,
      ),
    cancelFlagDraft: () => set({ flagDraft: undefined }),
    setDraftTrace: (points, trace) =>
      set((s) =>
        s.flagDraft?.points === points ? { flagDraft: { points, trace, error: undefined } } : s,
      ),
    setDraftError: (points, error) =>
      set((s) =>
        s.flagDraft?.points === points ? { flagDraft: { points, trace: undefined, error } } : s,
      ),
    confirmDraft: (details) =>
      set((s) => {
        const trace = s.flagDraft?.trace;
        if (!trace) return s;
        const all = { a: 0, b: trace.geometry.coordinates.length - 1 };
        const flag = flagFromSelection(trace, all, details, crypto.randomUUID(), new Date());
        return { flags: [...s.flags, flag], flagDraft: undefined };
      }),
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
    updateUserSettings: (patch) => set((s) => ({ userSettings: { ...s.userSettings, ...patch } })),
    loadUserSettings: (saved) => set((s) => ({ userSettings: { ...saved, ...s.userSettings } })),
    setWorkout: (workout) => set({ workout }),
    searchLoops: () =>
      set((s) => {
        const [start] = s.waypoints;
        if (!start || !s.workout) return s;
        return {
          loops: {
            request: { start, workout: s.workout },
            status: 'searching',
            results: [],
            selected: 0,
            error: undefined,
            reversing: undefined,
            reverseError: undefined,
          },
          track: undefined,
          hoverIndex: undefined,
        };
      }),
    setLoopResults: (request, results) =>
      set((s) => {
        if (s.loops?.request !== request) return s;
        const points = corners(results.flatMap((r) => r.loop.route.geometry.coordinates));
        return {
          loops: { ...s.loops, status: 'ready', results, selected: 0 },
          ...(points.length > 0 && { mapFocus: { points } }),
        };
      }),
    setLoopError: (request, error) =>
      set((s) =>
        s.loops?.request === request ? { loops: { ...s.loops, status: 'error', error } } : s,
      ),
    selectLoop: (selected) =>
      set((s) =>
        s.loops && selected >= 0 && selected < s.loops.results.length
          ? { loops: { ...s.loops, selected, reverseError: undefined }, hoverIndex: undefined }
          : s,
      ),
    reverseLoop: (index) =>
      set((s) => {
        const current = s.loops?.results[index];
        if (!s.loops || !current || s.loops.reversing !== undefined) return s;
        if (!current.other)
          return { loops: { ...s.loops, reversing: index, reverseError: undefined } };
        const { other } = current;
        const here: RankedLoop = { loop: current.loop, score: current.score };
        const results = s.loops.results.map((r, i) =>
          i === index ? { ...other, other: here } : r,
        );
        return { loops: { ...s.loops, results }, hoverIndex: undefined };
      }),
    setReversedLoop: (request, index, reversed) =>
      set((s) => {
        const current = s.loops?.results[index];
        if (s.loops?.request !== request || !current) return s;
        const here: RankedLoop = { loop: current.loop, score: current.score };
        const results = s.loops.results.map((r, i) =>
          i === index ? { ...reversed, other: here } : r,
        );
        return { loops: { ...s.loops, results, reversing: undefined }, hoverIndex: undefined };
      }),
    setReverseError: (request, reverseError) =>
      set((s) =>
        s.loops?.request === request
          ? { loops: { ...s.loops, reversing: undefined, reverseError } }
          : s,
      ),
    closeLoops: () => set((s) => (s.loops ? { loops: undefined, hoverIndex: undefined } : s)),
    openTrack: (name, coordinates) =>
      set((s) => {
        const track: ImportedTrack = {
          id: crypto.randomUUID(),
          name,
          coordinates,
          sections: flaggedSections(coordinates, s.flags),
          current: 0,
          rerouting: undefined,
        };
        return {
          track,
          loops: undefined,
          flagSelection: undefined,
          flagDraft: undefined,
          editingFlagId: undefined,
          hoverIndex: undefined,
          mapFocus: trackFocus(track),
        };
      }),
    keepSection: () =>
      set((s) => {
        const { track } = s;
        if (!track || track.rerouting || track.current >= track.sections.length) return s;
        const next: ImportedTrack = {
          ...track,
          sections: track.sections.map((section, i) =>
            i === track.current ? { ...section, outcome: 'kept' } : section,
          ),
          current: track.current + 1,
        };
        return { track: next, mapFocus: trackFocus(next) };
      }),
    rerouteSections: (all) =>
      set((s) => {
        const { track } = s;
        if (!track || track.rerouting || track.current >= track.sections.length) return s;
        return {
          track: {
            ...track,
            sections: track.sections.map((section, i) =>
              i === track.current ? { ...section, error: undefined } : section,
            ),
            rerouting: all ? 'all' : 'one',
          },
        };
      }),
    setSectionResult: (id, index, result) =>
      set((s) => {
        const { track } = s;
        if (track?.id !== id || track.current !== index || !track.rerouting) return s;
        // A failure leaves the question open, to try again or keep the section.
        if (result.outcome === 'failed')
          return {
            track: {
              ...track,
              sections: track.sections.map((section, i) =>
                i === index ? { ...section, error: result.error } : section,
              ),
              rerouting: undefined,
            },
          };
        let { coordinates } = track;
        let sections: TrackSection[];
        if (result.outcome === 'rerouted') {
          const { splice } = result;
          const shift = splice.coordinates.length - coordinates.length;
          const changeM = trackLengthM(splice.coordinates) - trackLengthM(coordinates);
          coordinates = splice.coordinates;
          // The section becomes its way around; later ones move with the coordinates.
          sections = track.sections.map((section, i) =>
            i < index
              ? section
              : i === index
                ? { ...section, from: splice.from, to: splice.to, outcome: 'rerouted', changeM }
                : { ...section, from: section.from + shift, to: section.to + shift },
          );
        } else {
          sections = track.sections.map((section, i) =>
            i === index ? { ...section, outcome: result.outcome } : section,
          );
        }
        const current = index + 1;
        const more = current < sections.length;
        const next: ImportedTrack = {
          ...track,
          coordinates,
          sections,
          current,
          rerouting: track.rerouting === 'all' && more ? 'all' : undefined,
        };
        return { track: next, hoverIndex: undefined, mapFocus: trackFocus(next) };
      }),
    closeTrack: () => set((s) => (s.track ? { track: undefined, hoverIndex: undefined } : s)),
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
