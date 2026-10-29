import { MapView } from './map/MapView';
import { useRouting } from './routing/useRouting';
import { useUndoShortcuts } from './state/useUndoShortcuts';
import { Sidebar } from './ui/Sidebar';

export function App() {
  useRouting();
  useUndoShortcuts();
  return (
    <div className="app">
      <MapView />
      <Sidebar />
    </div>
  );
}
