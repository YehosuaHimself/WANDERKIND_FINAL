// @ts-nocheck
/**
 * /js/region-labels.js — sparse region labels for the Wanderkind launch corridor.
 *
 * Only regional (state / canton / Land / regione) names — no country names.
 * Loaded by /js/map-boot.js and drawn as inline ink labels on the aged-paper
 * map. The set is deliberately small: launch regions only. More land in
 * later releases when the directory grows.
 *
 * Each entry: { name, lat, lng, weight }. `weight` controls type size.
 *   weight 1 → small (10px),  2 → medium (12px),  3 → large (14px)
 */

export const REGIONS = [
  // German-speaking Alpine spine
  { name: 'BAYERN',                    lat: 48.95, lng: 11.50, weight: 3 },
  { name: 'BADEN-WÜRTTEMBERG',         lat: 48.65, lng:  9.10, weight: 2 },
  { name: 'TIROL',                     lat: 47.25, lng: 11.40, weight: 3 },
  { name: 'VORARLBERG',                lat: 47.25, lng:  9.90, weight: 2 },
  { name: 'SALZBURG',                  lat: 47.55, lng: 13.20, weight: 2 },
  { name: 'OBERÖSTERREICH',            lat: 48.05, lng: 14.10, weight: 2 },
  { name: 'NIEDERÖSTERREICH',          lat: 48.30, lng: 15.85, weight: 2 },
  { name: 'STEIERMARK',                lat: 47.30, lng: 14.85, weight: 2 },
  { name: 'KÄRNTEN',                   lat: 46.75, lng: 14.10, weight: 2 },

  // Swiss cantons (the relevant ones)
  { name: 'GRAUBÜNDEN',                lat: 46.65, lng:  9.60, weight: 2 },
  { name: 'ST. GALLEN',                lat: 47.30, lng:  9.30, weight: 1 },
  { name: 'BERN',                      lat: 46.85, lng:  7.55, weight: 2 },
  { name: 'WALLIS · VALAIS',           lat: 46.20, lng:  7.70, weight: 2 },
  { name: 'URI',                       lat: 46.75, lng:  8.65, weight: 1 },

  // Northern Italy
  { name: 'SÜDTIROL · ALTO ADIGE',     lat: 46.55, lng: 11.35, weight: 2 },
  { name: 'TRENTINO',                  lat: 46.05, lng: 11.10, weight: 2 },
  { name: 'LOMBARDIA',                 lat: 45.70, lng:  9.85, weight: 2 },
  { name: 'VENETO',                    lat: 45.65, lng: 11.85, weight: 2 },

  // Camino corridors
  { name: 'NAVARRA',                   lat: 42.80, lng: -1.65, weight: 2 },
  { name: 'LA RIOJA',                  lat: 42.45, lng: -2.45, weight: 1 },
  { name: 'CASTILLA Y LEÓN',           lat: 42.10, lng: -4.60, weight: 2 },
  { name: 'GALICIA',                   lat: 42.85, lng: -8.10, weight: 2 },
  { name: 'PAÍS VASCO · EUSKADI',      lat: 43.10, lng: -2.40, weight: 1 },
  { name: 'AQUITAINE · NOUVELLE-AQUITAINE', lat: 44.30, lng: -0.50, weight: 1 },

  // Wider German Bundesländer (lighter weight, only when zoomed out)
  { name: 'HESSEN',                    lat: 50.55, lng:  9.10, weight: 1 },
  { name: 'NORDRHEIN-WESTFALEN',       lat: 51.30, lng:  7.50, weight: 1 },
  { name: 'RHEINLAND-PFALZ',           lat: 49.95, lng:  7.30, weight: 1 },
  { name: 'THÜRINGEN',                 lat: 50.85, lng: 11.05, weight: 1 },
  { name: 'SACHSEN',                   lat: 51.05, lng: 13.50, weight: 1 },
];
