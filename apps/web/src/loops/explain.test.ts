import { describe, expect, it } from 'vitest';
import { loopHighlights } from './explain';
import type { LoopScore } from './score';

const score = (over: Partial<LoopScore> = {}): LoopScore => ({
  total: 0.6,
  time: 0.9,
  intervals: 0.5,
  flow: 0.5,
  surface: 0.5,
  variety: 1,
  usesFlag: false,
  intervalOnDescent: false,
  ...over,
});

describe('loopHighlights', () => {
  it('says nothing about middling parts', () => {
    expect(loopHighlights(score())).toEqual({ good: [], bad: [] });
  });

  it('names the strong parts', () => {
    expect(loopHighlights(score({ intervals: 0.8, flow: 0.9, surface: 0.7 })).good).toEqual([
      'Intervals fit the terrain',
      'Long stretches without stops',
      'Your preferred surface',
    ]);
  });

  it('warns about flags first, then weak intervals and repeats', () => {
    expect(
      loopHighlights(
        score({ usesFlag: true, intervalOnDescent: true, intervals: 0.3, variety: 0.7 }),
      ).bad,
    ).toEqual([
      'Uses a flagged section: no way around it',
      'An interval falls on a descent',
      'Intervals cut by stops or descents',
      'Partly out and back',
    ]);
  });

  it('warns about stops only for rides without hard intervals (the interval part covers them otherwise)', () => {
    expect(loopHighlights(score({ intervals: undefined, flow: 0.2 })).bad).toEqual(['Many stops']);
    expect(loopHighlights(score({ intervals: 0.5, flow: 0.2 })).bad).toEqual([]);
  });
});
