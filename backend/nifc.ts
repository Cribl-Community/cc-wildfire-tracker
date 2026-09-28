// Shared helpers for the NIFC (National Interagency Fire Center) WFIGS ArcGIS feature services.
// Both backend endpoints import from here; `apps build` inlines this file into each bundle.
//
// WFIGS = Wildland Fire Interagency Geospatial Services. The "Current" layers hold incidents that
// are still being tracked by IRWIN (Integrated Reporting of Wildland-Fire Information) and are
// refreshed by NIFC every few minutes. No API key is required.

export const NIFC_HOST = 'https://services3.arcgis.com';
const SERVICE_ROOT = `${NIFC_HOST}/T4QMspbfLg3qTGWY/arcgis/rest/services`;

export const INCIDENTS_LAYER = `${SERVICE_ROOT}/WFIGS_Incident_Locations_Current/FeatureServer/0`;
export const PERIMETERS_LAYER = `${SERVICE_ROOT}/WFIGS_Interagency_Perimeters_Current/FeatureServer/0`;

export const INCIDENTS_SOURCE = 'NIFC WFIGS Current Wildland Fire Locations';
export const PERIMETERS_SOURCE = 'NIFC WFIGS Current Interagency Fire Perimeters';

/** Max features one ArcGIS query may return; the layer advertises 2000. */
const PAGE_SIZE = 2000;

/** JSON response envelope used by every endpoint in this app. */
export function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...extraHeaders },
  });
}

export function errorResponse(message: string, status = 502): Response {
  return json({ error: message }, status);
}

/** Quote a string for an ArcGIS SQL `where` clause. */
export function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export interface ArcGisFeature<A = Record<string, unknown>> {
  attributes: A;
  geometry?: { x: number; y: number } | null;
}

interface ArcGisJsonResponse<A> {
  features?: ArcGisFeature<A>[];
  exceededTransferLimit?: boolean;
  error?: { code: number; message: string; details?: string[] };
}

/**
 * Run an ArcGIS `query` against a layer and follow `exceededTransferLimit` pagination until
 * every matching feature is collected. Returns Esri JSON features (`f=json`).
 */
export async function queryAllFeatures<A>(
  layerUrl: string,
  params: Record<string, string>,
): Promise<ArcGisFeature<A>[]> {
  const out: ArcGisFeature<A>[] = [];
  let offset = 0;
  for (let page = 0; page < 20; page++) {
    const search = new URLSearchParams({
      f: 'json',
      resultOffset: String(offset),
      resultRecordCount: String(PAGE_SIZE),
      ...params,
    });
    const res = await fetch(`${layerUrl}/query?${search.toString()}`, { headers: { accept: 'application/json' } });
    if (!res.ok) {
      throw new Error(`NIFC responded ${res.status} ${res.statusText}`);
    }
    const body = (await res.json()) as ArcGisJsonResponse<A>;
    if (body.error) {
      throw new Error(`NIFC query error ${body.error.code}: ${body.error.message}`);
    }
    const features = body.features ?? [];
    out.push(...features);
    if (!body.exceededTransferLimit || features.length === 0) break;
    offset += features.length;
  }
  return out;
}

/** Fetch a GeoJSON FeatureCollection from an ArcGIS layer (`f=geojson`), following pagination. */
export async function queryGeoJson(
  layerUrl: string,
  params: Record<string, string>,
): Promise<GeoJsonFeatureCollection> {
  const features: GeoJsonFeature[] = [];
  let offset = 0;
  for (let page = 0; page < 20; page++) {
    const search = new URLSearchParams({
      f: 'geojson',
      resultOffset: String(offset),
      resultRecordCount: String(PAGE_SIZE),
      ...params,
    });
    const res = await fetch(`${layerUrl}/query?${search.toString()}`, { headers: { accept: 'application/json' } });
    if (!res.ok) {
      throw new Error(`NIFC responded ${res.status} ${res.statusText}`);
    }
    const body = (await res.json()) as GeoJsonFeatureCollection & {
      error?: { code: number; message: string };
      properties?: { exceededTransferLimit?: boolean };
    };
    if (body.error) {
      throw new Error(`NIFC query error ${body.error.code}: ${body.error.message}`);
    }
    const page_ = body.features ?? [];
    features.push(...page_);
    if (!body.properties?.exceededTransferLimit || page_.length === 0) break;
    offset += page_.length;
  }
  return { type: 'FeatureCollection', features };
}

export interface GeoJsonFeature {
  type: 'Feature';
  id?: string | number;
  geometry: { type: string; coordinates: unknown } | null;
  properties: Record<string, unknown>;
}

export interface GeoJsonFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
}
