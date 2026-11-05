import type { LayerSpecification } from 'maplibre-gl';
import { describe, expect, it } from 'vitest';
import {
  backgrounds,
  baseLayers,
  chosenBackground,
  HILLSHADE_LAYER,
  layerPlan,
  type BaseLayer,
} from './layers';

const offered = (key?: string) => backgrounds(key).map((b) => b.id);
const byId = (id: string, key = 'k') => chosenBackground(backgrounds(key), id as never);

describe('backgrounds', () => {
  it('offers satellite only with an Esri key, and passes the key with each tile', () => {
    expect(offered()).toEqual(['map', 'cycling', 'topo']);
    expect(offered('a key/+')).toEqual(['map', 'cycling', 'topo', 'satellite']);
    expect(byId('satellite', 'a key/+').source?.tiles?.[0]).toMatch(/\?token=a%20key%2F%2B$/);
  });

  it('credits OpenStreetMap on every background drawn from it', () => {
    for (const id of ['cycling', 'topo'])
      expect(byId(id).source?.attribution).toContain('OpenStreetMap contributors');
  });
});

describe('chosenBackground', () => {
  it('is the street map when nothing was chosen, or the choice is no longer offered', () => {
    expect(chosenBackground(backgrounds(undefined), undefined).id).toBe('map');
    expect(chosenBackground(backgrounds(undefined), 'satellite').id).toBe('map');
    expect(chosenBackground(backgrounds('k'), 'satellite').id).toBe('satellite');
  });
});

describe('baseLayers', () => {
  const layers = [
    { id: 'background', type: 'background' },
    { id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water' },
    {
      id: 'hidden',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'x',
      layout: { visibility: 'none' },
    },
    { id: 'place', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place' },
    { id: 'route-casing', type: 'line', source: 'route' },
  ] as LayerSpecification[];
  const types: Record<string, string> = { openmaptiles: 'vector', route: 'geojson' };

  it("is the base style's layers, with their labels and visibility, not the app's own", () => {
    expect(baseLayers(layers, (s) => types[s])).toEqual([
      { id: 'background', label: false, visibility: 'visible' },
      { id: 'water', label: false, visibility: 'visible' },
      { id: 'hidden', label: false, visibility: 'none' },
      { id: 'place', label: true, visibility: 'visible' },
    ]);
  });
});

describe('layerPlan', () => {
  const base: BaseLayer[] = [
    { id: 'water', label: false, visibility: 'visible' },
    { id: 'hidden', label: false, visibility: 'none' },
    { id: 'place', label: true, visibility: 'visible' },
    { id: 'poi', label: true, visibility: 'none' },
  ];
  const plan = (id: string, hillshade = false) => layerPlan(byId(id), hillshade, base, 'route');

  it('leaves the street map as it was, with hillshade beneath its labels', () => {
    expect(plan('map', true)).toEqual({
      visibility: { water: 'visible', hidden: 'none', place: 'visible', poi: 'none' },
      hillshadeBefore: 'place',
      backgroundBefore: HILLSHADE_LAYER,
    });
  });

  it('hides the whole base style under a map with its own labels, beneath the route', () => {
    expect(plan('topo')).toEqual({
      visibility: { water: 'none', hidden: 'none', place: 'none', poi: 'none' },
      hillshadeBefore: 'route',
      backgroundBefore: 'route',
    });
  });

  it("keeps the base style's labels over aerial photos", () => {
    expect(plan('satellite')).toEqual({
      visibility: { water: 'none', hidden: 'none', place: 'visible', poi: 'none' },
      hillshadeBefore: 'place',
      backgroundBefore: 'place',
    });
  });

  it('puts the background beneath the hillshade', () => {
    expect(plan('cycling', true)).toMatchObject({
      hillshadeBefore: 'route',
      backgroundBefore: HILLSHADE_LAYER,
    });
  });
});
