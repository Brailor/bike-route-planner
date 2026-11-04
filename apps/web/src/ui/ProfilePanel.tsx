import { PROFILE_LABELS, PROFILES } from '../profiles/defaults';
import { selectSettings, usePlanner } from '../state/store';

export function ProfilePanel() {
  const profile = usePlanner((s) => s.profile);
  const settings = usePlanner(selectSettings);
  const { setProfile, updateSettings } = usePlanner.getState();

  return (
    <section className="panel-section" aria-label="Profile">
      <div className="segmented" role="group" aria-label="Riding profile">
        {PROFILES.map((p) => (
          <button key={p} type="button" aria-pressed={p === profile} onClick={() => setProfile(p)}>
            {PROFILE_LABELS[p]}
          </button>
        ))}
      </div>

      {settings.offroadPreference !== undefined && (
        <label className="field">
          <span className="field__label">
            Off-road preference <output>{settings.offroadPreference}</output>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={settings.offroadPreference}
            onChange={(e) => updateSettings({ offroadPreference: Number(e.target.value) })}
          />
          <span className="field__scale" aria-hidden="true">
            <span>Paved</span>
            <span>Off-road</span>
          </span>
        </label>
      )}

      {profile === 'mtb' && <p className="hint">MTB routes always go as off-road as they can.</p>}

      <label className="field field--inline">
        <input
          type="checkbox"
          checked={settings.avoidMainRoads ?? false}
          onChange={(e) => updateSettings({ avoidMainRoads: e.target.checked })}
        />
        Avoid main roads
      </label>
    </section>
  );
}
