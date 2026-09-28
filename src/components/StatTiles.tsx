import { Text } from '@capra/core';
import { formatAcres, formatCompact, formatNumber } from '../format.ts';
import type { Fire } from '../types.ts';

interface Props {
  /** Fires after the current filters are applied. */
  fires: Fire[];
  /** Every fire the feed returned, for the "of N" context. */
  total: number;
  /** Current time, owned by the parent so renders stay pure. */
  now: number;
}

function sum(fires: Fire[], pick: (f: Fire) => number | null): number {
  let s = 0;
  for (const f of fires) s += pick(f) ?? 0;
  return s;
}

export function StatTiles({ fires, total, now }: Props) {
  const active = fires.filter((f) => f.status === 'active');
  const acres = sum(active, (f) => f.acres);
  const personnel = sum(active, (f) => f.personnel);
  const newThisWeek = fires.filter((f) => f.discoveredAt && now - f.discoveredAt < 7 * 86_400_000).length;
  const large = active.filter((f) => (f.acres ?? 0) >= 1000).length;

  const tiles: Array<{ label: string; value: string; hint: string }> = [
    { label: 'Active fires', value: formatNumber(active.length), hint: `of ${formatNumber(total)} tracked incidents` },
    { label: 'Acres burning', value: formatAcres(acres, { compact: true }), hint: 'reported size of active fires' },
    { label: 'Large fires', value: formatNumber(large), hint: '1,000+ acres, not yet contained' },
    { label: 'Personnel assigned', value: formatCompact(personnel), hint: 'on active incidents' },
    { label: 'New this week', value: formatNumber(newThisWeek), hint: 'discovered in the last 7 days' },
  ];

  return (
    <div className="stat-tiles" role="list" aria-label="Summary statistics">
      {tiles.map((t) => (
        <div className="stat-tile" role="listitem" key={t.label}>
          <Text variant="body-sm-normal" color="secondary" as="div">
            {t.label}
          </Text>
          <Text variant="metric-lg" as="div">
            {t.value}
          </Text>
          <Text variant="body-xs-normal" color="subtle" as="div">
            {t.hint}
          </Text>
        </div>
      ))}
    </div>
  );
}
