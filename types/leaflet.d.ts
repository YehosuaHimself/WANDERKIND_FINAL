// Minimal ambient declaration for Leaflet 1.9.x (self-hosted).
// We use `any` deliberately — the full @types/leaflet is 30KB and we
// don't need the type richness for a single map page.
declare const L: any;
declare namespace L {
  type LatLngBoundsLiteral = Array<[number, number]>;
  type LatLngBounds = any;
  type Map = any;
}
