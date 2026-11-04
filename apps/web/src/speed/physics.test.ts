import { describe, expect, it } from 'vitest';
import { airDensity, powerForSpeed, speedForPower, type Resistance } from './physics';

/** 75 kg rider + kit + 9 kg road bike, on the hoods, on asphalt, at sea level. */
const ROAD: Resistance = { massKg: 86, crr: 0.004, cdA: 0.32, rho: 1.225 };
const kmh = (ms: number) => ms * 3.6;

describe('speedForPower', () => {
  it('inverts powerForSpeed across climbs, flats and descents', () => {
    for (const grade of [-0.08, -0.03, 0, 0.02, 0.06, 0.12])
      for (const power of [50, 150, 250, 400]) {
        const v = speedForPower(power, grade, ROAD);
        expect(powerForSpeed(v, grade, ROAD)).toBeCloseTo(power, 3);
      }
  });

  it('matches typical road figures: ~38 km/h at 250 W on the flat', () => {
    expect(kmh(speedForPower(250, 0, ROAD))).toBeGreaterThan(36);
    expect(kmh(speedForPower(250, 0, ROAD))).toBeLessThan(39);
  });

  it('on a climb is close to the gravity-only estimate, a little below it', () => {
    // 7%: 250 W · 0.97 / (m · g · (sin θ + Crr)) ≈ 3.95 m/s, before drag.
    const v = speedForPower(250, 0.07, ROAD);
    const theta = Math.atan(0.07);
    const gravityOnly = (250 * 0.97) / (86 * 9.80665 * (Math.sin(theta) + 0.004 * Math.cos(theta)));
    expect(v).toBeLessThan(gravityOnly);
    expect(v).toBeGreaterThan(gravityOnly * 0.95);
  });

  it('coasts downhill at the speed where drag balances gravity', () => {
    const grade = -0.06;
    const theta = Math.atan(grade);
    const pull = -86 * 9.80665 * (0.004 * Math.cos(theta) + Math.sin(theta));
    const terminal = Math.sqrt(pull / (0.5 * 1.225 * 0.32));
    expect(speedForPower(0, grade, ROAD)).toBeCloseTo(terminal, 3);
  });

  it('is slower on rougher ground, and faster in thinner air', () => {
    expect(speedForPower(200, 0, { ...ROAD, crr: 0.012 })).toBeLessThan(
      speedForPower(200, 0, ROAD),
    );
    expect(speedForPower(200, 0, { ...ROAD, rho: airDensity(2000) })).toBeGreaterThan(
      speedForPower(200, 0, ROAD),
    );
  });
});

describe('airDensity', () => {
  it('falls with altitude', () => {
    expect(airDensity(0)).toBeCloseTo(1.225, 3);
    expect(airDensity(1000)).toBeCloseTo(1.084, 2);
  });
});
