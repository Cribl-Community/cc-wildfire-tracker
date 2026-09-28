import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchIncidents, fetchPerimeters } from '../api.ts';
import { rewindFeature } from '../geo.ts';
import type { Fire, Incident, PerimeterFeature } from '../types.ts';

export const REFRESH_INTERVAL_MS = 5 * 60_000;

export interface WildfireData {
  fires: Fire[];
  perimeters: PerimeterFeature[];
  perimetersById: Map<string, PerimeterFeature>;
  fetchedAt: number | null;
  source: string | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  perimeterError: string | null;
  refresh: () => void;
}

function toFire(inc: Incident, hasPerimeter: boolean): Fire {
  const contained = inc.contained ?? null;
  const status = inc.outAt || (contained !== null && contained >= 100) ? 'contained' : 'active';
  return { ...inc, status, hasPerimeter };
}

/**
 * Loads incidents and perimeters from the backend endpoints, joins them, and re-polls every
 * REFRESH_INTERVAL_MS while the tab is visible.
 */
export function useWildfireData(): WildfireData {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [perimeters, setPerimeters] = useState<PerimeterFeature[]>([]);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [perimeterError, setPerimeterError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (isFirst: boolean) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    if (isFirst) setLoading(true);
    else setRefreshing(true);

    // Sequential on purpose: the platform's backend runtime serves one invocation per app at a
    // time, and firing both endpoints together makes the second fail with "already in flight".
    const incRes = await Promise.allSettled([fetchIncidents(controller.signal)]).then((r) => r[0]);
    if (controller.signal.aborted) return;
    const perRes = await Promise.allSettled([fetchPerimeters(controller.signal)]).then((r) => r[0]);
    if (controller.signal.aborted) return;

    if (incRes.status === 'fulfilled') {
      setIncidents(incRes.value.incidents);
      setFetchedAt(Date.parse(incRes.value.fetchedAt) || Date.now());
      setSource(incRes.value.source);
      setError(null);
    } else {
      setError(incRes.reason instanceof Error ? incRes.reason.message : String(incRes.reason));
    }

    if (perRes.status === 'fulfilled') {
      const feats = perRes.value.geojson.features
        .filter((f): f is PerimeterFeature => !!f.geometry && typeof f.id === 'string' && f.id !== '')
        .map((f) => rewindFeature(f) as PerimeterFeature);
      setPerimeters(feats);
      setPerimeterError(null);
    } else {
      setPerimeterError(perRes.reason instanceof Error ? perRes.reason.message : String(perRes.reason));
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void load(true);
    return () => abortRef.current?.abort();
  }, [load]);

  // Manual refresh bumps `tick`; the interval only fires when the document is visible.
  useEffect(() => {
    if (tick > 0) void load(false);
  }, [tick, load]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') setTick((t) => t + 1);
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  const perimetersById = useMemo(() => {
    const m = new Map<string, PerimeterFeature>();
    for (const f of perimeters) m.set(f.id, f);
    return m;
  }, [perimeters]);

  const fires = useMemo(() => incidents.map((inc) => toFire(inc, perimetersById.has(inc.id))), [incidents, perimetersById]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  return { fires, perimeters, perimetersById, fetchedAt, source, loading, refreshing, error, perimeterError, refresh };
}
