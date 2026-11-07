import { useMemo } from 'react';
import { FLAG_REASONS } from '../flags/flag';
import { downloadGpx } from '../gpx/download';
import { GpxImportError, importGpx } from '../gpx/importGpx';
import { usePlanner, type ImportedTrack, type TrackSection } from '../state/store';
import { cumulativeM } from '../track/sections';
import type { AvoidFlag } from '../types';
import { ElevationChart } from './ElevationChart';
import { formatDistance } from './format';

const sectionCount = (n: number) => (n === 1 ? '1 flagged section' : `${n} flagged sections`);

/** The flags a section runs along: their reasons, and notes. */
function describe(section: TrackSection, flags: readonly AvoidFlag[]) {
  const along = section.flagIds.map((id) => flags.find((f) => f.id === id));
  const reasons = [
    ...new Set(along.map((f) => (f?.reason ? FLAG_REASONS[f.reason] : 'Flagged'))),
  ].join(', ');
  const notes = along.flatMap((f) => (f?.note ? [`“${f.note}”`] : [])).join(' ');
  return { reasons, notes };
}

function outcomeText(section: TrackSection) {
  switch (section.outcome) {
    case 'rerouted': {
      const change = section.changeM ?? 0;
      return `Rerouted, ${change < 0 ? '−' : '+'}${formatDistance(Math.abs(change))}`;
    }
    case 'kept':
      return 'Kept';
    case 'no_way_around':
      return 'No way around, kept';
    default:
      return undefined;
  }
}

/** Opening a GPX file someone already has, from the sidebar's header. Why a file can't be opened goes to `onError`. */
export function OpenTrackButton({ onError }: { onError: (message: string | undefined) => void }) {
  async function open(file: File) {
    onError(undefined);
    try {
      const { name, coordinates } = await importGpx(file);
      usePlanner.getState().openTrack(name, coordinates);
    } catch (err) {
      if (!(err instanceof GpxImportError)) console.warn('Could not read GPX file:', err);
      onError(err instanceof GpxImportError ? err.message : 'Couldn’t read this file.');
    }
  }

  return (
    <label className="button workout__file" title="Open a GPX track to check it against your flags">
      Open GPX
      <input
        type="file"
        accept=".gpx"
        className="visually-hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ''; // so picking the same file again still opens it
          if (file) void open(file);
        }}
      />
    </label>
  );
}

/**
 * An opened GPX track, in place of the route while open. The track stays as it is; the only thing on offer is
 * rerouting around the flagged sections it runs along, asked one by one, or all at once.
 */
export function TrackPanel({ track }: { track: ImportedTrack }) {
  const flags = usePlanner((s) => s.flags);
  const { closeTrack, keepSection, rerouteSections, showOnMap } = usePlanner.getState();
  const lengthM = useMemo(() => cumulativeM(track.coordinates).at(-1) ?? 0, [track.coordinates]);
  const { sections, current, rerouting } = track;
  const asked = sections[current];
  const remaining = sections.length - current;

  return (
    <section className="panel-section track" aria-label="Opened track">
      <div className="loops__head">
        <strong data-testid="track-name">{track.name}</strong>
        <button type="button" className="button" onClick={closeTrack}>
          Close
        </button>
      </div>
      <dl className="stats">
        <div>
          <dt>Distance</dt>
          <dd data-testid="track-distance">{formatDistance(lengthM)}</dd>
        </div>
      </dl>
      {sections.length === 0 ? (
        <p className="hint">This track doesn’t run along any of your flagged sections.</p>
      ) : (
        <>
          <p data-testid="track-flag-count">
            Runs along {sectionCount(sections.length)}. Pick one to see it on the map.
          </p>
          <ol className="flag-list__items">
            {sections.map((section, i) => {
              const { reasons, notes } = describe(section, flags);
              const outcome = outcomeText(section);
              return (
                <li
                  key={i}
                  className="flag-list__item"
                  aria-current={i === current}
                  data-testid="track-section"
                >
                  <button
                    type="button"
                    className="flag-list__open"
                    onClick={() =>
                      showOnMap(
                        track.coordinates
                          .slice(section.from, section.to + 1)
                          .map(([lon = 0, lat = 0]) => [lon, lat]),
                      )
                    }
                  >
                    <span>
                      {i + 1}. {reasons}
                    </span>
                    {notes && <span className="flag-list__note">{notes}</span>}
                    {outcome && <span className="flag-list__note">{outcome}</span>}
                  </button>
                </li>
              );
            })}
          </ol>
          {asked ? (
            <div className="track__question" role="group" aria-label="Flagged section">
              <p>
                Section {current + 1} of {sections.length} ({describe(asked, flags).reasons}):
                reroute around it, or keep it?
              </p>
              {asked.error && (
                <p className="status status--error" role="alert">
                  {asked.error}
                </p>
              )}
              {rerouting ? (
                <p className="status" role="status">
                  Finding a way around…
                </p>
              ) : (
                <div className="flag-panel__actions">
                  <button
                    type="button"
                    className="button button--primary"
                    onClick={() => rerouteSections(false)}
                  >
                    Reroute around it
                  </button>
                  <button type="button" className="button" onClick={keepSection}>
                    Keep it
                  </button>
                  {remaining > 1 && (
                    <button type="button" className="button" onClick={() => rerouteSections(true)}>
                      Reroute all {remaining}
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="hint">Every section answered.</p>
          )}
        </>
      )}
      <ElevationChart coordinates={track.coordinates} />
      <button
        type="button"
        className="button button--primary"
        disabled={rerouting !== undefined}
        onClick={() => downloadGpx(track.name, track.coordinates)}
      >
        Export GPX
      </button>
    </section>
  );
}
