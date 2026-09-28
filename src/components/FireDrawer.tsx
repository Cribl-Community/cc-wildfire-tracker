import { useEffect, useState } from 'react';
import { Alert, Button, Divider, Drawer, Link, Pill, Spinner, Text } from '@capra/core';
import { ArrowUpRightFromSquare, Bullseye } from '@capra/icons';
import { fetchPerimeterFor } from '../api.ts';
import { rewindFeature, stateName } from '../geo.ts';
import {
  formatAcres,
  formatCoords,
  formatDateTime,
  formatNumber,
  formatPercent,
  formatRelative,
  formatUsd,
  typeLabel,
} from '../format.ts';
import type { Fire, PerimeterFeature } from '../types.ts';

interface Props {
  fire: Fire | null;
  isOpen: boolean;
  onClose: () => void;
  onZoomTo: (id: string) => void;
  onDetailPerimeter: (perimeter: PerimeterFeature | null) => void;
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="fact">
      <Text variant="body-xs-normal" color="secondary" as="div">
        {label}
      </Text>
      <Text variant="body-sm-normal" as="div">
        {value ?? '--'}
      </Text>
    </div>
  );
}

function statusPill(fire: Fire) {
  if (fire.type === 'RX') return <Pill appearance="highlight">Prescribed burn</Pill>;
  if (fire.status === 'contained') return <Pill appearance="success">Contained</Pill>;
  const c = fire.contained;
  if (c === null) return <Pill appearance="default">Active · containment not reported</Pill>;
  const label = `Active · ${formatPercent(c)} contained`;
  if (c < 25) return <Pill appearance="danger">{label}</Pill>;
  if (c < 75) return <Pill appearance="warning">{label}</Pill>;
  return <Pill appearance="info">{label}</Pill>;
}

export function FireDrawer({ fire, isOpen, onClose, onZoomTo, onDetailPerimeter }: Props) {
  const [perimeterState, setPerimeterState] = useState<{ id: string; status: 'loading' | 'ready' | 'none' | 'error'; acres: number | null; asOf: number | null; method: string | null }>(
    { id: '', status: 'none', acres: null, asOf: null, method: null },
  );

  // Fetch the full-precision perimeter whenever the selected fire changes.
  useEffect(() => {
    if (!fire || !fire.hasPerimeter) {
      onDetailPerimeter(null);
      setPerimeterState({ id: fire?.id ?? '', status: 'none', acres: null, asOf: null, method: null });
      return;
    }
    const controller = new AbortController();
    setPerimeterState({ id: fire.id, status: 'loading', acres: null, asOf: null, method: null });
    fetchPerimeterFor(fire.id, controller.signal)
      .then((res) => {
        if (controller.signal.aborted) return;
        const f = res.geojson.features.find((x) => x.geometry) ?? null;
        if (!f) {
          onDetailPerimeter(null);
          setPerimeterState({ id: fire.id, status: 'none', acres: null, asOf: null, method: null });
          return;
        }
        const fixed = rewindFeature({ ...f, id: fire.id }) as PerimeterFeature;
        onDetailPerimeter(fixed);
        setPerimeterState({
          id: fire.id,
          status: 'ready',
          acres: f.properties.gisAcres,
          asOf: f.properties.dateCurrent,
          method: f.properties.mapMethod,
        });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        onDetailPerimeter(null);
        setPerimeterState({ id: fire.id, status: 'error', acres: null, asOf: null, method: null });
      });
    return () => controller.abort();
    // onDetailPerimeter is stable (useCallback in App).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fire?.id, fire?.hasPerimeter]);

  const mapsHref = fire ? `https://www.google.com/maps?q=${fire.lat},${fire.lon}` : '#';

  return (
    <Drawer
      isOpen={isOpen && fire !== null}
      onClose={onClose}
      modal={false}
      placement="right"
      width={460}
      title={
        fire ? (
          <>
            <Drawer.Heading>{fire.name}</Drawer.Heading>
            <Drawer.Description>
              {typeLabel(fire.type)} · {fire.county ? `${fire.county} County, ` : ''}
              {stateName(fire.state)}
            </Drawer.Description>
          </>
        ) : (
          'Incident'
        )
      }
      footer={
        fire ? (
          <div className="drawer-footer">
            <Button variant="primary" leadingIcon={Bullseye} onClick={() => onZoomTo(fire.id)}>
              Zoom to fire
            </Button>
            <Button variant="tertiary" onClick={onClose}>
              Close
            </Button>
          </div>
        ) : null
      }
    >
      {fire && (
        <div className="drawer-body">
          <div className="drawer-status">{statusPill(fire)}</div>
          {fire.description && (
            <Text variant="body-sm-normal" color="secondary" as="p">
              {fire.description}
            </Text>
          )}

          <div className="fact-grid">
            <Fact label="Size" value={`${formatAcres(fire.acres)} acres`} />
            <Fact label="Contained" value={formatPercent(fire.contained)} />
            <Fact label="Discovered" value={formatDateTime(fire.discoveredAt)} />
            <Fact label="Last updated" value={`${formatRelative(fire.modifiedAt)} (${formatDateTime(fire.modifiedAt)})`} />
            <Fact label="Cause" value={fire.cause ? `${fire.cause}${fire.causeDetail ? ` · ${fire.causeDetail}` : ''}` : '--'} />
            <Fact label="Fire behavior" value={fire.behavior} />
            <Fact label="Personnel" value={formatNumber(fire.personnel)} />
            <Fact label="Cost to date" value={formatUsd(fire.costToDate)} />
          </div>

          <Divider />

          <Text variant="heading-xs" as="h3">
            Perimeter
          </Text>
          {perimeterState.status === 'loading' && (
            <div className="drawer-inline">
              <Spinner size="sm" />
              <Text variant="body-sm-normal" color="secondary">
                Loading full-resolution perimeter…
              </Text>
            </div>
          )}
          {perimeterState.status === 'ready' && (
            <div className="fact-grid">
              <Fact label="Mapped area" value={`${formatAcres(perimeterState.acres)} acres`} />
              <Fact label="Perimeter as of" value={formatDateTime(perimeterState.asOf)} />
              <Fact label="Map method" value={perimeterState.method} />
            </div>
          )}
          {perimeterState.status === 'none' && (
            <Text variant="body-sm-normal" color="secondary" as="p">
              NIFC has not published a perimeter polygon for this incident yet. The marker shows the reported point of origin.
            </Text>
          )}
          {perimeterState.status === 'error' && (
            <Alert appearance="warning" layout="inline">
              The perimeter could not be loaded. The generalized outline, if any, is still shown on the map.
            </Alert>
          )}

          <Divider />

          <Text variant="heading-xs" as="h3">
            Command &amp; jurisdiction
          </Text>
          <div className="fact-grid">
            <Fact label="Management" value={fire.managementOrg} />
            <Fact label="Complexity" value={fire.complexity} />
            <Fact label="Protecting agency" value={fire.protectingAgency} />
            <Fact label="Jurisdiction" value={fire.jurisdiction} />
            <Fact label="Landowner" value={fire.landowner} />
            <Fact label="Dispatch center" value={fire.dispatchCenter} />
            <Fact label="GACC" value={fire.gacc} />
            <Fact label="Fuel group" value={fire.fuel} />
            {fire.complexName && <Fact label="Part of complex" value={fire.complexName} />}
            {fire.containedAt && <Fact label="Containment date" value={formatDateTime(fire.containedAt)} />}
            {fire.controlledAt && <Fact label="Control date" value={formatDateTime(fire.controlledAt)} />}
            {fire.outAt && <Fact label="Declared out" value={formatDateTime(fire.outAt)} />}
          </div>

          <Divider />

          <Text variant="heading-xs" as="h3">
            Identifiers
          </Text>
          <div className="fact-grid">
            <Fact label="Unique fire ID" value={fire.uid} />
            <Fact label="IRWIN ID" value={<span className="mono">{fire.id}</span>} />
            <Fact
              label="Origin"
              value={
                <Link href={mapsHref} target="_blank" rel="noopener noreferrer">
                  {formatCoords(fire.lat, fire.lon)} <ArrowUpRightFromSquare size="sm" />
                </Link>
              }
            />
          </div>
        </div>
      )}
    </Drawer>
  );
}
