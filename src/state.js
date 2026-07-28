/**
 * RDCFT · Estado global
 * Un único objeto mutable compartido por los módulos. Se eliminaron los campos
 * muertos `isPlaying` / `playInterval` que nunca se usaron.
 */
(function (RDCFT) {
  'use strict';

  RDCFT.state = {
    // --- Ubicación consultada ---
    coords: { lat: RDCFT.config.DEFAULT_COORDS.lat, lng: RDCFT.config.DEFAULT_COORDS.lng },
    locationName: RDCFT.config.DEFAULT_LOCATION,
    comunaName: RDCFT.config.DEFAULT_COMUNA,

    // --- Datos ---
    weatherData: null,     // pronóstico completo del punto consultado
    regionalSamples: [],   // [{ name, lat, lng, hourly }] con datos reales de la API

    // --- Selección temporal ---
    selectedDayIndex: 0,   // 0 = hoy
    selectedHour: 12,      // hora que gobierna el mapa de calor y las partículas

    // --- Vista ---
    activeLayer: 'temp',   // temp | humidity | rain | wind
    mapTileType: 'satellite',
    theme: 'dark',

    // --- Objetos de Leaflet / canvas ---
    map: null,
    marker: null,
    cityMarkersGroup: null,
    tileLayers: {},
    windCanvas: null,
    windCtx: null,
    heatmapCanvas: null,
    heatmapCtx: null,
    windParticles: [],

    // El mapa de calor sólo se redibuja cuando algo cambió, en vez de en cada
    // uno de los 60 fotogramas por segundo.
    heatmapDirty: true,

    // Control de carreras: sólo la petición más reciente puede escribir el estado.
    requestSeq: 0,
    activeController: null
  };

  RDCFT.markHeatmapDirty = function () {
    RDCFT.state.heatmapDirty = true;
  };
})(window.RDCFT = window.RDCFT || {});
