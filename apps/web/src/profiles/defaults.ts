import type { Profile, ProfileSettings } from '../types';

export const PROFILES: readonly Profile[] = ['road', 'gravel', 'mtb'];

export const PROFILE_LABELS: Record<Profile, string> = {
  road: 'Road',
  gravel: 'Gravel',
  mtb: 'MTB',
};

// Gravel defaults towards unpaved: the base model is road-like (gravel spike, finding 1).
export const DEFAULT_SETTINGS: Record<Profile, ProfileSettings> = {
  road: { profile: 'road', avoidMainRoads: false },
  gravel: { profile: 'gravel', offroadPreference: 80, avoidMainRoads: false },
  mtb: { profile: 'mtb', offroadPreference: 60, avoidMainRoads: false },
};
