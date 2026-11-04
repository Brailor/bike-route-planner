import { useFlagTrace } from './flags/useFlagTrace';
import { MapView } from './map/MapView';
import { useRouting } from './routing/useRouting';
import { useUndoShortcuts } from './state/useUndoShortcuts';
import { useFlagPersistence } from './storage/useFlagPersistence';
import { useSettingsPersistence } from './storage/useSettingsPersistence';
import { Sidebar } from './ui/Sidebar';

export function App() {
  useRouting();
  useUndoShortcuts();
  useFlagPersistence();
  useSettingsPersistence();
  useFlagTrace();
  return (
    <div className="app">
      <MapView />
      <Sidebar />
    </div>
  );
}
