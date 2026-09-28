import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMatch, useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Breadcrumb, Breadcrumbs, Button, Spinner, Text, Tooltip } from '@capra/core';
import { Fire as FireIcon, ReloadOutlined } from '@capra/icons';
import { FilterBar } from './components/FilterBar.tsx';
import { FireDrawer } from './components/FireDrawer.tsx';
import { FireMap, type MapFocus } from './components/FireMap.tsx';
import { FireTable } from './components/FireTable.tsx';
import { StatTiles } from './components/StatTiles.tsx';
import { formatDateTime, formatRelative } from './format.ts';
import { stateName } from './geo.ts';
import type { HostTheme } from './host-theme.ts';
import { useFilterPrefs } from './hooks/usePrefs.ts';
import { useWildfireData } from './hooks/useWildfireData.ts';
import { isInsideCribl } from './api.ts';
import type { Fire, Filters, PerimeterFeature } from './types.ts';

interface AppProps {
  theme: HostTheme;
}

function applyFilters(fires: Fire[], f: Filters): Fire[] {
  const q = f.query.trim().toLowerCase();
  return fires.filter((fire) => {
    if (f.state && fire.state !== f.state) return false;
    if (f.type === 'wildfire' && fire.type === 'RX') return false;
    if (f.type === 'prescribed' && fire.type !== 'RX') return false;
    if (f.status !== 'all' && fire.status !== f.status) return false;
    if (f.minAcres > 0 && (fire.acres ?? 0) < f.minAcres) return false;
    if (q && !fire.name.toLowerCase().includes(q) && !(fire.uid ?? '').toLowerCase().includes(q)) return false;
    return true;
  });
}

/** Ticks once a minute so "updated 3m ago" labels stay honest. */
function useNowTicker(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function Tracker({ theme }: AppProps) {
  const navigate = useNavigate();
  // One component for every route: switching between `/` and `/fire/:id` must not remount the page
  // (that would refetch the feed and reset the map), so the fire id is read from the URL here.
  const fireMatch = useMatch('/fire/:id');
  const selectedId = fireMatch?.params.id ? decodeURIComponent(fireMatch.params.id) : null;
  const [searchParams, setSearchParams] = useSearchParams();
  const data = useWildfireData();
  const { filters, setFilters, resetFilters } = useFilterPrefs({ state: searchParams.get('state') });
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [detailPerimeter, setDetailPerimeter] = useState<PerimeterFeature | null>(null);
  const now = useNowTicker();

  // Keep ?state= in the URL so the platform's URL sync and browser history reflect the drill-down.
  useEffect(() => {
    const cur = searchParams.get('state');
    if ((filters.state ?? null) === (cur ?? null)) return;
    const next = new URLSearchParams(searchParams);
    if (filters.state) next.set('state', filters.state);
    else next.delete('state');
    setSearchParams(next, { replace: true });
  }, [filters.state, searchParams, setSearchParams]);

  const filtered = useMemo(() => applyFilters(data.fires, filters), [data.fires, filters]);
  const filteredIds = useMemo(() => new Set(filtered.map((f) => f.id)), [filtered]);

  const selectedFire = useMemo(() => data.fires.find((f) => f.id === selectedId) ?? null, [data.fires, selectedId]);

  // Markers on the map: the filtered set, plus the selected fire even if filters would hide it.
  const mapFires = useMemo(() => {
    if (selectedFire && !filteredIds.has(selectedFire.id)) return [...filtered, selectedFire];
    return filtered;
  }, [filtered, filteredIds, selectedFire]);

  const mapPerimeters = useMemo(() => {
    if (!filters.showPerimeters) return [];
    return data.perimeters.filter((p) => filteredIds.has(p.id) || p.id === selectedId);
  }, [data.perimeters, filteredIds, filters.showPerimeters, selectedId]);

  const stateCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of data.fires) if (f.state) m.set(f.state, (m.get(f.state) ?? 0) + 1);
    return m;
  }, [data.fires]);

  const withSearch = useCallback(
    (path: string) => {
      const qs = searchParams.toString();
      return qs ? `${path}?${qs}` : path;
    },
    [searchParams],
  );

  const selectFire = useCallback(
    (id: string | null) => {
      if (!id) {
        navigate(withSearch('/'));
        return;
      }
      navigate(withSearch(`/fire/${encodeURIComponent(id)}`));
      setFocus({ kind: 'fire', key: id, nonce: Date.now() });
    },
    [navigate, withSearch],
  );

  const selectState = useCallback(
    (usps: string | null) => {
      setFilters({ state: usps });
      setFocus(usps ? { kind: 'state', key: usps, nonce: Date.now() } : { kind: 'reset', key: '', nonce: Date.now() });
    },
    [setFilters],
  );

  const zoomToFire = useCallback((id: string) => setFocus({ kind: 'fire', key: id, nonce: Date.now() }), []);
  const onDetailPerimeter = useCallback((p: PerimeterFeature | null) => setDetailPerimeter(p), []);

  // When the page loads directly on /fire/:id, focus the map once data is in.
  useEffect(() => {
    if (selectedId && !data.loading && selectedFire && focus === null) {
      setFocus({ kind: 'fire', key: selectedId, nonce: Date.now() });
    }
  }, [selectedId, data.loading, selectedFire, focus]);

  const crumbs = (
    <Breadcrumbs aria-label="Drill-down">
      <Breadcrumb onPress={() => selectState(null)} href={filters.state || selectedFire ? '#' : undefined}>
        United States
      </Breadcrumb>
      {filters.state && (
        <Breadcrumb
          onPress={() => selectFire(null)}
          href={selectedFire ? '#' : undefined}
        >
          {stateName(filters.state)}
        </Breadcrumb>
      )}
      {selectedFire && <Breadcrumb>{selectedFire.name}</Breadcrumb>}
    </Breadcrumbs>
  );

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header__title">
          <span className="page-header__icon" aria-hidden="true">
            <FireIcon size="md" />
          </span>
          <div className="page-header__text">
            <Text variant="heading-md" as="h1">
              Wild Fire Tracker
            </Text>
            <Text variant="body-sm-normal" color="secondary" as="div">
              Live US wildland fire incidents from NIFC, refreshed every 5 minutes
            </Text>
          </div>
        </div>
        <div className="page-header__meta">
          <Text variant="body-xs-normal" color="subtle" as="div">
            {data.fetchedAt ? (
              <Tooltip title={`Fetched ${formatDateTime(data.fetchedAt)}`}>
                <span role="status">Updated {formatRelative(data.fetchedAt, now)}</span>
              </Tooltip>
            ) : data.error ? (
              'Feed unavailable'
            ) : (
              'Loading feed…'
            )}
          </Text>
          <Button
            variant="secondary"
            size="sm"
            leadingIcon={ReloadOutlined}
            pending={data.refreshing}
            onClick={data.refresh}
          >
            Refresh
          </Button>
        </div>
      </header>

      {!isInsideCribl() && !import.meta.env.DEV && (
        <Alert appearance="danger" title="Open this app from Cribl">
          The wildfire feed is served by this app's Cribl backend endpoints, which are only reachable inside the Cribl UI.
        </Alert>
      )}
      {data.error && (
        <Alert
          appearance="danger"
          title="Could not load incidents"
          action={{ label: 'Retry', onClick: data.refresh }}
        >
          {data.error}
        </Alert>
      )}
      {!data.error && data.perimeterError && (
        <Alert appearance="warning" title="Perimeters unavailable" onDismiss>
          Incident points loaded, but perimeter polygons could not be fetched: {data.perimeterError}
        </Alert>
      )}

      <div className="page-crumbs">{crumbs}</div>

      <StatTiles fires={filtered} total={data.fires.length} now={now} />

      <FilterBar filters={filters} onChange={setFilters} onReset={() => { resetFilters(); setFocus({ kind: 'reset', key: '', nonce: Date.now() }); }} stateCounts={stateCounts} />

      <div className="content">
        <section className="content__map" aria-label="Map">
          {data.loading ? (
            <div className="map-loading">
              <Spinner size="lg" title="Loading wildfire incidents from NIFC" />
            </div>
          ) : (
            <FireMap
              fires={mapFires}
              perimeters={mapPerimeters}
              detailPerimeter={detailPerimeter && detailPerimeter.id === selectedId ? detailPerimeter : null}
              selectedId={selectedId}
              focusState={filters.state}
              focus={focus}
              onSelectFire={(id) => selectFire(id)}
              onSelectState={selectState}
            />
          )}
        </section>
        <section className="content__list" aria-label="Incident list">
          <FireTable fires={filtered} selectedId={selectedId} onSelect={selectFire} theme={theme} loading={data.loading} />
        </section>
      </div>

      <footer className="page-footer">
        <Text variant="body-xs-normal" color="subtle">
          Source: {data.source ?? 'NIFC WFIGS'} via this app's Cribl backend endpoints. Containment and acreage are as reported by incident
          commanders through IRWIN and can lag the situation on the ground.
        </Text>
      </footer>

      <FireDrawer
        fire={selectedFire}
        isOpen={selectedId !== null}
        onClose={() => selectFire(null)}
        onZoomTo={zoomToFire}
        onDetailPerimeter={onDetailPerimeter}
      />
    </div>
  );
}

export default function App({ theme }: AppProps) {
  return <Tracker theme={theme} />;
}
