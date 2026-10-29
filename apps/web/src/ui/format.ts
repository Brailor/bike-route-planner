export const formatDistance = (m: number) =>
  m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;

export const formatElevation = (m: number) => `${Math.round(m)} m`;

export function formatDuration(s: number): string {
  const totalMin = Math.round(s / 60);
  const h = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  return h ? `${h} h ${String(min).padStart(2, '0')} min` : `${min} min`;
}

export const formatPercent = (fraction: number) => `${Math.round(fraction * 100)}%`;
