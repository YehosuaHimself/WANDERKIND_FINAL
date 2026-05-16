// @ts-nocheck
/**
 * /js/map-pois.js · static landmark + service POIs rendered on the map.
 *
 * Two tiers:
 *   PRIMARY (large icons, always visible) → wayfinding landmarks
 *     - church · churches and small chapels along the routes
 *     - mountain · summits, passes, named peaks
 *     - festival · annual fairs, processions, pilgrim feasts
 *
 *   SECONDARY (smaller, subtle, only at zoom ≥ 9) → walker services
 *     - wifi · public WiFi from tourist offices or municipalities
 *     - fountain · clean drinking water (wells + official fountains)
 *     - info · tourist information offices
 *     - parish · Pfarrhäuser / Pfarrgemeindehäuser (parish houses)
 *
 * Hand-curated coordinates for the launch corridor: Camino del Norte/Francés,
 * Königsweg / Hochkönig, Pfänder / Vorarlberg, Schwarzwald / Bodensee.
 */

export const POIS = [
  // ─── Churches (primary) ──────────────────────────────────────────────
  { kind: 'church', name: 'Catedral de Pamplona',      lat: 42.8186, lng: -1.6431, note: 'Santa María la Real · 1397' },
  { kind: 'church', name: 'San Pedro · Estella',       lat: 42.6710, lng: -2.0331, note: 'Romanesque portal' },
  { kind: 'church', name: 'Catedral de Burgos',        lat: 42.3408, lng: -3.7044, note: 'UNESCO · gothic' },
  { kind: 'church', name: 'Münster · Freiburg',        lat: 47.9954, lng:  7.8525, note: 'Sandstein-Münster' },
  { kind: 'church', name: 'Münster · Konstanz',        lat: 47.6630, lng:  9.1762, note: 'Unsere Liebe Frau' },
  { kind: 'church', name: 'Stiftskirche · Berchtesgaden', lat: 47.6313, lng: 13.0021, note: 'Probstei · 12. Jh.' },
  { kind: 'church', name: 'Pfarrkirche · Bregenz',     lat: 47.5050, lng:  9.7474, note: 'St. Gallus' },
  { kind: 'church', name: 'Hochkönig · Bergkapelle',   lat: 47.4170, lng: 13.0610, note: 'Kapelle am Aufstieg' },
  { kind: 'church', name: 'Pfarrkirche · Hinterzarten',lat: 47.9089, lng:  8.1075, note: 'Maria in der Zarten' },

  // ─── Chapels (primary · small wayside chapels distinct from churches) ─
  { kind: 'chapel', name: 'Wegkapelle Hochkönig',     lat: 47.4150, lng: 13.0680, note: 'Wayside chapel · 1827 · pilgrim shelter' },
  { kind: 'chapel', name: 'Marienkapelle · Hinterzarten', lat: 47.9100, lng:  8.1090, note: 'Forest chapel · 18th c.' },
  { kind: 'chapel', name: 'St-Anne · Pfänder',        lat: 47.5108, lng:  9.7798, note: 'Mountaintop chapel · view of Bodensee' },
  { kind: 'chapel', name: 'Kapelle am Belchen',       lat: 47.8235, lng:  7.8340, note: 'Summit chapel · Schwarzwald' },
  { kind: 'chapel', name: 'Cappella di San Vili',     lat: 46.0680, lng: 11.1180, note: 'Trentino · Cammino di San Vili' },
  { kind: 'chapel', name: 'Ermita San Andrés',        lat: 42.6720, lng: -2.0340, note: 'Estella · pilgrim chapel' },
  { kind: 'chapel', name: 'Capela do Cebreiro',       lat: 42.7050, lng: -7.0440, note: 'Camino · pre-Romanesque chapel' },
  { kind: 'chapel', name: 'Kapelle Watzmannhaus',     lat: 47.5510, lng: 12.9200, note: 'Hut chapel · climbers stop' },
  { kind: 'chapel', name: 'Cappella di Santa Croce',  lat: 46.4990, lng: 11.3560, note: 'Bolzano · 14th c.' },
  { kind: 'chapel', name: 'Wallfahrtskapelle Maria Schnee', lat: 47.6320, lng: 13.0040, note: 'Berchtesgaden · pilgrim chapel' },
  { kind: 'chapel', name: 'Ermita San Salvador',      lat: 42.8200, lng: -1.6450, note: 'Pamplona · oldest chapel in town' },


  // ─── Mountains (primary) ─────────────────────────────────────────────
  { kind: 'mountain', name: 'Hochkönig',         lat: 47.4189, lng: 13.0625, note: '2941 m · classic summit' },
  { kind: 'mountain', name: 'Untersberg',        lat: 47.7283, lng: 13.0117, note: '1973 m · Salzburg' },
  { kind: 'mountain', name: 'Pfänder',           lat: 47.5097, lng:  9.7783, note: '1062 m · Bodensee Aussicht' },
  { kind: 'mountain', name: 'Feldberg',          lat: 47.8742, lng:  8.0044, note: '1493 m · Schwarzwald' },
  { kind: 'mountain', name: 'Belchen',           lat: 47.8231, lng:  7.8333, note: '1414 m · Südschwarzwald' },
  { kind: 'mountain', name: 'San Lorenzo',       lat: 42.2444, lng: -2.7886, note: '2271 m · La Rioja' },
  { kind: 'mountain', name: 'Watzmann',          lat: 47.5536, lng: 12.9225, note: '2713 m · Berchtesgaden' },

  // ─── Festivals (primary) ─────────────────────────────────────────────
  { kind: 'festival', name: 'Sanfermines · Pamplona',  lat: 42.8125, lng: -1.6458, note: 'Jul · 7 days' },
  { kind: 'festival', name: 'Konstanzer Seenachtsfest',lat: 47.6605, lng:  9.1741, note: 'Aug · Bodensee' },
  { kind: 'festival', name: 'Bregenzer Festspiele',    lat: 47.5031, lng:  9.7492, note: 'Jul-Aug · Seebühne' },
  { kind: 'festival', name: 'Hochkönig Almabtrieb',    lat: 47.4500, lng: 13.0500, note: 'Sep · Almabtrieb' },
  { kind: 'festival', name: 'Burgos San Pedro',        lat: 42.3408, lng: -3.7029, note: 'Jun · 9 days' },
  { kind: 'festival', name: 'Schwarzwälder Trachtenfest', lat: 47.9097, lng: 8.1083, note: 'Aug · Hinterzarten' },

  // ─── WiFi hotspots (secondary) ───────────────────────────────────────
  { kind: 'wifi', name: 'Tourist-Info Pamplona',       lat: 42.8190, lng: -1.6435, note: 'Free public WiFi' },
  { kind: 'wifi', name: 'Rathaus Freiburg',            lat: 47.9959, lng:  7.8497, note: 'Stadt-WLAN · 4h' },
  { kind: 'wifi', name: 'Konstanz Bahnhof',            lat: 47.6585, lng:  9.1772, note: 'SBB free WiFi' },
  { kind: 'wifi', name: 'Bregenz Hafenplatz',          lat: 47.5050, lng:  9.7449, note: 'Stadt-WLAN · free' },
  { kind: 'wifi', name: 'Berchtesgaden Bahnhof',       lat: 47.6313, lng: 13.0014, note: 'DB free WiFi' },
  { kind: 'wifi', name: 'Hinterzarten Tourist',        lat: 47.9089, lng:  8.1075, note: 'Hotspot · all day' },
  { kind: 'wifi', name: 'Logroño Plaza',               lat: 42.4666, lng: -2.4452, note: 'Free city WiFi' },

  // ─── Fountains · drinking water (secondary) ──────────────────────────
  { kind: 'fountain', name: 'Freiburg Bächle',         lat: 47.9947, lng:  7.8508, note: 'Trinkwasser · Bächlebrunnen' },
  { kind: 'fountain', name: 'Pamplona · Plaza Castillo', lat: 42.8181, lng: -1.6435, note: 'Drinking fountain' },
  { kind: 'fountain', name: 'Münsterbrunnen Konstanz', lat: 47.6628, lng:  9.1758, note: 'Public well · clean' },
  { kind: 'fountain', name: 'Bregenz Kornmarkt',       lat: 47.5061, lng:  9.7464, note: 'Trinkwasserbrunnen' },
  { kind: 'fountain', name: 'Berchtesgaden Marktplatz',lat: 47.6308, lng: 13.0033, note: 'Marienbrunnen · trinkbar' },
  { kind: 'fountain', name: 'Hinterzarten Dorfbrunnen',lat: 47.9092, lng:  8.1078, note: 'Quellwasser · fresh' },
  { kind: 'fountain', name: 'Burgos Espolón',          lat: 42.3414, lng: -3.7036, note: 'Drinking fountain' },
  { kind: 'fountain', name: 'Lindau Hafen',            lat: 47.5419, lng:  9.6803, note: 'Trinkbrunnen am Hafen' },

  // ─── Tourist info points (secondary) ─────────────────────────────────
  { kind: 'info', name: 'i · Pamplona Casa Consistorial', lat: 42.8186, lng: -1.6437, note: 'Mo-Sa · 09:00-19:00' },
  { kind: 'info', name: 'i · Freiburg Rathausplatz',   lat: 47.9961, lng:  7.8502, note: 'Mo-So · open' },
  { kind: 'info', name: 'i · Konstanz Bahnhof',        lat: 47.6585, lng:  9.1772, note: 'Mo-So · 09:00-18:00' },
  { kind: 'info', name: 'i · Bregenz Bahnhofstrasse',  lat: 47.5055, lng:  9.7458, note: 'Mo-Sa · open' },
  { kind: 'info', name: 'i · Berchtesgaden Königsseer Str.', lat: 47.6308, lng: 13.0014, note: 'Daily · open' },
  { kind: 'info', name: 'i · Burgos Plaza Alonso Martínez', lat: 42.3416, lng: -3.7036, note: 'Mo-Sa · open' },

  // ─── Parish houses (secondary) · Pfarrhäuser / Pfarrgemeindehäuser ──
  { kind: 'parish', name: 'Pfarrhaus · Freiburg-Münster', lat: 47.9956, lng: 7.8531, note: 'Pfarrgemeindehaus' },
  { kind: 'parish', name: 'Pfarrhaus · Konstanz',      lat: 47.6634, lng:  9.1758, note: 'Pfarramt · room available' },
  { kind: 'parish', name: 'Pfarrhaus · Bregenz',       lat: 47.5054, lng:  9.7470, note: 'Pfarrgemeinde St. Gallus' },
  { kind: 'parish', name: 'Pfarrhaus · Berchtesgaden', lat: 47.6315, lng: 13.0028, note: 'Stiftspfarre · pilgrim room' },
  { kind: 'parish', name: 'Pfarrhaus · Hinterzarten',  lat: 47.9087, lng:  8.1072, note: 'Maria in der Zarten' },
  { kind: 'parish', name: 'Casa Parroquial · Pamplona',lat: 42.8186, lng: -1.6428, note: 'Albergue parroquial' },
  { kind: 'parish', name: 'Casa Parroquial · Estella', lat: 42.6708, lng: -2.0329, note: 'San Pedro · pilgrim beds' },
];

export const POI_META = {
  tier: {
    chapel:   'primary',
    church:   'primary',
    mountain: 'primary',
    festival: 'primary',
    wifi:     'secondary',
    fountain: 'secondary',
    info:     'secondary',
    parish:   'secondary',
  },
  // Secondary kinds only show at zoom >= this value (avoids visual clutter)
  minZoom: {
    wifi:     9,
    fountain: 9,
    info:     8,
    parish:   8,
  },
};
