import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { createSessionApi, type Session, type SessionApi } from './session';
import { SessionContext } from './sessionContext';

const defaultApi = createSessionApi();
const reload = () => window.location.reload();

/**
 * Shows the app once the user is logged in, or right away where there are no accounts. Logging out reloads the page,
 * so nothing of this user's route stays on screen for the next one.
 */
export function SessionGate({
  children,
  api = defaultApi,
  onLoggedOut = reload,
}: {
  children: ReactNode;
  api?: SessionApi;
  onLoggedOut?: () => void;
}) {
  const [session, setSession] = useState<Session>();

  useEffect(() => {
    let current = true;
    void api.check().then((s) => current && setSession(s));
    return () => {
      current = false;
    };
  }, [api]);

  if (!session) return null;
  if (session.kind === 'out') return <LoginForm api={api} onLoggedIn={setSession} />;
  const account =
    session.kind === 'in'
      ? {
          username: session.username,
          logOut: async () => {
            await api.logOut();
            onLoggedOut();
          },
        }
      : undefined;
  return <SessionContext value={account}>{children}</SessionContext>;
}

function LoginForm({ api, onLoggedIn }: { api: SessionApi; onLoggedIn: (s: Session) => void }) {
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(undefined);
    try {
      // Text inputs: their values are strings.
      const session = await api.logIn(
        form.get('username') as string,
        form.get('password') as string,
      );
      if (session) return onLoggedIn(session);
      setError('Wrong username or password.');
    } catch {
      setError('Can’t log in right now. Try again in a moment.');
    }
    setBusy(false);
  }

  return (
    <main className="login">
      <form className="login__form" onSubmit={(e) => void submit(e)}>
        <h1>Route planner</h1>
        <label className="field">
          Username
          <input name="username" autoComplete="username" autoCapitalize="none" required />
        </label>
        <label className="field">
          Password
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        {error && (
          <p className="status status--error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="button button--primary" disabled={busy}>
          Log in
        </button>
      </form>
    </main>
  );
}
