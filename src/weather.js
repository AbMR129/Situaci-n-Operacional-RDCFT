/**
 * RDCFT · Acceso a datos
 * Open-Meteo (pronóstico) y Nominatim (geocodificación), más el indexado de la
 * serie horaria.
 */
(function (RDCFT) {
  'use strict';

  const HOURLY_VARS = [
    'temperature_2m',
    'relative_humidity_2m',
    'precipitation',
    'wind_speed_10m',
    'wind_direction_10m',
    'wind_gusts_10m'
  ].join(',');

  const DAILY_VARS = [
    'temperature_2m_max',
    'temperature_2m_min',
    'precipitation_sum',
    'wind_speed_10m_max'
  ].join(',');

  // Variables mínimas para los badges de ciudad y el mapa de calor.
  const REGIONAL_VARS = 'temperature_2m,relative_humidity_2m,precipitation';

  const API = 'https://api.open-meteo.com/v1/forecast';

  /**
   * Índice dentro de `hourly.time` para un día y una hora dados.
   *
   * Sustituye a la aritmética `díaIndex * 24 + hora`, que asumía 24 entradas por
   * día. Con `timezone=auto` la API devuelve horas locales y en los cambios de
   * horario de Chile (septiembre y abril) hay días de 23 o 25 horas, lo que
   * descuadraba todos los índices posteriores. Si la hora exacta no existe
   * (la hora que se salta al adelantar el reloj), se usa la más cercana del día.
   */
  function indexFor(hourly, dateStr, hour) {
    if (!hourly || !Array.isArray(hourly.time) || !dateStr) return -1;

    const target = `${dateStr}T${String(hour).padStart(2, '0')}:00`;
    const exact = hourly.time.indexOf(target);
    if (exact !== -1) return exact;

    let best = -1;
    let bestDelta = Infinity;
    for (let i = 0; i < hourly.time.length; i++) {
      const stamp = hourly.time[i];
      if (!stamp.startsWith(dateStr)) continue;
      const h = parseInt(stamp.slice(11, 13), 10);
      const delta = Math.abs(h - hour);
      if (delta < bestDelta) {
        bestDelta = delta;
        best = i;
      }
    }
    return best;
  }

  /** Extrae una muestra completa en un índice horario. */
  function sampleAt(hourly, idx) {
    if (!hourly || idx < 0 || idx >= hourly.time.length) return null;
    const n = RDCFT.utils.num;
    return {
      time: hourly.time[idx],
      temp: n(hourly.temperature_2m?.[idx], null),
      humidity: n(hourly.relative_humidity_2m?.[idx], null),
      rain: n(hourly.precipitation?.[idx], null),
      wind: n(hourly.wind_speed_10m?.[idx], null),
      gust: n(hourly.wind_gusts_10m?.[idx], null),
      direction: n(hourly.wind_direction_10m?.[idx], null)
    };
  }

  /** Muestra del día/hora seleccionados en el punto consultado. */
  function currentSample() {
    const st = RDCFT.state;
    if (!st.weatherData?.hourly || !st.weatherData?.daily) return null;
    const dateStr = st.weatherData.daily.time[st.selectedDayIndex];
    return sampleAt(st.weatherData.hourly, indexFor(st.weatherData.hourly, dateStr, st.selectedHour));
  }

  async function getJSON(url, signal) {
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} al consultar ${url}`);
    return res.json();
  }

  /** Pronóstico completo del punto consultado. */
  function fetchForecast(lat, lng, signal) {
    const url = `${API}?latitude=${lat}&longitude=${lng}` +
      `&hourly=${HOURLY_VARS}&daily=${DAILY_VARS}` +
      `&forecast_days=${RDCFT.config.FORECAST_DAYS}&timezone=auto`;
    return getJSON(url, signal);
  }

  /**
   * Pronóstico real de todos los puntos regionales en UNA sola petición
   * multipunto. Antes estos valores se inventaban desplazando linealmente el dato
   * del punto consultado, así que los badges de ciudad mostraban cifras que no
   * correspondían a ningún pronóstico.
   */
  async function fetchRegional(points, signal) {
    const lats = points.map(p => p.lat).join(',');
    const lngs = points.map(p => p.lng).join(',');
    const url = `${API}?latitude=${lats}&longitude=${lngs}` +
      `&hourly=${REGIONAL_VARS}&forecast_days=${RDCFT.config.FORECAST_DAYS}&timezone=auto`;

    const data = await getJSON(url, signal);
    const list = Array.isArray(data) ? data : [data];
    return points.map((p, i) => ({
      name: p.name,
      lat: p.lat,
      lng: p.lng,
      hourly: list[i]?.hourly ?? null
    }));
  }

  // --- Nominatim, con limitación de tasa (su política permite 1 req/s) ---
  let nominatimQueue = Promise.resolve();
  let lastNominatimCall = 0;

  function throttleNominatim(task) {
    const run = nominatimQueue.then(async () => {
      const wait = RDCFT.config.NOMINATIM_MIN_INTERVAL_MS - (Date.now() - lastNominatimCall);
      if (wait > 0) await new Promise(r => setTimeout(r, wait));
      lastNominatimCall = Date.now();
      return task();
    });
    // La cola no debe romperse si una tarea falla, pero quien llama sí recibe el error.
    nominatimQueue = run.catch(() => {});
    return run;
  }

  function reverseGeocode(lat, lng, signal) {
    return throttleNominatim(async () => {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10`;
      const data = await getJSON(url, signal);
      const a = data.address || {};
      return a.city || a.town || a.village || a.suburb || a.county || a.state || 'Chile';
    });
  }

  function searchPlace(query, signal) {
    return throttleNominatim(async () => {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=cl&q=${encodeURIComponent(query)}`;
      const results = await getJSON(url, signal);
      if (!results || !results.length) return null;
      return {
        lat: parseFloat(results[0].lat),
        lng: parseFloat(results[0].lon),
        name: results[0].display_name.split(',')[0]
      };
    });
  }

  RDCFT.weather = {
    indexFor,
    sampleAt,
    currentSample,
    fetchForecast,
    fetchRegional,
    reverseGeocode,
    searchPlace
  };
})(window.RDCFT = window.RDCFT || {});
