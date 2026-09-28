// Geography helpers: US state lookup tables and GeoJSON winding-order repair for d3-geo.
import { geoArea } from 'd3-geo';

/** FIPS state code -> USPS abbreviation (50 states + DC + territories in us-atlas). */
export const FIPS_TO_USPS: Record<string, string> = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO', '09': 'CT', '10': 'DE',
  '11': 'DC', '12': 'FL', '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN', '19': 'IA',
  '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME', '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN',
  '28': 'MS', '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH', '34': 'NJ', '35': 'NM',
  '36': 'NY', '37': 'NC', '38': 'ND', '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI',
  '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT', '50': 'VT', '51': 'VA', '53': 'WA',
  '54': 'WV', '55': 'WI', '56': 'WY', '60': 'AS', '66': 'GU', '69': 'MP', '72': 'PR', '78': 'VI',
};

export const USPS_TO_NAME: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
  CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky',
  LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota',
  OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia',
  WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', AS: 'American Samoa',
  GU: 'Guam', MP: 'Northern Mariana Islands', PR: 'Puerto Rico', VI: 'U.S. Virgin Islands',
};

export const USPS_TO_FIPS: Record<string, string> = Object.fromEntries(
  Object.entries(FIPS_TO_USPS).map(([fips, usps]) => [usps, fips]),
);

export function stateName(usps: string | null | undefined): string {
  if (!usps) return 'Unknown';
  return USPS_TO_NAME[usps] ?? usps;
}

const HEMISPHERE = 2 * Math.PI;

function ringArea(ring: GeoJSON.Position[]): number {
  return geoArea({ type: 'Polygon', coordinates: [ring] });
}

/**
 * d3-geo treats polygons as spherical: exterior rings must be wound clockwise and holes the other
 * way, otherwise the polygon is interpreted as "everything except this shape". ArcGIS emits about a
 * quarter of the NIFC perimeters the wrong way round, so fix them in place before rendering.
 */
function rewindPolygon(rings: GeoJSON.Position[][]): GeoJSON.Position[][] {
  return rings.map((ring, i) => {
    const a = ringArea(ring);
    const isExterior = i === 0;
    const needsFlip = isExterior ? a > HEMISPHERE : a < HEMISPHERE;
    return needsFlip ? [...ring].reverse() : ring;
  });
}

export function rewindFeature<P>(
  f: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, P>,
): GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, P> {
  if (!f.geometry) return f;
  if (f.geometry.type === 'Polygon') {
    return { ...f, geometry: { type: 'Polygon', coordinates: rewindPolygon(f.geometry.coordinates) } };
  }
  return {
    ...f,
    geometry: { type: 'MultiPolygon', coordinates: f.geometry.coordinates.map(rewindPolygon) },
  };
}
