/**
 * RDCFT · Configuración
 * Única fuente de verdad para umbrales, capas, paisajes y puntos de muestreo.
 *
 * Los módulos se cargan como scripts clásicos en orden (ver code.html) y comparten
 * el espacio de nombres `window.RDCFT`. Se evitan módulos ES a propósito: el
 * proyecto no tiene build y los módulos ES no cargan bajo el protocolo file://,
 * lo que rompería el abrir code.html con doble clic.
 */
(function (RDCFT) {
  'use strict';

  // Horas de la ventana operacional diurna. Una sola convención para las tarjetas
  // del panel, el semáforo del selector de días y el informe PDF: antes cada uno
  // usaba horas distintas (14 / 10-15-18 / 9-19) y podían contradecirse entre sí.
  const OPERATIONAL_HOURS = [9, 11, 13, 15, 17, 19];

  // Umbrales de prescripción. `warn` degrada a CON RESTRICCIONES, `crit` a NO FAVORABLE.
  // En humedad la relación se invierte: valores menores son peores.
  // PENDIENTE: trazar estos números a la prescripción oficial que se vaya a usar.
  const THRESHOLDS = {
    temp:     { warn: 21, crit: 26 },   // °C
    humidity: { warn: 45, crit: 30 },   // %
    wind:     { warn: 12, crit: 20 },   // km/h
    gust:     { warn: 20, crit: 30 },   // km/h
    rain:     { crit: 5 }               // mm
  };

  // Capas del mapa. `colors` alimenta a la vez el mapa de calor y el degradado de la
  // leyenda, de modo que ya no pueden desincronizarse. `ticks` se reparte de forma
  // equiespaciada, así que las etiquetas deben ser lineales entre `min` y `max`.
  const LAYERS = {
    temp: {
      label: 'Temperatura',
      unit: '°C',
      field: 'temperature_2m',
      min: -10,
      max: 40,
      ticks: ['-10°C', '0°C', '10°C', '20°C', '30°C', '40°C+'],
      colors: [[30, 64, 175], [14, 116, 144], [101, 163, 13], [234, 179, 8], [249, 115, 22], [239, 68, 68]]
    },
    humidity: {
      label: 'Humedad relativa',
      unit: '%',
      field: 'relative_humidity_2m',
      min: 0,
      max: 100,
      ticks: ['0%', '25%', '50%', '75%', '100%'],
      colors: [[234, 179, 8], [16, 185, 129], [14, 165, 233], [30, 64, 175]]
    },
    rain: {
      label: 'Precipitación',
      unit: 'mm',
      field: 'precipitation',
      min: 0,
      max: 30,
      ticks: ['0 mm', '10 mm', '20 mm', '30 mm+'],
      colors: [[37, 99, 235], [34, 197, 94], [234, 179, 8], [239, 68, 68]]
    }
  };

  // Paisajes predefinidos del selector del panel lateral.
  const PAISAJES = [
    { name: 'Valle de Cauquenes',   lat: -36.1645, lng: -72.1882, zoom: 10 },
    { name: 'Secano del Mataquito', lat: -35.0500, lng: -71.4000, zoom: 10 },
    { name: 'Alto Biobío',          lat: -37.8833, lng: -71.4167, zoom: 10 }
  ];

  // Puntos con pronóstico propio: alimentan los badges del mapa y la interpolación
  // del mapa de calor. Sus valores se piden de verdad a la API (una sola petición
  // multipunto), no se extrapolan.
  const REGIONAL_SPOTS = [
    { name: 'Cauquenes',    lat: -36.1645, lng: -72.1882 },
    { name: 'Talca',        lat: -35.4264, lng: -71.6554 },
    { name: 'Concepción',   lat: -36.8270, lng: -73.0498 },
    { name: 'Chillán',      lat: -36.6063, lng: -72.1034 },
    { name: 'Linares',      lat: -35.8454, lng: -71.5979 },
    { name: 'Parral',       lat: -36.1436, lng: -71.8267 },
    { name: 'Constitución', lat: -35.3333, lng: -72.4167 },
    { name: 'Los Ángeles',  lat: -37.4697, lng: -72.3537 },
    { name: 'Curicó',       lat: -34.9856, lng: -71.2394 }
  ];

  RDCFT.config = {
    DEFAULT_COORDS: { lat: -36.1645, lng: -72.1882 },
    DEFAULT_LOCATION: 'Valle de Cauquenes',
    DEFAULT_COMUNA: 'Cauquenes',
    FORECAST_DAYS: 7,
    DAYS_IN_SELECTOR: 6,
    OPERATIONAL_HOURS: OPERATIONAL_HOURS,
    THRESHOLDS: THRESHOLDS,
    LAYERS: LAYERS,
    PAISAJES: PAISAJES,
    REGIONAL_SPOTS: REGIONAL_SPOTS,
    PARTICLE_COUNT: 220,
    // Nominatim exige como máximo 1 petición por segundo.
    NOMINATIM_MIN_INTERVAL_MS: 1100
  };
})(window.RDCFT = window.RDCFT || {});
