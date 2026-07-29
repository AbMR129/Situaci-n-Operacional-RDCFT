/**
 * RDCFT · Configuración
 * Única fuente de verdad para umbrales, capas, paisajes y puntos de muestreo.
 *
 * Los módulos se cargan como scripts clásicos en orden (ver index.html) y comparten
 * el espacio de nombres `window.RDCFT`. Se evitan módulos ES a propósito: el
 * proyecto no tiene build y los módulos ES no cargan bajo el protocolo file://,
 * lo que rompería el abrir index.html con doble clic.
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

  // Localidades con pronóstico propio. Las cabeceras aparecen desde una vista
  // amplia y los pueblos al acercar el mapa: así cada etiqueta conserva espacio
  // para leerse sin convertir la vista regional en una nube de textos.
  // Sus valores se piden de verdad a la API mediante consultas multipunto por lote.
  const REGIONAL_SPOTS = [
    { name: 'Cauquenes',    lat: -36.1645, lng: -72.1882, minZoom: 7 },
    { name: 'Talca',        lat: -35.4264, lng: -71.6554, minZoom: 7 },
    { name: 'Concepción',   lat: -36.8270, lng: -73.0498, minZoom: 7 },
    { name: 'Chillán',      lat: -36.6063, lng: -72.1034, minZoom: 7 },
    { name: 'Linares',      lat: -35.8454, lng: -71.5979, minZoom: 7 },
    { name: 'Parral',       lat: -36.1436, lng: -71.8267, minZoom: 7 },
    { name: 'Constitución', lat: -35.3333, lng: -72.4167, minZoom: 7 },
    { name: 'Los Ángeles',  lat: -37.4697, lng: -72.3034, minZoom: 7 },
    { name: 'Curicó',       lat: -34.9856, lng: -71.2394, minZoom: 7 },

    { name: 'Vichuquén',    lat: -34.8091, lng: -72.0303, minZoom: 10 },
    { name: 'Licantén',     lat: -34.9822, lng: -72.0067, minZoom: 10 },
    { name: 'Hualañé',      lat: -34.9767, lng: -71.8031, minZoom: 10 },
    { name: 'Teno',         lat: -34.8703, lng: -71.1628, minZoom: 10 },
    { name: 'Romeral',      lat: -34.9639, lng: -71.8331, minZoom: 10 },
    { name: 'Sagrada Familia', lat: -35.0000, lng: -71.3844, minZoom: 10 },
    { name: 'Molina',       lat: -35.1147, lng: -71.2822, minZoom: 10 },
    { name: 'San Rafael',   lat: -35.3147, lng: -71.5311, minZoom: 10 },
    { name: 'Pelarco',      lat: -35.3828, lng: -71.4403, minZoom: 10 },
    { name: 'Pencahue',     lat: -35.4011, lng: -71.7978, minZoom: 10 },
    { name: 'Curepto',      lat: -35.0836, lng: -72.0161, minZoom: 10 },
    { name: 'Empedrado',    lat: -35.5903, lng: -72.2811, minZoom: 10 },
    { name: 'Chanco',       lat: -35.7344, lng: -72.5339, minZoom: 10 },
    { name: 'Pelluhue',     lat: -35.8261, lng: -72.6347, minZoom: 10 },
    { name: 'San Javier',   lat: -35.5958, lng: -71.7292, minZoom: 10 },
    { name: 'Villa Alegre', lat: -35.6756, lng: -71.7411, minZoom: 10 },
    { name: 'Retiro',       lat: -36.0450, lng: -71.7667, minZoom: 10 },
    { name: 'Longaví',      lat: -35.9647, lng: -71.6839, minZoom: 10 },
    { name: 'Colbún',       lat: -35.6944, lng: -71.4058, minZoom: 10 },
    { name: 'Yerbas Buenas', lat: -35.7500, lng: -71.5822, minZoom: 10 },
    { name: 'San Clemente', lat: -35.5517, lng: -71.4822, minZoom: 10 },

    { name: 'Cobquecura',   lat: -36.1314, lng: -72.7847, minZoom: 10 },
    { name: 'Trehuaco',     lat: -36.4303, lng: -72.6647, minZoom: 10 },
    { name: 'Coelemu',      lat: -36.4850, lng: -72.7011, minZoom: 10 },
    { name: 'Quirihue',     lat: -36.2817, lng: -72.5417, minZoom: 10 },
    { name: 'Ninhue',       lat: -36.3986, lng: -72.3994, minZoom: 10 },
    { name: 'Portezuelo',   lat: -36.5278, lng: -72.4389, minZoom: 10 },
    { name: 'Ránquil',      lat: -36.6514, lng: -72.5486, minZoom: 10 },
    { name: 'San Nicolás',  lat: -36.5061, lng: -72.2131, minZoom: 10 },
    { name: 'Quillón',      lat: -36.7383, lng: -72.4736, minZoom: 10 },
    { name: 'Bulnes',       lat: -36.7422, lng: -72.2989, minZoom: 10 },
    { name: 'Yungay',       lat: -37.1194, lng: -72.0167, minZoom: 10 },
    { name: 'El Carmen',    lat: -36.8989, lng: -72.0278, minZoom: 10 },
    { name: 'Pemuco',       lat: -36.9678, lng: -72.1000, minZoom: 10 },
    { name: 'Pinto',        lat: -36.7000, lng: -71.9000, minZoom: 10 },
    { name: 'Coihueco',     lat: -36.6242, lng: -71.8308, minZoom: 10 },
    { name: 'San Fabián',   lat: -36.5531, lng: -71.5503, minZoom: 10 },

    { name: 'Tomé',         lat: -36.6167, lng: -72.9500, minZoom: 10 },
    { name: 'Penco',        lat: -36.7403, lng: -72.9986, minZoom: 10 },
    { name: 'Florida',      lat: -36.8208, lng: -72.6664, minZoom: 10 },
    { name: 'Hualqui',      lat: -36.9761, lng: -72.9356, minZoom: 10 },
    { name: 'Santa Juana',  lat: -37.1736, lng: -72.9375, minZoom: 10 },
    { name: 'Coronel',      lat: -37.0178, lng: -73.1400, minZoom: 10 },
    { name: 'Lota',         lat: -37.0894, lng: -73.1603, minZoom: 10 },
    { name: 'Cabrero',      lat: -37.0333, lng: -72.4000, minZoom: 10 },
    { name: 'Yumbel',       lat: -37.0833, lng: -72.5667, minZoom: 10 },
    { name: 'Laja',         lat: -37.2833, lng: -72.7167, minZoom: 10 },
    { name: 'Nacimiento',   lat: -37.5000, lng: -72.6667, minZoom: 10 },
    { name: 'Mulchén',      lat: -37.7167, lng: -72.2333, minZoom: 10 },
    { name: 'Santa Bárbara', lat: -37.6667, lng: -72.0167, minZoom: 10 },
    { name: 'Quilleco',     lat: -37.4667, lng: -71.9667, minZoom: 10 },
    { name: 'Tucapel',      lat: -37.2833, lng: -71.9500, minZoom: 10 },
    { name: 'Antuco',       lat: -37.3333, lng: -71.6833, minZoom: 10 },

    // Araucanía
    { name: 'Temuco',       lat: -38.7359, lng: -72.5904, minZoom: 7 },
    { name: 'Angol',        lat: -37.8000, lng: -72.7167, minZoom: 10 },
    { name: 'Victoria',     lat: -38.2333, lng: -72.3333, minZoom: 10 },
    { name: 'Lautaro',      lat: -38.5294, lng: -72.4361, minZoom: 10 },
    { name: 'Nueva Imperial', lat: -38.7442, lng: -72.9503, minZoom: 10 },
    { name: 'Carahue',      lat: -38.7000, lng: -73.1667, minZoom: 10 },
    { name: 'Puerto Saavedra', lat: -38.7833, lng: -73.4000, minZoom: 10 },
    { name: 'Galvarino',    lat: -38.4167, lng: -72.7833, minZoom: 10 },
    { name: 'Curacautín',   lat: -38.4333, lng: -71.8833, minZoom: 10 },
    { name: 'Lonquimay',    lat: -38.4500, lng: -71.2333, minZoom: 10 },
    { name: 'Vilcún',       lat: -38.6667, lng: -72.2333, minZoom: 10 },
    { name: 'Melipeuco',    lat: -38.8500, lng: -71.7000, minZoom: 10 },
    { name: 'Cunco',        lat: -38.9167, lng: -72.0333, minZoom: 10 },
    { name: 'Villarrica',   lat: -39.2856, lng: -72.2278, minZoom: 10 },
    { name: 'Pucón',        lat: -39.2733, lng: -71.9761, minZoom: 10 },
    { name: 'Loncoche',     lat: -39.3667, lng: -72.6333, minZoom: 10 },
    { name: 'Gorbea',       lat: -39.1000, lng: -72.6833, minZoom: 10 },
    { name: 'Pitrufquén',   lat: -38.9833, lng: -72.6500, minZoom: 10 },
    { name: 'Freire',       lat: -38.9500, lng: -72.6333, minZoom: 10 },
    { name: 'Toltén',       lat: -39.2167, lng: -73.2167, minZoom: 10 },
    { name: 'Teodoro Schmidt', lat: -38.9833, lng: -73.1000, minZoom: 10 },
    { name: 'Padre Las Casas', lat: -38.7667, lng: -72.6000, minZoom: 10 },

    // Los Ríos
    { name: 'Valdivia',     lat: -39.8142, lng: -73.2458, minZoom: 7 },
    { name: 'La Unión',     lat: -40.2833, lng: -73.0833, minZoom: 10 },
    { name: 'Río Bueno',    lat: -40.3333, lng: -72.9500, minZoom: 10 },
    { name: 'Paillaco',     lat: -40.0667, lng: -72.8833, minZoom: 10 },
    { name: 'Los Lagos',    lat: -39.8500, lng: -72.8333, minZoom: 10 },
    { name: 'Panguipulli',  lat: -39.6333, lng: -72.3333, minZoom: 10 },
    { name: 'Lanco',        lat: -39.4500, lng: -72.7833, minZoom: 10 },
    { name: 'San José de la Mariquina', lat: -39.5333, lng: -72.9667, minZoom: 10 },
    { name: 'Máfil',        lat: -39.6500, lng: -72.9500, minZoom: 10 },
    { name: 'Futrono',      lat: -40.1333, lng: -72.4000, minZoom: 10 },
    { name: 'Lago Ranco',   lat: -40.3167, lng: -72.5000, minZoom: 10 },
    { name: 'Corral',       lat: -39.8833, lng: -73.4333, minZoom: 10 },

    // Los Lagos
    { name: 'Puerto Montt', lat: -41.4693, lng: -72.9424, minZoom: 7 },
    { name: 'Osorno',       lat: -40.5739, lng: -73.1335, minZoom: 7 },
    { name: 'Castro',       lat: -42.4808, lng: -73.7622, minZoom: 7 },
    { name: 'Ancud',        lat: -41.8697, lng: -73.8203, minZoom: 10 },
    { name: 'Puerto Varas', lat: -41.3195, lng: -72.9854, minZoom: 10 },
    { name: 'Frutillar',    lat: -41.1264, lng: -73.0464, minZoom: 10 },
    { name: 'Llanquihue',   lat: -41.2572, lng: -73.0083, minZoom: 10 },
    { name: 'Calbuco',      lat: -41.7667, lng: -73.1333, minZoom: 10 },
    { name: 'Maullín',      lat: -41.6167, lng: -73.6000, minZoom: 10 },
    { name: 'Los Muermos',  lat: -41.4000, lng: -73.4833, minZoom: 10 },
    { name: 'Fresia',       lat: -41.1500, lng: -73.4167, minZoom: 10 },
    { name: 'Purranque',    lat: -40.9167, lng: -73.1667, minZoom: 10 },
    { name: 'Río Negro',    lat: -40.7833, lng: -73.2333, minZoom: 10 },
    { name: 'Puyehue',      lat: -40.6833, lng: -72.6167, minZoom: 10 },
    { name: 'Puerto Octay', lat: -40.9667, lng: -72.9000, minZoom: 10 },
    { name: 'Chonchi',      lat: -42.6167, lng: -73.8000, minZoom: 10 },
    { name: 'Dalcahue',     lat: -42.3833, lng: -73.6500, minZoom: 10 },
    { name: 'Quellón',      lat: -43.1167, lng: -73.6167, minZoom: 10 },
    { name: 'Achao',        lat: -42.4667, lng: -73.5000, minZoom: 10 },
    { name: 'Quemchi',      lat: -42.1333, lng: -73.4833, minZoom: 10 },
    { name: 'Chaitén',      lat: -42.9167, lng: -72.7167, minZoom: 10 },
    { name: 'Hualaihué',    lat: -42.0167, lng: -72.6833, minZoom: 10 },
    { name: 'Cochamó',      lat: -41.5000, lng: -72.3167, minZoom: 10 },
    { name: 'Futaleufú',    lat: -43.1833, lng: -71.8500, minZoom: 10 },
    { name: 'Palena',       lat: -43.6167, lng: -71.8000, minZoom: 10 }
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
    PARTICLE_COUNT: 150,
    WIND_ANIMATION_SPEED: 0.85,
    // Nominatim exige como máximo 1 petición por segundo.
    NOMINATIM_MIN_INTERVAL_MS: 1100
  };
})(window.RDCFT = window.RDCFT || {});
