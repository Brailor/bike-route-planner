import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { LonLat } from '../types';
import { LocateButton } from './LocateButton';

/** Renders the button with each fix held back until `answer` is called. */
function setup() {
  let answer: (p: LonLat | undefined) => void = () => {};
  const locate = vi.fn(() => new Promise<LonLat | undefined>((resolve) => (answer = resolve)));
  const onLocated = vi.fn();
  render(
    <div>
      <p>elsewhere</p>
      <LocateButton locate={locate} onLocated={onLocated} />
    </div>,
  );
  const button = screen.getByRole('button', { name: 'Go to my location' });
  const respond = (p: LonLat | undefined) =>
    act(async () => {
      answer(p);
      await Promise.resolve(); // let the button's await run inside act
    });
  return { button, locate, onLocated, respond };
}

describe('LocateButton', () => {
  it('finds the user and hands over where they are', async () => {
    const { button, locate, onLocated, respond } = setup();
    await userEvent.click(button);
    expect(locate).toHaveBeenCalledOnce();
    expect(onLocated).not.toHaveBeenCalled();
    await respond([15.44, 47.07]);
    expect(onLocated).toHaveBeenCalledExactlyOnceWith([15.44, 47.07]);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('is busy, and takes no second click, while finding the user', async () => {
    const { button, locate, respond } = setup();
    await userEvent.click(button);
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(button);
    expect(locate).toHaveBeenCalledOnce();
    await respond([15.44, 47.07]);
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute('aria-busy', 'false');
  });

  it('says so when the browser can’t tell, until the next try', async () => {
    const { button, onLocated, respond } = setup();
    await userEvent.click(button);
    await respond(undefined);
    expect(onLocated).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t find your location');
    await userEvent.click(button);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await respond([15.44, 47.07]);
    expect(onLocated).toHaveBeenCalledOnce();
  });

  it('drops the note on a click away or Escape', async () => {
    const { button, respond } = setup();
    await userEvent.click(button);
    await respond(undefined);
    await userEvent.click(screen.getByRole('alert'));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await userEvent.click(screen.getByText('elsewhere'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await userEvent.click(button);
    await respond(undefined);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
