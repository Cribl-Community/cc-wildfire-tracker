import { useCallback, useEffect, useRef, useState } from 'react';
import { kvGet, kvSet } from '../api.ts';
import { DEFAULT_FILTERS, type Filters } from '../types.ts';

const KV_KEY = 'prefs/filters';
const SAVE_DEBOUNCE_MS = 800;

/** Only the fields worth remembering between sessions; `state` and `query` are transient. */
type StoredPrefs = Pick<Filters, 'type' | 'status' | 'minAcres' | 'showPerimeters'>;

function isStoredPrefs(v: unknown): v is Partial<StoredPrefs> {
  return !!v && typeof v === 'object';
}

/**
 * Filter state backed by the app-scoped KV store (per AGENTS.md, browser storage is unreliable in
 * the sandboxed iframe). Loads once on mount and debounces writes.
 */
export function useFilterPrefs(initial: Partial<Filters> = {}) {
  const [filters, setFiltersState] = useState<Filters>({ ...DEFAULT_FILTERS, ...initial });
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<number | null>(null);
  const dirty = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void kvGet<Partial<StoredPrefs>>(KV_KEY).then((stored) => {
      if (cancelled) return;
      if (isStoredPrefs(stored)) {
        setFiltersState((cur) => ({
          ...cur,
          type: stored.type ?? cur.type,
          status: stored.status ?? cur.status,
          minAcres: typeof stored.minAcres === 'number' ? stored.minAcres : cur.minAcres,
          showPerimeters: typeof stored.showPerimeters === 'boolean' ? stored.showPerimeters : cur.showPerimeters,
        }));
      }
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!loaded || !dirty.current) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    const snapshot: StoredPrefs = {
      type: filters.type,
      status: filters.status,
      minAcres: filters.minAcres,
      showPerimeters: filters.showPerimeters,
    };
    saveTimer.current = window.setTimeout(() => void kvSet(KV_KEY, snapshot), SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [filters.type, filters.status, filters.minAcres, filters.showPerimeters, loaded]);

  const setFilters = useCallback((patch: Partial<Filters> | ((cur: Filters) => Partial<Filters>)) => {
    dirty.current = true;
    setFiltersState((cur) => ({ ...cur, ...(typeof patch === 'function' ? patch(cur) : patch) }));
  }, []);

  const resetFilters = useCallback(() => {
    dirty.current = true;
    setFiltersState({ ...DEFAULT_FILTERS });
  }, []);

  return { filters, setFilters, resetFilters, prefsLoaded: loaded };
}
