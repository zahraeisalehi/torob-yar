import type { StyleSpecification } from 'maplibre-gl';

export const PRIMARY_STYLE = process.env.NEXT_PUBLIC_MAP_STYLE || 'https://tiles.openfreemap.org/styles/positron';
export const POSITRON = 'https://tiles.openfreemap.org/styles/positron';

export const CARTO_RASTER: StyleSpecification = {
  version: 8,
  sources: {
    carto: {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
        'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors © CARTO',
      maxzoom: 19,
    },
  },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': '#f5f6f8' } },
    { id: 'carto', type: 'raster', source: 'carto' },
  ],
};

/** Last resort: works fully offline; our own layers carry the meaning. */
export const MINIMAL: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#eef0f3' } }],
};

export function styleChain(): (string | StyleSpecification)[] {
  const chain: (string | StyleSpecification)[] = [PRIMARY_STYLE];
  if (PRIMARY_STYLE !== POSITRON) chain.push(POSITRON);
  chain.push(CARTO_RASTER, MINIMAL);
  return chain;
}
