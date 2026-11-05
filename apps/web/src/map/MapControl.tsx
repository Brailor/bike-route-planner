import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useControl, type ControlPosition } from 'react-map-gl/maplibre';

/** React content as a maplibre control, so it stacks with the map's own controls in a corner. */
export function MapControl({
  position,
  children,
}: {
  position: ControlPosition;
  children: ReactNode;
}) {
  const [container] = useState(() => {
    const div = document.createElement('div');
    div.className = 'maplibregl-ctrl';
    return div;
  });
  useControl(() => ({ onAdd: () => container, onRemove: () => container.remove() }), { position });
  return createPortal(children, container);
}
