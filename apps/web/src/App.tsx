import { useContext } from 'react';
import { SessionContext } from './account/sessionContext';
import { useFlagTrace } from './flags/useFlagTrace';
import { useLoopSearch } from './loops/useLoopSearch';
import { MapView } from './map/MapView';
import { useRouting } from './routing/useRouting';
import { useUndoShortcuts } from './state/useUndoShortcuts';
import { OPEN_LIST, usePersistedList } from './storage/usePersistedList';
import { useSettingsPersistence } from './storage/useSettingsPersistence';
import { useTrackCorrection } from './track/useTrackCorrection';
import { useTrackRoads } from './track/useTrackRoads';
import { Sidebar } from './ui/Sidebar';

export function App() {
  useRouting();
  useUndoShortcuts();
  // Logged in, flags and saved routes live on the server; where there are no accounts (pnpm dev), in this browser.
  const lists = OPEN_LIST[useContext(SessionContext) ? 'account' : 'browser'];
  usePersistedList('flags', lists.flags);
  usePersistedList('routes', lists.routes);
  useSettingsPersistence();
  useFlagTrace();
  useLoopSearch();
  useTrackCorrection();
  useTrackRoads();
  return (
    <div className="app">
      <MapView />
      <Sidebar />
    </div>
  );
}
