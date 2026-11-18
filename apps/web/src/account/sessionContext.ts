import { createContext } from 'react';

/** The logged-in user and how to log out; undefined where the server has no accounts. */
export const SessionContext = createContext<
  { username: string; logOut: () => Promise<void> } | undefined
>(undefined);
