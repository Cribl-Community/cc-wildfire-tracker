const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });

export function formatAcres(value: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (value === null || value === undefined) return '--';
  if (value < 1) return value < 0.1 ? '<0.1' : value.toFixed(1);
  return opts.compact ? compact.format(value) : whole.format(value);
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '--';
  return whole.format(value);
}

export function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined) return '--';
  return compact.format(value);
}

export function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined) return '--';
  return usd.format(value);
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '--';
  return `${Math.round(value)}%`;
}

const dateTime = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});
const dateOnly = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export function formatDateTime(ms: number | null | undefined): string {
  if (!ms) return '--';
  return dateTime.format(new Date(ms));
}

export function formatDate(ms: number | null | undefined): string {
  if (!ms) return '--';
  return dateOnly.format(new Date(ms));
}

/** "3h ago", "2d ago", "just now". */
export function formatRelative(ms: number | null | undefined, now: number = Date.now()): string {
  if (!ms) return '--';
  const diff = Math.max(0, now - ms);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 60) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  return `${mo}mo ago`;
}

export function formatCoords(lat: number, lon: number): string {
  return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}

export const TYPE_LABELS: Record<string, string> = {
  WF: 'Wildfire',
  RX: 'Prescribed burn',
  CX: 'Complex',
};

export function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type;
}
