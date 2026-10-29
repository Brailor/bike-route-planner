import { fireEvent, render, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { usePlanner } from './store';
import { useUndoShortcuts } from './useUndoShortcuts';

const waypoints = () => usePlanner.getState().waypoints;

describe('useUndoShortcuts', () => {
  beforeEach(() => {
    usePlanner.getState().addWaypoint([16, 48]);
    usePlanner.getState().addWaypoint([17, 48]);
  });

  it.each([
    ['Ctrl+Z', { key: 'z', ctrlKey: true }],
    ['⌘Z', { key: 'z', metaKey: true }],
  ])('undoes with %s', (_, keys) => {
    renderHook(() => useUndoShortcuts());
    fireEvent.keyDown(window, keys);
    expect(waypoints()).toHaveLength(1);
  });

  it.each([
    ['Ctrl+Shift+Z', { key: 'Z', ctrlKey: true, shiftKey: true }],
    ['⌘⇧Z', { key: 'z', metaKey: true, shiftKey: true }],
    ['Ctrl+Y', { key: 'y', ctrlKey: true }],
  ])('redoes with %s', (_, keys) => {
    renderHook(() => useUndoShortcuts());
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    fireEvent.keyDown(window, keys);
    expect(waypoints()).toHaveLength(2);
  });

  it('stops the browser from handling the shortcut itself', () => {
    renderHook(() => useUndoShortcuts());
    const event = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('ignores plain Z, Alt combinations and other keys', () => {
    renderHook(() => useUndoShortcuts());
    fireEvent.keyDown(window, { key: 'z' });
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, altKey: true });
    fireEvent.keyDown(window, { key: 'x', ctrlKey: true });
    expect(waypoints()).toHaveLength(2);
  });

  it('leaves undo inside text fields to the browser', () => {
    renderHook(() => useUndoShortcuts());
    const { getByRole } = render(<input type="text" aria-label="note" />);
    fireEvent.keyDown(getByRole('textbox'), { key: 'z', ctrlKey: true });
    expect(waypoints()).toHaveLength(2);
  });

  it('still works while the slider has focus', () => {
    renderHook(() => useUndoShortcuts());
    const { getByRole } = render(<input type="range" />);
    fireEvent.keyDown(getByRole('slider'), { key: 'z', ctrlKey: true });
    expect(waypoints()).toHaveLength(1);
  });

  it('stops listening when unmounted', () => {
    const { unmount } = renderHook(() => useUndoShortcuts());
    unmount();
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(waypoints()).toHaveLength(2);
  });
});
