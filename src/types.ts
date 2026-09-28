import type { Incident } from '../backend/incidents.ts';

export type { Incident };

export interface IncidentsResponse {
  fetchedAt: string;
  source: string;
  count: number;
  incidents: Incident[];
}

export interface PerimeterProperties {
  irwinId: string | null;
  name: string | null;
  gisAcres: number | null;
  dateCurrent: number | null;
  mapMethod: string | null;
  category: string | null;
  contained: number | null;
}

export type PerimeterFeature = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, PerimeterProperties> & {
  id: string;
};

export interface PerimetersResponse {
  fetchedAt: string;
  source: string;
  detail: 'full' | 'generalized';
  count: number;
  geojson: GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, PerimeterProperties>;
}

export type FireStatus = 'active' | 'contained';

/** Derived, UI-facing view of an incident. */
export interface Fire extends Incident {
  status: FireStatus;
  /** Whether a current perimeter polygon exists for this fire. */
  hasPerimeter: boolean;
}

export type TypeFilter = 'wildfire' | 'prescribed' | 'all';
export type StatusFilter = 'active' | 'contained' | 'all';

export interface Filters {
  state: string | null;
  type: TypeFilter;
  status: StatusFilter;
  minAcres: number;
  query: string;
  showPerimeters: boolean;
}

export const DEFAULT_FILTERS: Filters = {
  state: null,
  type: 'wildfire',
  status: 'active',
  minAcres: 0,
  query: '',
  showPerimeters: true,
};
