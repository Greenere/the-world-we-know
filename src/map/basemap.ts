import type {ExpressionSpecification, StyleSpecification} from '@maplibre/maplibre-gl-style-spec';
import {Map as MlMap, setWorkerUrl} from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import {dataUrl} from '../data';

export const PALETTE = {
  sea: '#c6cfbf',
  land: '#e9dcbb',
  ice: '#efeadf',
  coast: '#4f3f2b',
  waterLine: '#5f746c',
  river: '#6b8590',
  graticule: '#7a6a50',
};

function graticule() {
  const features: GeoJSON.Feature[] = [];
  const line = (coords: [number, number][], kind: string): GeoJSON.Feature => ({
    type: 'Feature',
    properties: {kind},
    geometry: {type: 'LineString', coordinates: coords},
  });
  for (let lon = -180; lon <= 180; lon += 30) {
    const c: [number, number][] = [];
    for (let lat = -84; lat <= 84; lat += 2) c.push([lon, lat]);
    features.push(line(c, 'meridian'));
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    if (lat === 0) continue;
    const c: [number, number][] = [];
    for (let lon = -180; lon <= 180; lon += 2) c.push([lon, lat]);
    features.push(line(c, 'parallel'));
  }
  for (const [lat, kind] of [
    [0, 'equator'],
    [23.44, 'tropic'],
    [-23.44, 'tropic'],
    [66.56, 'polar'],
    [-66.56, 'polar'],
  ] as [number, string][]) {
    const c: [number, number][] = [];
    for (let lon = -180; lon <= 180; lon += 2) c.push([lon, lat]);
    features.push(line(c, kind));
  }
  return {type: 'FeatureCollection', features} as GeoJSON.FeatureCollection;
}

export function mapStyle(globe: boolean): StyleSpecification {
  const width = (a: number, b: number): ExpressionSpecification => [
    'interpolate',
    ['exponential', 1.4],
    ['zoom'],
    1,
    a,
    7,
    b,
  ];
  return {
    version: 8,
    projection: {type: globe ? 'globe' : 'mercator'},
    sources: {
      land: {type: 'geojson', data: dataUrl('basemap/land.json'), tolerance: 0.25},
      ice: {type: 'geojson', data: dataUrl('basemap/ice.json')},
      lakes: {type: 'geojson', data: dataUrl('basemap/lakes.json')},
      rivers: {type: 'geojson', data: dataUrl('basemap/rivers.json')},
      graticule: {type: 'geojson', data: graticule()},
    },
    layers: [
      {id: 'sea', type: 'background', paint: {'background-color': PALETTE.sea}},
      {
        id: 'graticule',
        type: 'line',
        source: 'graticule',
        filter: ['in', ['get', 'kind'], ['literal', ['meridian', 'parallel']]],
        paint: {'line-color': PALETTE.graticule, 'line-opacity': 0.22, 'line-width': 0.6},
      },
      {
        id: 'graticule-special',
        type: 'line',
        source: 'graticule',
        filter: ['in', ['get', 'kind'], ['literal', ['equator', 'tropic', 'polar']]],
        paint: {
          'line-color': PALETTE.graticule,
          'line-opacity': ['match', ['get', 'kind'], 'equator', 0.42, 0.3],
          'line-width': ['match', ['get', 'kind'], 'equator', 0.9, 0.7],
          'line-dasharray': [4, 3],
        },
      },
      // Engraved water lines: the coast repeated a few times out to sea, fading.
      ...[
        [11, 0.07],
        [7, 0.12],
        [3.6, 0.2],
      ].map(([offset, opacity], i) => ({
        id: `water-line-${i}`,
        type: 'line' as const,
        source: 'land',
        paint: {
          'line-color': PALETTE.waterLine,
          'line-opacity': opacity,
          'line-width': 0.7,
          'line-offset': ['interpolate', ['linear'], ['zoom'], 1, offset * 0.55, 5, offset] as ExpressionSpecification,
        },
      })),
      {id: 'land', type: 'fill', source: 'land', paint: {'fill-color': PALETTE.land, 'fill-antialias': true}},
      {id: 'ice', type: 'fill', source: 'ice', paint: {'fill-color': PALETTE.ice}},
      {
        id: 'ice-edge',
        type: 'line',
        source: 'ice',
        paint: {'line-color': PALETTE.coast, 'line-opacity': 0.35, 'line-width': 0.5, 'line-dasharray': [2, 2]},
      },
      {id: 'lakes', type: 'fill', source: 'lakes', paint: {'fill-color': PALETTE.sea}},
      {
        id: 'rivers',
        type: 'line',
        source: 'rivers',
        layout: {'line-cap': 'round', 'line-join': 'round'},
        paint: {
          'line-color': PALETTE.river,
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 1, 0.45, 4, 0.8],
          'line-width': width(0.35, 1.6),
        },
      },
      {
        id: 'lake-shore',
        type: 'line',
        source: 'lakes',
        paint: {'line-color': PALETTE.coast, 'line-opacity': 0.55, 'line-width': width(0.35, 1)},
      },
      {
        id: 'coast',
        type: 'line',
        source: 'land',
        layout: {'line-join': 'round'},
        paint: {'line-color': PALETTE.coast, 'line-opacity': 0.82, 'line-width': width(0.55, 1.6)},
      },
    ],
  };
}

// MapLibre finds its worker next to its own bundle; Vite moves the bundle, so point at the worker directly.
setWorkerUrl(workerUrl);

export function createMap(container: HTMLElement, center: [number, number], zoom: number, globe: boolean) {
  const map = new MlMap({
    container,
    style: mapStyle(globe),
    center,
    zoom,
    minZoom: 0.6,
    maxZoom: 7.5,
    renderWorldCopies: true,
    attributionControl: false,
    dragRotate: false,
    pitchWithRotate: false,
    maxPitch: 0,
    fadeDuration: 0,
  });
  map.touchZoomRotate.disableRotation();
  map.keyboard.disable();
  // deck.gl 9.4's interleaved renderer reads `map.transform`; MapLibre 6 keeps it on the camera.
  if (!('transform' in map)) {
    Object.defineProperty(map, 'transform', {
      configurable: true,
      get(this: {_camera?: {transform?: unknown}}) {
        return this._camera?.transform;
      },
    });
  }
  return map;
}
