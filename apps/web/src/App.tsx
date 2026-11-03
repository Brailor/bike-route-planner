import { MapView } from './map/MapView';
import { useRouting } from './routing/useRouting';
import { useUndoShortcuts } from './state/useUndoShortcuts';
import { useFlagPersistence } from './storage/useFlagPersistence';
import { Sidebar } from './ui/Sidebar';

export function App() {
  useRouting();
  useUndoShortcuts();
  useFlagPersistence();
  return (
    <div className="app">
      <MapView />
      <Sidebar />
    </div>
  );
}
