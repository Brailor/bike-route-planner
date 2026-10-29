import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { usePlanner } from '../state/store';

const initialPlannerState = usePlanner.getState();

afterEach(() => {
  // Vitest globals are off, so Testing Library can't register its own cleanup.
  cleanup();
  // The store is a module singleton; reset it so tests don't leak state into each other.
  usePlanner.setState(initialPlannerState, true);
});
