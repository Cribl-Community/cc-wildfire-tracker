import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { IconButton, Text, Tooltip } from '@capra/core';
import { ArrowsMinimize, ZoomIn, ZoomOut } from '@capra/icons';
import { geoAlbersUsa, geoPath, type GeoPermissibleObjects } from 'd3-geo';
import { select } from 'd3-selection';
import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
import 'd3-transition';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import statesTopo from 'us-atlas/states-10m.json';
import { FIPS_TO_USPS, USPS_TO_FIPS, stateName } from '../geo.ts';
import { formatAcres, formatPercent, formatRelative, typeLabel } from '../format.ts';
import type { Fire, PerimeterFeature } from '../types.ts';

type StateFeature = GeoJSON.Feature<GeoJSON.Geometry, { name: string }> & { id: string };
type CountyFeature = GeoJSON.Feature<GeoJSON.Geometry, { name: string }> & { id: string };

const topo = statesTopo as unknown as Topology<{ states: GeometryCollection<{ name: string }>; nation: GeometryCollection }>;
const STATES = (feature(topo, topo.objects.states) as GeoJSON.FeatureCollection<GeoJSON.Geometry, { name: string }>)
  .features as StateFeature[];
const NATION = feature(topo, topo.objects.nation) as GeoJSON.FeatureCollection;

const MIN_ZOOM = 1;
const MAX_ZOOM = 64;
/** County outlines are only useful once zoomed well past the national view. */
const COUNTY_ZOOM = 4;

export interface MapFocus {
  /** Zoom to a state (USPS code) or a fire (IRWIN id). */
  kind: 'state' | 'fire' | 'reset';
  key: string;
  /** Changes every time the caller wants the map to re-focus, even on the same key. */
  nonce: number;
}

interface Props {
  fires: Fire[];
  perimeters: PerimeterFeature[];
  /** Full-precision perimeter of the selected fire, once it has loaded. */
  detailPerimeter: PerimeterFeature | null;
  selectedId: string | null;
  focusState: string | null;
  focus: MapFocus | null;
  onSelectFire: (id: string) => void;
  onSelectState: (usps: string | null) => void;
}

interface Hover {
  fire: Fire;
  x: number;
  y: number;
}

/** Marker radius in screen pixels, from acreage. Kept constant on screen across zoom levels. */
function markerRadius(acres: number | null): number {
  if (!acres || acres <= 0) return 3.5;
  return Math.max(3.5, Math.min(22, 2.5 + Math.sqrt(acres) / 10));
}

function markerClass(fire: Fire): string {
  if (fire.type === 'RX') return 'fire-marker fire-marker--rx';
  if (fire.status === 'contained') return 'fire-marker fire-marker--contained';
  const c = fire.contained;
  if (c === null) return 'fire-marker fire-marker--unknown';
  if (c < 25) return 'fire-marker fire-marker--critical';
  if (c < 75) return 'fire-marker fire-marker--partial';
  return 'fire-marker fire-marker--mostly';
}

export function FireMap({
  fires,
  perimeters,
  detailPerimeter,
  selectedId,
  focusState,
  focus,
  onSelectFire,
  onSelectState,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [size, setSize] = useState({ width: 960, height: 600 });
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);
  const [hover, setHover] = useState<Hover | null>(null);
  const [counties, setCounties] = useState<CountyFeature[] | null>(null);

  // Track the container size so the projection always fits the panel. Measure synchronously on
  // mount (ResizeObserver callbacks only run once the document gets a rendering opportunity, which
  // a hidden tab never does) and then follow resizes.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const apply = (width: number, height: number) => {
      if (width > 0 && height > 0) {
        setSize((cur) => (cur.width === width && cur.height === height ? cur : { width, height }));
      }
    };
    const rect = el.getBoundingClientRect();
    apply(rect.width, rect.height);
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) apply(r.width, r.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const projection = useMemo(
    () => geoAlbersUsa().fitExtent([[12, 12], [size.width - 12, size.height - 12]], NATION),
    [size.width, size.height],
  );
  const path = useMemo(() => geoPath(projection), [projection]);

  const statePaths = useMemo(
    () => STATES.map((f) => ({ id: f.id, usps: FIPS_TO_USPS[f.id] ?? f.id, name: f.properties.name, d: path(f) ?? '' })),
    [path],
  );

  const projected = useMemo(() => {
    const out: Array<{ fire: Fire; x: number; y: number; r: number }> = [];
    for (const fire of fires) {
      const p = projection([fire.lon, fire.lat]);
      if (!p) continue; // outside the Albers USA insets (e.g. territories)
      out.push({ fire, x: p[0], y: p[1], r: markerRadius(fire.acres) });
    }
    // Draw big fires first so small ones stay clickable on top.
    out.sort((a, b) => b.r - a.r);
    return out;
  }, [fires, projection]);

  const perimeterPaths = useMemo(
    () => perimeters.map((f) => ({ id: f.id, d: path(f as GeoPermissibleObjects) ?? '' })).filter((p) => p.d),
    [perimeters, path],
  );
  const detailPath = useMemo(
    () => (detailPerimeter ? (path(detailPerimeter as GeoPermissibleObjects) ?? '') : ''),
    [detailPerimeter, path],
  );

  // Lazy-load county outlines the first time the user zooms in far enough.
  useEffect(() => {
    if (counties !== null || transform.k < COUNTY_ZOOM) return;
    let cancelled = false;
    void import('us-atlas/counties-10m.json').then((mod) => {
      if (cancelled) return;
      const t = (mod.default ?? mod) as unknown as Topology<{ counties: GeometryCollection<{ name: string }> }>;
      const fc = feature(t, t.objects.counties) as GeoJSON.FeatureCollection<GeoJSON.Geometry, { name: string }>;
      setCounties(fc.features as CountyFeature[]);
    });
    return () => {
      cancelled = true;
    };
  }, [transform.k, counties]);

  // Project every county once per projection; then only draw the ones inside the viewport.
  const countyGeometry = useMemo(() => {
    if (!counties) return [];
    return counties.map((c) => ({ id: c.id, d: path(c) ?? '', bounds: path.bounds(c) }));
  }, [counties, path]);

  const countyPaths = useMemo(() => {
    if (countyGeometry.length === 0 || transform.k < COUNTY_ZOOM) return [];
    const [vx0, vy0] = transform.invert([0, 0]);
    const [vx1, vy1] = transform.invert([size.width, size.height]);
    const fips = focusState ? USPS_TO_FIPS[focusState] : null;
    return countyGeometry.filter((c) => {
      if (fips && !c.id.startsWith(fips)) return false;
      const [[x0, y0], [x1, y1]] = c.bounds;
      return x1 >= vx0 && x0 <= vx1 && y1 >= vy0 && y0 <= vy1;
    });
  }, [countyGeometry, focusState, transform, size.width, size.height]);

  // d3-zoom drives the <g> transform; React renders from state.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const z = zoom<SVGSVGElement, unknown>()
      .scaleExtent([MIN_ZOOM, MAX_ZOOM])
      .translateExtent([[-size.width * 0.5, -size.height * 0.5], [size.width * 1.5, size.height * 1.5]])
      .filter((event: Event) => {
        const target = event.target as Element | null;
        if (target?.closest('.map-controls')) return false;
        // The map sits in the middle of a scrolling page, so a bare wheel must keep scrolling the
        // page. Zoom with ctrl/cmd + wheel (or trackpad pinch, which browsers report as ctrl+wheel).
        if (event.type === 'wheel') {
          const w = event as WheelEvent;
          return w.ctrlKey || w.metaKey;
        }
        // d3's default: primary button only, no ctrl-click (context menu on macOS).
        if (event.type === 'mousedown') return (event as MouseEvent).button === 0 && !(event as MouseEvent).ctrlKey;
        return true;
      })
      .on('zoom', (event) => setTransform(event.transform));
    zoomRef.current = z;
    select(svg).call(z);
    return () => {
      select(svg).on('.zoom', null);
    };
  }, [size.width, size.height]);

  const animateTo = useCallback((t: ZoomTransform) => {
    const svg = svgRef.current;
    const z = zoomRef.current;
    if (!svg || !z) return;
    select(svg).transition().duration(600).call(z.transform, t);
  }, []);

  const zoomToBounds = useCallback(
    (bounds: [[number, number], [number, number]], maxScale = MAX_ZOOM, padding = 0.85) => {
      const [[x0, y0], [x1, y1]] = bounds;
      const dx = Math.max(x1 - x0, 1);
      const dy = Math.max(y1 - y0, 1);
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const k = Math.max(MIN_ZOOM, Math.min(maxScale, padding / Math.max(dx / size.width, dy / size.height)));
      animateTo(zoomIdentity.translate(size.width / 2, size.height / 2).scale(k).translate(-cx, -cy));
    },
    [animateTo, size.width, size.height],
  );

  // React to focus requests from the parent (state click, fire selection, reset).
  useEffect(() => {
    if (!focus) return;
    if (focus.kind === 'reset') {
      animateTo(zoomIdentity);
      return;
    }
    if (focus.kind === 'state') {
      const fips = USPS_TO_FIPS[focus.key];
      const f = STATES.find((s) => s.id === fips);
      if (f) zoomToBounds(path.bounds(f), 12);
      return;
    }
    if (focus.kind === 'fire') {
      const fire = fires.find((f) => f.id === focus.key);
      if (!fire) return;
      const perim = detailPerimeter?.id === fire.id ? detailPerimeter : perimeters.find((p) => p.id === fire.id);
      if (perim) {
        zoomToBounds(path.bounds(perim as GeoPermissibleObjects), MAX_ZOOM, 0.6);
      } else {
        const p = projection([fire.lon, fire.lat]);
        if (p) zoomToBounds([[p[0] - 8, p[1] - 8], [p[0] + 8, p[1] + 8]], 24);
      }
    }
    // `fires`/`perimeters` intentionally excluded: only re-focus when the request changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce, focus?.kind, focus?.key, animateTo, zoomToBounds, path, projection]);

  const zoomBy = (factor: number) => {
    const svg = svgRef.current;
    const z = zoomRef.current;
    if (!svg || !z) return;
    select(svg).transition().duration(250).call(z.scaleBy, factor);
  };

  const handleMove = (e: React.MouseEvent, fire: Fire) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHover({ fire, x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const pulseEnabled = useMemo(() => !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches, []);

  const k = transform.k;
  const inv = 1 / k;
  // Markers shrink on screen as the user zooms in (∝ 1/√k) so perimeters and county lines stay
  // readable at state and fire level, while still reading as points at the national view.
  const markerScale = inv / Math.sqrt(k);
  const showCounties = k >= COUNTY_ZOOM && countyPaths.length > 0;
  const hoverLeft = hover ? Math.min(hover.x + 14, size.width - 260) : 0;
  const hoverTop = hover ? Math.min(hover.y + 14, size.height - 120) : 0;

  return (
    <div className="fire-map" ref={containerRef}>
      <svg
        ref={svgRef}
        className="fire-map__svg"
        width={size.width}
        height={size.height}
        viewBox={`0 0 ${size.width} ${size.height}`}
        role="img"
        aria-label="Map of the United States showing current wildfire incidents"
      >
        <g transform={transform.toString()}>
          <g className="map-states">
            {statePaths.map((s) => (
              <path
                key={s.id}
                d={s.d}
                className={`map-state${focusState === s.usps ? ' map-state--focus' : ''}${focusState && focusState !== s.usps ? ' map-state--dim' : ''}`}
                strokeWidth={0.8 * inv}
                onClick={() => onSelectState(focusState === s.usps ? null : s.usps)}
              >
                <title>{s.name}</title>
              </path>
            ))}
          </g>
          {showCounties && (
            <g className="map-counties" pointerEvents="none">
              {countyPaths.map((c) => (
                <path key={c.id} d={c.d} className="map-county" strokeWidth={0.5 * inv} />
              ))}
            </g>
          )}
          <g className="map-perimeters" pointerEvents="none">
            {perimeterPaths.map((p) => (
              <path
                key={p.id}
                d={p.d}
                className={`fire-perimeter${selectedId === p.id ? ' fire-perimeter--selected' : ''}`}
                strokeWidth={1.2 * inv}
              />
            ))}
            {detailPath && (
              <path d={detailPath} className="fire-perimeter fire-perimeter--detail" strokeWidth={1.5 * inv} />
            )}
          </g>
          <g className="map-markers">
            {projected.map(({ fire, x, y, r }) => {
              const selected = selectedId === fire.id;
              const rr = r * markerScale;
              return (
                <g key={fire.id} transform={`translate(${x},${y})`}>
                  {selected && <circle r={rr + 7 * inv} className="fire-marker__halo" strokeWidth={2 * inv} />}
                  {pulseEnabled && fire.status === 'active' && fire.type !== 'RX' && (fire.acres ?? 0) >= 1000 && (
                    // SMIL keeps the pulse centred on the marker at any zoom; CSS transforms on
                    // nested SVG groups do not.
                    <circle r={rr} className="fire-marker__pulse">
                      <animate attributeName="r" values={`${rr};${rr * 2.4}`} dur="2.4s" repeatCount="indefinite" />
                      <animate attributeName="fill-opacity" values="0.3;0" dur="2.4s" repeatCount="indefinite" />
                    </circle>
                  )}
                  <circle
                    r={rr}
                    className={`${markerClass(fire)}${selected ? ' fire-marker--selected' : ''}`}
                    strokeWidth={(selected ? 2 : 1) * inv}
                    role="button"
                    tabIndex={0}
                    aria-label={`${fire.name}, ${stateName(fire.state)}`}
                    onMouseEnter={(e) => handleMove(e, fire)}
                    onMouseMove={(e) => handleMove(e, fire)}
                    onMouseLeave={() => setHover(null)}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectFire(fire.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectFire(fire.id);
                      }
                    }}
                  />
                </g>
              );
            })}
          </g>
        </g>
      </svg>

      {hover && (
        <div className="map-hover" style={{ left: hoverLeft, top: hoverTop }} role="status">
          <Text variant="body-sm-semibold" as="div">
            {hover.fire.name}
          </Text>
          <Text variant="body-xs-normal" color="secondary" as="div">
            {typeLabel(hover.fire.type)} · {hover.fire.county ? `${hover.fire.county} County, ` : ''}
            {stateName(hover.fire.state)}
          </Text>
          <div className="map-hover__row">
            <span>{formatAcres(hover.fire.acres)} ac</span>
            <span>{formatPercent(hover.fire.contained)} contained</span>
            <span>updated {formatRelative(hover.fire.modifiedAt)}</span>
          </div>
        </div>
      )}

      <div className="map-controls">
        <Tooltip title="Zoom in" placement="left">
          <IconButton icon={ZoomIn} aria-label="Zoom in" size="sm" onClick={() => zoomBy(1.6)} />
        </Tooltip>
        <Tooltip title="Zoom out" placement="left">
          <IconButton icon={ZoomOut} aria-label="Zoom out" size="sm" onClick={() => zoomBy(1 / 1.6)} />
        </Tooltip>
        <Tooltip title="Reset view" placement="left">
          <IconButton
            icon={ArrowsMinimize}
            aria-label="Reset view"
            size="sm"
            onClick={() => {
              onSelectState(null);
              animateTo(zoomIdentity);
            }}
          />
        </Tooltip>
      </div>

      <div className="map-legend" aria-label="Legend">
        <div className="map-legend__item"><span className="legend-swatch fire-marker--critical" />&lt;25% contained</div>
        <div className="map-legend__item"><span className="legend-swatch fire-marker--partial" />25–74%</div>
        <div className="map-legend__item"><span className="legend-swatch fire-marker--mostly" />75–99%</div>
        <div className="map-legend__item"><span className="legend-swatch fire-marker--contained" />Contained</div>
        <div className="map-legend__item"><span className="legend-swatch fire-marker--unknown" />Not reported</div>
        <div className="map-legend__item"><span className="legend-swatch fire-marker--rx" />Prescribed burn</div>
        <div className="map-legend__item"><span className="legend-swatch legend-swatch--perimeter" />Perimeter</div>
        <Text variant="body-xs-normal" color="subtle" as="div">
          Marker size scales with acreage · drag to pan · ⌘/Ctrl + scroll to zoom
        </Text>
      </div>
    </div>
  );
}
