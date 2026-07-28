/**
 * RDCFT · Campo espacial y escalas de color
 *
 * Sustituye a la antigua `getFieldValue()`, que producía valores sintéticos
 * (`base + latDiff * 1.5 + lngDiff * -1.2`): los badges de ciudad y el mapa de
 * calor mostraban cifras inventadas con la misma apariencia que un pronóstico.
 * Ahora cada punto de muestreo trae su propio pronóstico real y los puntos
 * intermedios se interpolan por distancia inversa (IDW), lo que se declara en la
 * leyenda.
 */
(function (RDCFT) {
  'use strict';

  /** Valor real de una capa en un punto de muestreo, para el día/hora activos. */
  function sampleValue(sample, layer) {
    const st = RDCFT.state;
    const layerCfg = RDCFT.config.LAYERS[layer];
    if (!sample?.hourly || !layerCfg || !st.weatherData?.daily) return null;

    const dateStr = st.weatherData.daily.time[st.selectedDayIndex];
    const idx = RDCFT.weather.indexFor(sample.hourly, dateStr, st.selectedHour);
    if (idx < 0) return null;

    const series = sample.hourly[layerCfg.field];
    return RDCFT.utils.num(series?.[idx], null);
  }

  /** Puntos de muestreo con valor conocido para la capa indicada. */
  function knownPoints(layer) {
    const points = [];
    RDCFT.state.regionalSamples.forEach(s => {
      const value = sampleValue(s, layer);
      if (value !== null) points.push({ lat: s.lat, lng: s.lng, value: value, name: s.name });
    });

    // El punto consultado siempre participa: tiene el pronóstico más detallado.
    const own = RDCFT.weather.currentSample();
    if (own) {
      const map = { temp: 'temp', humidity: 'humidity', rain: 'rain' };
      const value = RDCFT.utils.num(own[map[layer]], null);
      if (value !== null) {
        points.push({
          lat: RDCFT.state.coords.lat,
          lng: RDCFT.state.coords.lng,
          value: value,
          name: RDCFT.state.locationName
        });
      }
    }
    return points;
  }

  /**
   * Interpolación por distancia inversa (IDW, potencia 2) sobre los puntos con
   * pronóstico real. No es un modelo meteorológico: es una interpolación
   * declarada entre estaciones, no un dato medido.
   */
  function interpolate(points, lat, lng) {
    if (!points.length) return null;

    let numerator = 0;
    let denominator = 0;
    for (const p of points) {
      const dLat = lat - p.lat;
      const dLng = lng - p.lng;
      const d2 = dLat * dLat + dLng * dLng;
      if (d2 < 1e-8) return p.value;   // prácticamente sobre el punto
      const weight = 1 / d2;           // potencia 2 → 1/d²
      numerator += weight * p.value;
      denominator += weight;
    }
    return denominator ? numerator / denominator : null;
  }

  /** Color RGB de un valor dentro de la escala de su capa. */
  function colorForValue(layer, value) {
    const cfg = RDCFT.config.LAYERS[layer];
    if (!cfg) return [255, 255, 255];

    const t = RDCFT.utils.clamp((value - cfg.min) / (cfg.max - cfg.min), 0, 1);
    const segments = cfg.colors.length - 1;
    const segment = Math.min(segments - 1, Math.floor(t * segments));
    const localT = (t * segments) - segment;
    const c1 = cfg.colors[segment];
    const c2 = cfg.colors[segment + 1];

    return [
      Math.round(c1[0] + (c2[0] - c1[0]) * localT),
      Math.round(c1[1] + (c2[1] - c1[1]) * localT),
      Math.round(c1[2] + (c2[2] - c1[2]) * localT)
    ];
  }

  /** Degradado CSS de una capa, derivado de los mismos colores del mapa de calor. */
  function gradientCss(layer) {
    const cfg = RDCFT.config.LAYERS[layer];
    if (!cfg) return 'none';
    const stops = cfg.colors.map(c => `rgb(${c[0]}, ${c[1]}, ${c[2]})`).join(', ');
    return `linear-gradient(to right, ${stops})`;
  }

  RDCFT.field = { sampleValue, knownPoints, interpolate, colorForValue, gradientCss };
})(window.RDCFT = window.RDCFT || {});
