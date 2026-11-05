import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { backgrounds } from '../map/layers';
import { LayerSwitcher } from './LayerSwitcher';

function setup({ hillshade = false } = {}) {
  const onBackground = vi.fn();
  const onHillshade = vi.fn();
  render(
    <div>
      <p>elsewhere</p>
      <LayerSwitcher
        offered={backgrounds(undefined)}
        background="topo"
        hillshade={hillshade}
        onBackground={onBackground}
        onHillshade={onHillshade}
      />
    </div>,
  );
  const toggle = screen.getByRole('button', { name: 'Map layers' });
  return { toggle, onBackground, onHillshade };
}

describe('LayerSwitcher', () => {
  it('opens on the button, showing the backgrounds on offer with the current one chosen', async () => {
    const { toggle } = setup();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const group = screen.getByRole('group', { name: 'Background' });
    expect(group).toBeInTheDocument();
    expect(screen.getAllByRole('radio').map((r) => r.closest('label')?.textContent)).toEqual([
      'Map',
      'Cycling',
      'Topo',
    ]);
    expect(screen.getByRole('radio', { name: 'Topo' })).toBeChecked();
  });

  it('switches the background and the hillshade, and stays open for more changes', async () => {
    const { toggle, onBackground, onHillshade } = setup();
    await userEvent.click(toggle);
    await userEvent.click(screen.getByRole('radio', { name: 'Cycling' }));
    expect(onBackground).toHaveBeenCalledExactlyOnceWith('cycling');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Hillshade' }));
    expect(onHillshade).toHaveBeenCalledExactlyOnceWith(true);
    expect(screen.getByRole('group', { name: 'Background' })).toBeInTheDocument();
  });

  it('shows the hillshade as on when it is', async () => {
    const { toggle } = setup({ hillshade: true });
    await userEvent.click(toggle);
    expect(screen.getByRole('checkbox', { name: 'Hillshade' })).toBeChecked();
  });

  it('closes on the button again, on Escape, and on a click elsewhere', async () => {
    const { toggle } = setup();
    const isOpen = () => screen.queryByRole('group', { name: 'Background' }) !== null;
    await userEvent.click(toggle);
    await userEvent.click(toggle);
    expect(isOpen()).toBe(false);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(toggle);
    await userEvent.keyboard('{Escape}');
    expect(isOpen()).toBe(false);

    await userEvent.click(toggle);
    await userEvent.click(screen.getByText('elsewhere'));
    expect(isOpen()).toBe(false);
  });
});
