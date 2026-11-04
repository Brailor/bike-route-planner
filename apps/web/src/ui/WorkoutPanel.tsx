import { useState } from 'react';
import { riderValue } from '../speed/rider';
import { usePlanner } from '../state/store';
import { importWorkout, parseRideDuration } from '../workouts/importWorkout';
import { durationWorkout, WorkoutImportError } from '../workouts/workout';
import { formatDuration } from './format';
import { WorkoutProfile } from './WorkoutProfile';

/** What the ride should contain (README M3): a plain duration, or a ZWO / FIT workout file. */
export function WorkoutPanel() {
  const workout = usePlanner((s) => s.workout);
  const settings = usePlanner((s) => s.userSettings);
  const hasStart = usePlanner((s) => s.waypoints.length > 0);
  // Loops can't be looked for while a flag is being marked, or while a search is running.
  const busy = usePlanner(
    (s) =>
      s.flagSelection !== undefined || s.flagDraft !== undefined || s.loops?.status === 'searching',
  );
  const { setWorkout } = usePlanner.getState();
  const [duration, setDuration] = useState('');
  const [error, setError] = useState<string>();
  /** What a loaded file lost on the way in; cleared with the workout. */
  const [warnings, setWarnings] = useState<string[]>([]);
  const durationS = parseRideDuration(duration);

  async function load(file: File) {
    setError(undefined);
    try {
      const imported = await importWorkout(file);
      setWorkout(imported.workout);
      setWarnings(imported.warnings);
    } catch (err) {
      if (!(err instanceof WorkoutImportError)) console.warn('Could not read workout file:', err);
      setError(err instanceof WorkoutImportError ? err.message : 'Couldn’t read this file.');
    }
  }

  if (workout)
    return (
      <section className="panel-section workout" aria-label="Workout">
        <div className="workout__head">
          <span>
            <strong data-testid="workout-name">{workout.name}</strong>{' '}
            <span data-testid="workout-duration">{formatDuration(workout.totalDurationS)}</span>
          </span>
          <button
            type="button"
            className="button"
            onClick={() => {
              setWorkout(undefined);
              setWarnings([]);
            }}
          >
            Remove
          </button>
        </div>
        {workout.intervals.length > 1 && (
          <WorkoutProfile
            workout={workout}
            ftpW={riderValue(settings, 'ftpW')}
            ridePowerPct={riderValue(settings, 'ridePowerPct')}
          />
        )}
        {warnings.length > 0 && (
          <ul className="workout__warnings" data-testid="workout-warnings">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
        <button
          type="button"
          className="button button--primary"
          disabled={!hasStart || busy}
          onClick={() => usePlanner.getState().searchLoops()}
        >
          Find loops from the start
        </button>
        {!hasStart && (
          <p className="hint">Set a start point to find loops that fit this workout.</p>
        )}
      </section>
    );

  return (
    <section className="panel-section workout" aria-label="Workout">
      <form
        className="workout__duration"
        onSubmit={(e) => {
          e.preventDefault();
          if (durationS === undefined) return;
          setWorkout(durationWorkout(`${formatDuration(durationS)} ride`, durationS));
          setDuration('');
        }}
      >
        <label className="field">
          <span className="field__label">Ride duration (h:mm or minutes)</span>
          <input
            type="text"
            inputMode="numeric"
            placeholder="1:30"
            value={duration}
            aria-invalid={duration.trim() !== '' && durationS === undefined}
            onChange={(e) => setDuration(e.target.value)}
          />
        </label>
        <button type="submit" className="button" disabled={durationS === undefined}>
          Set
        </button>
      </form>
      <label className="button workout__file">
        Load workout file (.zwo, .fit)
        <input
          type="file"
          accept=".zwo,.fit"
          className="visually-hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = ''; // so picking the same file again still loads it
            if (file) void load(file);
          }}
        />
      </label>
      {error && (
        <p className="status status--error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
