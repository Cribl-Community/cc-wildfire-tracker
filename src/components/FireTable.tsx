import { useMemo, useState, type ComponentProps } from 'react';
import { EmptyState, Pill, Table, Text, defineColumns } from '@capra/core';
import { formatAcres, formatDate, formatNumber, formatPercent, formatRelative, typeLabel } from '../format.ts';
import type { Fire } from '../types.ts';
import type { HostTheme } from '../host-theme.ts';

type TableProps = ComponentProps<typeof Table>;
type SortDescriptor = NonNullable<TableProps['sortDescriptor']>;
type Selection = NonNullable<TableProps['selectedKeys']>;

type Row = {
  id: string;
  name: string;
  state: string;
  acres: number | null;
  contained: number | null;
  discoveredAt: number | null;
  personnel: number | null;
  modifiedAt: number | null;
  status: string;
  type: string;
};

interface Props {
  fires: Fire[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  theme: HostTheme;
  loading: boolean;
}

function containmentAppearance(contained: number | null, status: string): 'danger' | 'warning' | 'success' | 'default' | 'info' {
  if (status === 'contained') return 'success';
  if (contained === null) return 'default';
  if (contained < 25) return 'danger';
  if (contained < 75) return 'warning';
  return 'info';
}

const columns = defineColumns<Row>([
  {
    id: 'name',
    label: 'Incident',
    allowsSorting: true,
    render(value, row) {
      return (
        <div className="table-name">
          <Text variant="body-sm-semibold" as="div">
            {value as string}
          </Text>
          <Text variant="body-xs-normal" color="secondary" as="div">
            {typeLabel(row.type)}
          </Text>
        </div>
      );
    },
  },
  { id: 'state', label: 'State', allowsSorting: true },
  {
    id: 'acres',
    label: 'Acres',
    allowsSorting: true,
    render(value) {
      return <span className="num">{formatAcres(value as number | null)}</span>;
    },
  },
  {
    id: 'contained',
    label: 'Contained',
    allowsSorting: true,
    render(value, row) {
      const v = value as number | null;
      return (
        <Pill appearance={containmentAppearance(v, row.status)} variant="muted">
          {row.status === 'contained' ? 'Contained' : formatPercent(v)}
        </Pill>
      );
    },
  },
  {
    id: 'discoveredAt',
    label: 'Discovered',
    allowsSorting: true,
    render(value) {
      return formatDate(value as number | null);
    },
  },
  {
    id: 'personnel',
    label: 'Personnel',
    allowsSorting: true,
    render(value) {
      return <span className="num">{formatNumber(value as number | null)}</span>;
    },
  },
  {
    id: 'modifiedAt',
    label: 'Updated',
    allowsSorting: true,
    render(value) {
      return formatRelative(value as number | null);
    },
  },
]);

const VISIBLE: Array<keyof Row> = ['name', 'state', 'acres', 'contained', 'discoveredAt', 'personnel', 'modifiedAt'];

function compare(a: Row, b: Row, column: keyof Row): number {
  const av = a[column];
  const bv = b[column];
  if (av === bv) return 0;
  if (av === null || av === undefined) return 1;
  if (bv === null || bv === undefined) return -1;
  if (typeof av === 'number' && typeof bv === 'number') return av - bv;
  return String(av).localeCompare(String(bv));
}

export function FireTable({ fires, selectedId, onSelect, theme, loading }: Props) {
  const [sort, setSort] = useState<SortDescriptor>({ column: 'acres', direction: 'descending' });

  const rows = useMemo<Row[]>(() => {
    const list: Row[] = fires.map((f) => ({
      id: f.id,
      name: f.name,
      state: f.state ?? '--',
      acres: f.acres,
      contained: f.contained,
      discoveredAt: f.discoveredAt,
      personnel: f.personnel,
      modifiedAt: f.modifiedAt,
      status: f.status,
      type: f.type,
    }));
    const col = String(sort.column) as keyof Row;
    list.sort((a, b) => {
      // Missing values always sink to the bottom regardless of direction.
      const an = a[col] === null || a[col] === undefined;
      const bn = b[col] === null || b[col] === undefined;
      if (an !== bn) return an ? 1 : -1;
      const c = compare(a, b, col);
      return sort.direction === 'descending' ? -c : c;
    });
    return list;
  }, [fires, sort]);

  const selectedKeys = useMemo<Selection>(() => new Set(selectedId ? [selectedId] : []), [selectedId]);

  if (!loading && fires.length === 0) {
    return (
      <div className="table-empty">
        <EmptyState
          illustration="Sandcastle"
          theme={theme}
          title="No incidents match"
          description="Loosen the filters or pick a different state to see fires here."
        />
      </div>
    );
  }

  return (
    <div className="fire-table">
      <Table
        columns={columns}
        visibleColumns={VISIBLE}
        items={rows}
        density="compact"
        isLoading={loading}
        sortDescriptor={sort}
        onSortChange={setSort}
        selectionMode="single"
        selectedKeys={selectedKeys}
        onSelectionChange={(keys) => {
          if (keys === 'all') return;
          const first = keys.values().next().value;
          onSelect(first !== undefined ? String(first) : null);
        }}
        aria-label={`Incidents (${fires.length})`}
      />
      <Text variant="body-xs-normal" color="subtle" as="div">
        {fires.length === 1 ? '1 incident' : `${fires.length} incidents`} · select a row to drill in
      </Text>
    </div>
  );
}
