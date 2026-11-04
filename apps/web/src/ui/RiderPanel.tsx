import { RIDER_DEFAULTS, RIDER_LIMITS, riderFrom, riderValue } from '../speed/rider';
import { usePlanner } from '../state/store';
import { NumberField } from './NumberField';

/** The rider's numbers for the speed model (README M3). Collapsed to a one-line summary; unset fields use defaults. */
export function RiderPanel() {
  const settings = usePlanner((s) => s.userSettings);
  const { updateUserSettings } = usePlanner.getState();
  const { powerW } = riderFrom(settings);

  return (
    <section className="panel-section" aria-label="Rider">
      <details className="rider">
        <summary data-testid="rider-summary">
          Rider: {riderValue(settings, 'ftpW')} W FTP · {riderValue(settings, 'weightKg')} kg
        </summary>
        <div className="rider__fields">
          <NumberField
            label="FTP"
            unit="W"
            value={settings.ftpW}
            placeholder={RIDER_DEFAULTS.ftpW}
            {...RIDER_LIMITS.ftpW}
            onChange={(ftpW) => updateUserSettings({ ftpW })}
          />
          <NumberField
            label="Weight"
            unit="kg"
            value={settings.weightKg}
            placeholder={RIDER_DEFAULTS.weightKg}
            {...RIDER_LIMITS.weightKg}
            onChange={(weightKg) => updateUserSettings({ weightKg })}
          />
          <NumberField
            label="Ride power"
            unit="% of FTP"
            value={settings.ridePowerPct}
            placeholder={RIDER_DEFAULTS.ridePowerPct}
            {...RIDER_LIMITS.ridePowerPct}
            onChange={(ridePowerPct) => updateUserSettings({ ridePowerPct })}
          />
          <p className="field__hint" data-testid="ride-power">
            Times assume a steady {Math.round(powerW)} W. Empty fields use the defaults shown.
          </p>
        </div>
      </details>
    </section>
  );
}
