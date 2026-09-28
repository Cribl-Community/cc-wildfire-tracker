// Backend endpoint: current fire perimeters as GeoJSON.
//
// Without a query string it returns every current perimeter, generalized so the whole set stays
// around half a megabyte (the raw layer is well over 8 MB). With `?irwinId=<IRWIN id>` it returns
// that single fire's perimeter at full precision for the drill-down view.
import {
  PERIMETERS_LAYER,
  PERIMETERS_SOURCE,
  errorResponse,
  json,
  queryGeoJson,
  sqlString,
} from './nifc.js';

const OUT_FIELDS = [
  'attr_IrwinID',
  'poly_IncidentName',
  'poly_GISAcres',
  'poly_DateCurrent',
  'poly_MapMethod',
  'poly_FeatureCategory',
  'attr_PercentContained',
];

export async function onRequest(request: Request, _context: { appId: string }): Promise<Response> {
  let irwinId: string | null = null;
  try {
    irwinId = new URL(request.url, 'http://localhost').searchParams.get('irwinId');
  } catch {
    irwinId = null;
  }
  // Scheduled or POSTed invocations may carry the id in a JSON body instead.
  if (!irwinId && request.method === 'POST') {
    try {
      const body = (await request.json()) as { irwinId?: string } | null;
      irwinId = body?.irwinId ?? null;
    } catch {
      /* no body */
    }
  }

  try {
    const params: Record<string, string> = {
      outFields: OUT_FIELDS.join(','),
      returnGeometry: 'true',
      outSR: '4326',
    };
    if (irwinId) {
      params.where = `attr_IrwinID=${sqlString(irwinId)}`;
      params.geometryPrecision = '5';
    } else {
      params.where = '1=1';
      params.geometryPrecision = '3';
      params.maxAllowableOffset = '0.002';
    }
    const collection = await queryGeoJson(PERIMETERS_LAYER, params);
    // Trim property names down so the frontend does not have to know the attr_/poly_ prefixes.
    const features = collection.features
      .filter((f) => f.geometry)
      .map((f) => ({
        type: 'Feature' as const,
        id: String(f.properties.attr_IrwinID ?? f.id ?? ''),
        geometry: f.geometry,
        properties: {
          irwinId: f.properties.attr_IrwinID ?? null,
          name: f.properties.poly_IncidentName ?? null,
          gisAcres: f.properties.poly_GISAcres ?? null,
          dateCurrent: f.properties.poly_DateCurrent ?? null,
          mapMethod: f.properties.poly_MapMethod ?? null,
          category: f.properties.poly_FeatureCategory ?? null,
          contained: f.properties.attr_PercentContained ?? null,
        },
      }));
    return json({
      fetchedAt: new Date().toISOString(),
      source: PERIMETERS_SOURCE,
      detail: irwinId ? 'full' : 'generalized',
      count: features.length,
      geojson: { type: 'FeatureCollection', features },
    });
  } catch (err) {
    console.error('[perimeters] failed:', err);
    return errorResponse(err instanceof Error ? err.message : String(err));
  }
}
