// Thin client for this app's backend endpoints and KV store.
//
// Inside Cribl, `fetch()` to CRIBL_API_URL is proxied by the shell, which injects auth. The backend
// endpoints live at /api/v1/a/{appId}/endpoints/{name}. When the page is opened outside Cribl (a bare
// `vite` tab during development) there is no shell, so in DEV builds we fall back to running the
// handler modules in the browser: NIFC's ArcGIS services allow CORS, so the same code works there.
import type { IncidentsResponse, PerimetersResponse } from './types.ts';

function apiBase(): string | null {
  return window.CRIBL_API_URL ?? null;
}

/**
 * The installed app id. The mount path (`/app-ui/<appId>`) is authoritative: the Vite scaffold bakes
 * `window.CRIBL_APP_ID = '__dev__<name>'` into index.html even for production builds, which is only
 * right under Live Preview (where the mount path is the placeholder `__local__`).
 */
function appId(): string {
  const segs = (window.CRIBL_BASE_PATH ?? '').split('/').filter(Boolean);
  const fromPath = segs[segs.length - 1];
  if (fromPath && fromPath !== '__local__') return fromPath;
  return window.CRIBL_APP_ID ?? fromPath ?? '';
}

export function isInsideCribl(): boolean {
  return apiBase() !== null;
}

export function endpointUrl(name: string, query?: Record<string, string>): string {
  const qs = query ? `?${new URLSearchParams(query).toString()}` : '';
  return `${apiBase()}/a/${appId()}/endpoints/${name}${qs}`;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const msg =
      (body && typeof body === 'object' && 'error' in body && typeof (body as { error: unknown }).error === 'string'
        ? (body as { error: string }).error
        : null) ?? `${res.status} ${res.statusText}`;
    throw new ApiError(msg, res.status);
  }
  // A backend handler that returned an error envelope with a 200 would still land here.
  if (body && typeof body === 'object' && 'error' in body && typeof (body as { error: unknown }).error === 'string') {
    throw new ApiError((body as { error: string }).error, res.status);
  }
  return body as T;
}

const RETRY_DELAYS_MS = [1500, 4000];

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const id = window.setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      window.clearTimeout(id);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });
}

async function invokeEndpoint<T>(name: string, query?: Record<string, string>, signal?: AbortSignal): Promise<T> {
  if (isInsideCribl()) {
    // The platform occasionally answers 502/503 while a backend deployment is still settling;
    // retry briefly before surfacing the error.
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(endpointUrl(name, query), { signal, headers: { accept: 'application/json' } });
      const retryable = res.status === 502 || res.status === 503 || res.status === 504;
      if (!retryable || attempt >= RETRY_DELAYS_MS.length) return parseJsonResponse<T>(res);
      await sleep(RETRY_DELAYS_MS[attempt], signal);
    }
  }
  if (import.meta.env.DEV) {
    // Standalone dev fallback: run the backend handler in the browser.
    const mod =
      name === 'incidents'
        ? await import('../backend/incidents.ts')
        : name === 'perimeters'
          ? await import('../backend/perimeters.ts')
          : null;
    if (!mod) throw new ApiError(`Unknown endpoint ${name}`, 404);
    const qs = query ? `?${new URLSearchParams(query).toString()}` : '';
    const res = await mod.onRequest(new Request(`http://localhost/endpoints/${name}${qs}`), { appId: '__dev__' });
    return parseJsonResponse<T>(res);
  }
  throw new ApiError('This app must run inside Cribl to reach its backend endpoints.', 0);
}

export function fetchIncidents(signal?: AbortSignal): Promise<IncidentsResponse> {
  return invokeEndpoint<IncidentsResponse>('incidents', undefined, signal);
}

export function fetchPerimeters(signal?: AbortSignal): Promise<PerimetersResponse> {
  return invokeEndpoint<PerimetersResponse>('perimeters', undefined, signal);
}

export function fetchPerimeterFor(irwinId: string, signal?: AbortSignal): Promise<PerimetersResponse> {
  return invokeEndpoint<PerimetersResponse>('perimeters', { irwinId }, signal);
}

// ---- KV store (per-app; used only for user preferences) ----------------------------------------

function kvUrl(key: string): string {
  return `${apiBase()}/kvstore/${key}`;
}

export async function kvGet<T>(key: string): Promise<T | null> {
  if (!isInsideCribl()) return null;
  try {
    const res = await fetch(kvUrl(key), { headers: { accept: 'application/json' } });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const text = await res.text();
    if (!text) return null;
    const parsed: unknown = JSON.parse(text);
    // Some platform versions wrap the stored value as { value: ... }.
    if (parsed && typeof parsed === 'object' && 'value' in parsed && Object.keys(parsed).length === 1) {
      const inner = (parsed as { value: unknown }).value;
      return (typeof inner === 'string' ? (JSON.parse(inner) as T) : (inner as T)) ?? null;
    }
    return parsed as T;
  } catch {
    return null;
  }
}

export async function kvSet(key: string, value: unknown): Promise<boolean> {
  if (!isInsideCribl()) return false;
  try {
    const res = await fetch(kvUrl(key), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(value),
    });
    return res.ok;
  } catch {
    return false;
  }
}
