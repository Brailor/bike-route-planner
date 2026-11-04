// Why a loop ranks where it does, in a few words for its card (README M3).
import type { LoopScore } from './score';

export interface Highlights {
  good: string[];
  bad: string[];
}

/** Parts at least this good are worth saying; at most this bad, worth warning about. */
const GOOD = 0.7;
const BAD = 0.4;
/** Variety below this means a noticeable part is ridden twice. */
const REPEATS = 0.85;

export function loopHighlights(score: LoopScore): Highlights {
  const good: string[] = [];
  const bad: string[] = [];
  if (score.usesFlag) bad.push('Uses a flagged section: no way around it');
  if (score.intervalOnDescent) bad.push('An interval falls on a descent');
  if (score.intervals !== undefined) {
    if (score.intervals >= GOOD) good.push('Intervals fit the terrain');
    else if (score.intervals <= BAD) bad.push('Intervals cut by stops or descents');
  }
  if (score.flow >= GOOD) good.push('Long stretches without stops');
  else if (score.flow <= BAD && score.intervals === undefined) bad.push('Many stops');
  if (score.surface >= GOOD) good.push('Your preferred surface');
  if (score.variety < REPEATS) bad.push('Partly out and back');
  return { good, bad };
}
