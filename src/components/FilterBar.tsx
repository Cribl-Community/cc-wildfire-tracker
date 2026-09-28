import { Button, SelectField, Switch, TextField, ToggleButtonGroup, type Key } from '@capra/core';
import { SearchOutlined } from '@capra/icons';
import { USPS_TO_NAME } from '../geo.ts';
import type { Filters, StatusFilter, TypeFilter } from '../types.ts';

interface Props {
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
  onReset: () => void;
  /** Number of incidents per state (unfiltered), so the state picker can show counts. */
  stateCounts: Map<string, number>;
}

const ACRES_OPTIONS = [
  { id: '0', label: 'Any size' },
  { id: '10', label: '10+ acres' },
  { id: '100', label: '100+ acres' },
  { id: '1000', label: '1,000+ acres' },
  { id: '10000', label: '10,000+ acres' },
  { id: '100000', label: '100,000+ acres' },
];

export function FilterBar({ filters, onChange, onReset, stateCounts }: Props) {
  const stateItems = [
    { id: '__all', label: 'All states' },
    ...Object.entries(USPS_TO_NAME)
      .filter(([code]) => stateCounts.has(code))
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([code, name]) => ({ id: code, label: `${name} (${stateCounts.get(code) ?? 0})` })),
  ];

  const isDefault =
    filters.state === null &&
    filters.type === 'wildfire' &&
    filters.status === 'active' &&
    filters.minAcres === 0 &&
    filters.query === '';

  return (
    <div className="filter-bar" role="search" aria-label="Filter incidents">
      <div className="filter-bar__field filter-bar__field--grow">
        <TextField
          aria-label="Search incidents by name"
          placeholder="Search by incident name"
          leadingSlot={<SearchOutlined size="sm" />}
          value={filters.query}
          onChange={(v) => onChange({ query: v })}
        />
      </div>
      <div className="filter-bar__field">
        <SelectField
          aria-label="State"
          placeholder="All states"
          items={stateItems}
          canSearch
          searchPlaceholder="Find a state"
          value={filters.state ?? '__all'}
          onChange={(key) => onChange({ state: key === null || key === '__all' ? null : String(key) })}
        />
      </div>
      <div className="filter-bar__field">
        <SelectField
          aria-label="Minimum size"
          items={ACRES_OPTIONS}
          value={String(filters.minAcres)}
          onChange={(key) => onChange({ minAcres: Number(key ?? 0) })}
        />
      </div>
      <ToggleButtonGroup
        aria-label="Incident type"
        size="md"
        disallowEmptySelection
        selectedKeys={new Set<Key>([filters.type])}
        onSelectionChange={(keys) => {
          const first = keys.values().next().value;
          if (first) onChange({ type: String(first) as TypeFilter });
        }}
        items={[
          { key: 'wildfire', text: 'Wildfires' },
          { key: 'prescribed', text: 'Prescribed' },
          { key: 'all', text: 'All' },
        ]}
      />
      <ToggleButtonGroup
        aria-label="Status"
        size="md"
        disallowEmptySelection
        selectedKeys={new Set<Key>([filters.status])}
        onSelectionChange={(keys) => {
          const first = keys.values().next().value;
          if (first) onChange({ status: String(first) as StatusFilter });
        }}
        items={[
          { key: 'active', text: 'Active' },
          { key: 'contained', text: 'Contained' },
          { key: 'all', text: 'All' },
        ]}
      />
      <label className="filter-bar__switch">
        <Switch
          aria-label="Show perimeters"
          checked={filters.showPerimeters}
          onChange={(e) => onChange({ showPerimeters: e.target.checked })}
        />
        <span>Perimeters</span>
      </label>
      {!isDefault && (
        <Button variant="tertiary" size="md" onClick={onReset}>
          Reset
        </Button>
      )}
    </div>
  );
}
