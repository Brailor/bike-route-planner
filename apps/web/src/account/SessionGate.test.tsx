import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AccountLine } from './AccountLine';
import type { Session, SessionApi } from './session';
import { SessionGate } from './SessionGate';

function setup(session: Session, overrides: Partial<SessionApi> = {}) {
  const logIn = vi.fn(() => Promise.resolve<Session | undefined>({ kind: 'in', username: 'anna' }));
  const logOut = vi.fn(() => Promise.resolve());
  const api: SessionApi = { check: () => Promise.resolve(session), logIn, logOut, ...overrides };
  const onLoggedOut = vi.fn();
  render(
    <SessionGate api={api} onLoggedOut={onLoggedOut}>
      <p>the app</p>
      <AccountLine />
    </SessionGate>,
  );
  return { logIn, logOut, onLoggedOut };
}

async function logIn(password = 'secret') {
  await userEvent.type(await screen.findByLabelText('Username'), 'anna');
  await userEvent.type(screen.getByLabelText('Password'), password);
  await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
}

describe('SessionGate', () => {
  it('shows the app without a login where there are no accounts', async () => {
    setup({ kind: 'none' });
    expect(await screen.findByText('the app')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument();
  });

  it('asks for a login, and shows the app once logged in', async () => {
    const { logIn: sent } = setup({ kind: 'out' });
    await logIn();
    expect(sent).toHaveBeenCalledWith('anna', 'secret');
    expect(await screen.findByText('the app')).toBeInTheDocument();
    expect(screen.getByText('Logged in as anna')).toBeInTheDocument();
  });

  it('says when the password is wrong, or the server is down, and lets the user try again', async () => {
    const answers: (() => Promise<Session | undefined>)[] = [
      () => Promise.resolve(undefined),
      () => Promise.reject(new Error('Login failed (502)')),
    ];
    setup({ kind: 'out' }, { logIn: vi.fn(() => answers.shift()!()) });
    await logIn('wrong');
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong username or password.');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Can’t log in right now');
    expect(screen.getByRole('button', { name: 'Log in' })).toBeEnabled();
    expect(screen.queryByText('the app')).not.toBeInTheDocument();
  });

  it('logs out and then reloads the page', async () => {
    const { logOut, onLoggedOut } = setup({ kind: 'in', username: 'anna' });
    await userEvent.click(await screen.findByRole('button', { name: 'Log out' }));
    expect(logOut).toHaveBeenCalledOnce();
    expect(onLoggedOut).toHaveBeenCalledOnce();
  });

  it('stays logged in, and says so, when logging out fails', async () => {
    const { onLoggedOut } = setup(
      { kind: 'in', username: 'anna' },
      { logOut: () => Promise.reject(new Error('Logout failed (502)')) },
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Log out' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Can’t log out right now');
    expect(onLoggedOut).not.toHaveBeenCalled();
  });
});
