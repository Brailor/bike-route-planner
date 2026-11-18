import { useContext, useState } from 'react';
import { SessionContext } from './sessionContext';

/** Who is logged in, with a way out; nothing where the server has no accounts. */
export function AccountLine() {
  const account = useContext(SessionContext);
  const [failed, setFailed] = useState(false);
  if (!account) return null;
  return (
    <div className="account">
      <span>Logged in as {account.username}</span>
      <button
        type="button"
        className="button"
        onClick={() => {
          setFailed(false);
          account.logOut().catch(() => setFailed(true));
        }}
      >
        Log out
      </button>
      {failed && (
        <p className="status status--error" role="alert">
          Can’t log out right now. Try again in a moment.
        </p>
      )}
    </div>
  );
}
