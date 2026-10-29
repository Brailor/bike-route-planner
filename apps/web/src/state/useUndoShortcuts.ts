import { useEffect } from 'react';
import { usePlanner } from './store';

/** Text fields keep their own native undo. */
function isTextField(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target instanceof HTMLTextAreaElement) return true;
  return (
    target instanceof HTMLInputElement &&
    !['range', 'checkbox', 'radio', 'button'].includes(target.type)
  );
}

/** Ctrl/Cmd+Z undoes a waypoint edit; Ctrl/Cmd+Shift+Z and Ctrl+Y redo it. */
export function useUndoShortcuts() {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || isTextField(e.target)) return;
      const key = e.key.toLowerCase();
      const { undo, redo } = usePlanner.getState();
      if (key === 'z' && !e.shiftKey) undo();
      else if ((key === 'z' && e.shiftKey) || (key === 'y' && !e.shiftKey)) redo();
      else return;
      e.preventDefault();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
