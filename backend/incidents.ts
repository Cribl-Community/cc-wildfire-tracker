// Backend endpoint: current US wildland fire incidents.
//
// Pulls every incident in NIFC's "Current" incident-locations layer, normalizes the ~100 IRWIN
// attributes down to the fields the UI needs, and returns them as one JSON document. The frontend
// calls this on load and every few minutes; NIFC refreshes the upstream layer continuously.
import {
  INCIDENTS_LAYER,
  INCIDENTS_SOURCE,
  errorResponse,
  json,
  queryAllFeatures,
} from './nifc.js';

/** The IRWIN attributes we ask ArcGIS for. Keep this list in sync with `normalize()`. */
const OUT_FIELDS = [
  'IrwinID',
  'UniqueFireIdentifier',
  'IncidentName',
  'IncidentTypeCategory',
  'POOState',
  'POOCounty',
  'POOCity',
  'InitialLatitude',
  'InitialLongitude',
  'IncidentSize',
  'DiscoveryAcres',
  'PercentContained',
  'FireCause',
  'FireCauseGeneral',
  'FireDiscoveryDateTime',
  'ModifiedOnDateTime_dt',
  'ContainmentDateTime',
  'ControlDateTime',
  'FireOutDateTime',
  'TotalIncidentPersonnel',
  'GACC',
  'FireBehaviorGeneral',
  'IncidentShortDescription',
  'PredominantFuelGroup',
  'EstimatedCostToDate',
  'IncidentManagementOrganization',
  'IncidentComplexityLevel',
  'POOLandownerCategory',
  'POOProtectingAgency',
  'POOJurisdictionalAgency',
  'DispatchCenterID',
  'CpxName',
  'IsCpxChild',
];

type Attrs = Record<string, string | number | null | undefined>;

export interface Incident {
  id: string;
  uid: string | null;
  name: string;
  type: string;
  state: string | null;
  county: string | null;
  city: string | null;
  lat: number;
  lon: number;
  acres: number | null;
  discoveryAcres: number | null;
  contained: number | null;
  cause: string | null;
  causeDetail: string | null;
  discoveredAt: number | null;
  modifiedAt: number | null;
  containedAt: number | null;
  controlledAt: number | null;
  outAt: number | null;
  personnel: number | null;
  gacc: string | null;
  behavior: string | null;
  description: string | null;
  fuel: string | null;
  costToDate: number | null;
  managementOrg: string | null;
  complexity: string | null;
  landowner: string | null;
  protectingAgency: string | null;
  jurisdiction: string | null;
  dispatchCenter: string | null;
  complexName: string | null;
  isComplexChild: boolean;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** POOState arrives as `US-CA`; the UI wants the bare USPS code. */
function stateCode(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  return s.startsWith('US-') ? s.slice(3) : s;
}

function normalize(attrs: Attrs, geometry: { x: number; y: number } | null | undefined): Incident | null {
  const id = str(attrs.IrwinID);
  const lon = num(geometry?.x) ?? num(attrs.InitialLongitude);
  const lat = num(geometry?.y) ?? num(attrs.InitialLatitude);
  if (!id || lon === null || lat === null) return null;
  return {
    id,
    uid: str(attrs.UniqueFireIdentifier),
    name: str(attrs.IncidentName) ?? 'Unnamed incident',
    type: str(attrs.IncidentTypeCategory) ?? 'WF',
    state: stateCode(attrs.POOState),
    county: str(attrs.POOCounty),
    city: str(attrs.POOCity),
    lat,
    lon,
    acres: num(attrs.IncidentSize),
    discoveryAcres: num(attrs.DiscoveryAcres),
    contained: num(attrs.PercentContained),
    cause: str(attrs.FireCause),
    causeDetail: str(attrs.FireCauseGeneral),
    discoveredAt: num(attrs.FireDiscoveryDateTime),
    modifiedAt: num(attrs.ModifiedOnDateTime_dt),
    containedAt: num(attrs.ContainmentDateTime),
    controlledAt: num(attrs.ControlDateTime),
    outAt: num(attrs.FireOutDateTime),
    personnel: num(attrs.TotalIncidentPersonnel),
    gacc: str(attrs.GACC),
    behavior: str(attrs.FireBehaviorGeneral),
    description: str(attrs.IncidentShortDescription),
    fuel: str(attrs.PredominantFuelGroup),
    costToDate: num(attrs.EstimatedCostToDate),
    managementOrg: str(attrs.IncidentManagementOrganization),
    complexity: str(attrs.IncidentComplexityLevel),
    landowner: str(attrs.POOLandownerCategory),
    protectingAgency: str(attrs.POOProtectingAgency),
    jurisdiction: str(attrs.POOJurisdictionalAgency),
    dispatchCenter: str(attrs.DispatchCenterID),
    complexName: str(attrs.CpxName),
    isComplexChild: attrs.IsCpxChild === 1,
  };
}

export async function onRequest(_request: Request, _context: { appId: string }): Promise<Response> {
  try {
    const features = await queryAllFeatures<Attrs>(INCIDENTS_LAYER, {
      where: '1=1',
      outFields: OUT_FIELDS.join(','),
      returnGeometry: 'true',
      outSR: '4326',
      orderByFields: 'IncidentSize DESC',
    });
    const incidents: Incident[] = [];
    for (const f of features) {
      const inc = normalize(f.attributes, f.geometry);
      if (inc) incidents.push(inc);
    }
    return json({
      fetchedAt: new Date().toISOString(),
      source: INCIDENTS_SOURCE,
      count: incidents.length,
      incidents,
    });
  } catch (err) {
    console.error('[incidents] failed:', err);
    return errorResponse(err instanceof Error ? err.message : String(err));
  }
}
