// Site chrome shared by every page: the breadcrumb bar under a hero, the attribution footer, and
// the registry of data sources and their licences (each place lists the keys it uses).
import { rel } from './paths.mjs';

const A = (href, text) => `<a href="${href}" rel="noopener">${text}</a>`;

export const SOURCES = {
  'mi-tides': { label: 'Tide predictions', html: `${A('https://erddap.marine.ie/erddap/info/imiTidePrediction/index.html', 'Marine Institute')} predictions for Roonagh (CC BY 4.0), fitted here and computed in your browser; contains Irish Public Sector Data` },
  'mi-sst': { label: 'Sea temperature', html: `${A('https://erddap.marine.ie/', 'Marine Institute')} NE Atlantic model and Irish Coastal Temperature Network (CC BY 4.0); Météo-France sea-surface temperature via Open-Meteo` },
  'open-meteo': { label: 'Weather', html: `${A('https://open-meteo.com/', 'Weather data by Open-Meteo.com')} (CC BY 4.0), fetched by your browser` },
  'opw-lidar': { label: 'LiDAR', html: `contains Irish Public Sector Data (${A('https://www.gsi.ie/', 'Geological Survey Ireland')}; Office of Public Works 2011 survey) licensed under CC BY 4.0` },
  infomar: { label: 'Bathymetry', html: `contains Irish Public Sector Data (Geological Survey Ireland & Marine Institute, ${A('https://www.infomar.ie/', 'INFOMAR')}) licensed under CC BY 4.0` },
  cfram: { label: 'Flood maps', html: `Office of Public Works, ${A('https://www.floodinfo.ie/', 'floodinfo.ie')} (CC BY-NC-ND 4.0): quoted, not reproduced` },
  ar6: { label: 'Sea-level projections', html: `IPCC AR6 (Fox-Kemper et al. 2021; Garner et al. 2021, doi:10.5281/zenodo.5914709; Kopp et al. 2023) via the ${A('https://sealevel.nasa.gov/ipcc-ar6-sea-level-projection-tool', 'NASA Sea Level Projection Tool')}, CC BY 4.0` },
  osm: { label: 'Map data', html: `© ${A('https://www.openstreetmap.org/copyright', 'OpenStreetMap contributors')}, ODbL` },
  eudem: { label: 'Elevation', html: `${A('https://registry.opendata.aws/terrain-tiles/', 'AWS Terrain Tiles')} (Mapzen/Tilezen): Europe terrain data produced using Copernicus data and information funded by the European Union - EU-DEM layers; ETOPO1, U.S. National Oceanic and Atmospheric Administration; GMTED2010 and SRTM courtesy of the U.S. Geological Survey` },
  openfreemap: { label: 'Map tiles', html: `${A('https://openfreemap.org/', 'OpenFreeMap')} © OpenMapTiles, data from OpenStreetMap; ${A('https://maplibre.org/', 'MapLibre GL JS')} (BSD-3-Clause)` },
  logainm: { label: 'Irish names', html: `Irish-language placename data by ${A('https://www.logainm.ie/', 'Logainm')} © Government of Ireland and licensed under CC BY 4.0` },
};

export function crumbs(page, items, cls = '') {
  // items: [{ path, label }] ending with the current page (no link)
  const parts = items.map((it, i) => (i < items.length - 1 ? `<a href="${rel(page, it.path)}">${it.label}</a>` : `<span aria-current="page">${it.label}</span>`));
  return `<nav class="crumbs ${cls}" aria-label="Breadcrumb">${parts.join('<span class="sep" aria-hidden="true">·</span>')}</nav>`;
}

export function footer(page, site, { sources = [], safety = '', extra = '', places = [] } = {}) {
  const src = sources.filter((k) => SOURCES[k]).map((k) => `<li><b>${SOURCES[k].label}:</b> ${SOURCES[k].html}</li>`).join('');
  const nav = [`<a href="${rel(page, '')}">${site.brand}</a>`, ...places.map((p) => `<a href="${rel(page, p.slug + '/')}">${p.listing.title}</a>`), `<a href="${rel(page, 'about/')}">About, sources and privacy</a>`];
  return `<div class="site-foot">
  ${safety ? `<p class="safety-line">${safety}</p>` : ''}
  ${src ? `<ul class="attrib">${src}</ul>` : ''}
  ${extra}
  <p class="privacy">No cookies, no analytics, no accounts. Forecasts are fetched by your browser straight from the services credited above; anything you log stays on your device.</p>
  <nav class="site-nav" aria-label="Site">${nav.join('<span aria-hidden="true"> · </span>')}</nav>
</div>`;
}
