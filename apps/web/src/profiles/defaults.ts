import type { Profile, ProfileSettings } from '../types';

export const PROFILES: readonly Profile[] = ['road', 'gravel', 'mtb'];

export const PROFILE_LABELS: Record<Profile, string> = {
  road: 'Road',
  gravel: 'Gravel',
  mtb: 'MTB',
};

// Gravel defaults towards unpaved: the base model is road-like (gravel spike, finding 1). Only gravel has the off-road
// slider: road stays paved and MTB is always as off-road as it gets.
export const DEFAULT_SETTINGS: Record<Profile, ProfileSettings> = {
  road: { profile: 'road', avoidMainRoads: false },
  gravel: { profile: 'gravel', offroadPreference: 80, avoidMainRoads: false },
  mtb: { profile: 'mtb', avoidMainRoads: false },
};

/** MTB's fixed off-road preference: the slider's maximum. */
export const MTB_OFFROAD = 100;
const NEUTRAL_OFFROAD = 50;

/** How off-road the profile wants to go (0–100), or undefined for road, which has no such setting. */
export function offroadPreference(settings: ProfileSettings): number | undefined {
  if (settings.profile === 'road') return undefined;
  if (settings.profile === 'mtb') return MTB_OFFROAD;
  return settings.offroadPreference ?? NEUTRAL_OFFROAD;
}
