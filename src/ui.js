/**
 * RDCFT · Renderizado de interfaz
 * Todo el DOM del panel lateral, la leyenda y los indicadores del mapa.
 */
(function (RDCFT) {
  'use strict';

  const $ = id => document.getElementById(id);

  // --- Fecha seleccionada, tomada del pronóstico (no del reloj del navegador) ---
  function selectedDateStr() {
    const daily = RDCFT.state.weatherData?.daily;
    if (!daily?.time?.length) return null;
    const idx = RDCFT.utils.clamp(RDCFT.state.selectedDayIndex, 0, daily.time.length - 1);
    return daily.time[idx];
  }

  /** Muestras de la ventana operacional para un día dado. */
  function dayEvaluations(dateStr) {
    const hourly = RDCFT.state.weatherData?.hourly;
    if (!hourly || !dateStr) return [];
    return RDCFT.config.OPERATIONAL_HOURS.map(hour => {
      const idx = RDCFT.weather.indexFor(hourly, dateStr, hour);
      const sample = RDCFT.weather.sampleAt(hourly, idx);
      return { hour, sample, evaluation: RDCFT.rdcft.evaluate(sample) };
    });
  }

  function renderAll() {
    renderDateSelector();
    renderSidebarCards();
    renderOperationalSummary();
    renderComparison();
    renderLegend();
    updateLayerButtons();
    updateDateIndicator();
    updateHourLabel();
  }

  // --- Selector de días ---
  function renderDateSelector() {
    const container = $('ui-date-selector');
    const daily = RDCFT.state.weatherData?.daily;
    if (!container || !daily?.time) return;

    const days = Math.min(RDCFT.config.DAYS_IN_SELECTOR, daily.time.length);
    let html = '';

    for (let i = 0; i < days; i++) {
      const dateStr = daily.time[i];
      const isSelected = i === RDCFT.state.selectedDayIndex;

      // El semáforo del día es la PEOR condición de la ventana operacional: basta
      // una hora fuera de prescripción para que el día no sea limpio. Antes se
      // evaluaba una única hora arbitraria (las 14:00), que podía contradecir a
      // las tarjetas mostradas justo debajo.
      const worst = RDCFT.rdcft.worst(dayEvaluations(dateStr).map(d => d.evaluation));

      html += `
        <button type="button" data-day="${i}"
                class="day-chip min-w-[58px] ${isSelected ? 'day-chip-active' : 'day-chip-inactive'} rounded-industrial p-2 flex flex-col items-center transition-all cursor-pointer"
                aria-pressed="${isSelected}"
                aria-label="${RDCFT.utils.escapeHtml(RDCFT.utils.formatLongDate(dateStr))}: ${worst.status}">
          <span class="text-[10px] uppercase ${isSelected ? 'font-bold' : 'opacity-70'}">${RDCFT.utils.dayNameShort(dateStr)}</span>
          <span class="text-xl font-black">${RDCFT.utils.dayNumber(dateStr)}</span>
          <span class="w-2 h-2 rounded-full ${worst.indicatorColor} mt-1 shadow-sm"></span>
        </button>
      `;
    }

    container.innerHTML = html;
  }

  // --- Tarjetas horarias ---
  function weatherIcon(hour, rain) {
    if (rain !== null && rain > 0.2) {
      return '<svg class="w-8 h-8 text-sky-500" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M19.35 10.04A7.49 7.49 0 0012 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 000 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM10 17l1.5-3H9l3-5v4h2l-3 4z"></path></svg>';
    }
    if (hour <= 10) {
      return '<svg class="w-8 h-8 text-sky-500" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.76 4.84l-1.8-1.79-1.41 1.41 1.79 1.79 1.42-1.41zM4 10.5H1v2h3v-2zm9-9.95h-2V3.5h2V.55zm7.45 3.91l-1.41-1.41-1.79 1.79 1.41 1.41 1.79-1.79zm-3.21 13.7l1.79 1.8 1.41-1.41-1.8-1.79-1.4 1.4zM20 10.5v2h3v-2h-3zm-8-5c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm-1 16.95h2V19.5h-2v2.95zm-7.45-3.91l1.41 1.41 1.79-1.8-1.41-1.41-1.79 1.8z"></path></svg>';
    }
    if (hour <= 15) {
      return '<svg class="w-8 h-8 text-amber-500" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1z"></path></svg>';
    }
    return '<svg class="w-8 h-8 text-orange-500" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6a6 6 0 100 12 6 6 0 000-12zm0-4a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm0 18a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM2 12a1 1 0 011-1h1a1 1 0 110 2H3a1 1 0 01-1-1zm18 0a1 1 0 011-1h1a1 1 0 110 2h-1a1 1 0 01-1-1z"></path></svg>';
  }

  function renderSidebarCards() {
    const container = $('ui-timeline-cards');
    const dateStr = selectedDateStr();
    if (!container || !dateStr) return;

    const rows = dayEvaluations(dateStr);
    const u = RDCFT.utils;
    let html = '';

    rows.forEach(({ hour, sample, evaluation }) => {
      if (!sample) return;

      const temp = sample.temp === null ? '—' : Math.round(sample.temp);
      const hum = sample.humidity === null ? '—' : Math.round(sample.humidity);
      const rain = sample.rain === null ? '—' : sample.rain.toFixed(1);
      const wind = sample.wind === null ? '—' : Math.round(sample.wind);
      const gust = sample.gust === null ? '—' : Math.round(sample.gust);
      const dir = sample.direction;
      const dirText = dir === null ? '—' : `${Math.round(dir)}° ${u.cardinalDirection(dir)}`;
      const arrow = dir === null ? '' : u.windArrow(dir);
      const rainy = sample.rain !== null && sample.rain > 0;

      html += `
        <article class="bg-stone-100 dark:bg-industrial-corteza/80 rounded-industrial p-5 border border-stone-300 dark:border-stone-800 space-y-4 shadow-sm hover:border-stone-400 dark:hover:border-stone-700 transition-all">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <span class="text-xl font-black text-stone-800 dark:text-white">${String(hour).padStart(2, '0')}:00</span>
              ${weatherIcon(hour, sample.rain)}
            </div>
            <div class="flex items-center gap-1.5 ${evaluation.cardClass} px-2.5 py-1 rounded text-[10px] font-black tracking-wide border border-current/20">
              <span class="w-2 h-2 rounded-full ${evaluation.indicatorColor}"></span>
              ${evaluation.status}
            </div>
          </div>

          <div class="grid grid-cols-3 gap-3 text-center bg-stone-200/70 dark:bg-stone-900/60 p-3 rounded-industrial border border-stone-300/80 dark:border-stone-800/80">
            <div>
              <p class="text-[10px] text-stone-500 dark:text-stone-400 uppercase font-bold">Temp.</p>
              <p class="text-sky-700 dark:text-industrial-calipso font-black text-lg">${temp}°C</p>
            </div>
            <div>
              <p class="text-[10px] text-stone-500 dark:text-stone-400 uppercase font-bold">Humedad</p>
              <p class="text-sky-700 dark:text-industrial-calipso font-black text-lg">${hum}%</p>
            </div>
            <div>
              <p class="text-[10px] text-stone-500 dark:text-stone-400 uppercase font-bold">Lluvia</p>
              <p class="${rainy ? 'text-sky-700 dark:text-industrial-calipso font-black text-lg' : 'text-stone-500 dark:text-stone-400 font-bold text-base'}">${rain} mm</p>
            </div>
            <div>
              <p class="text-[10px] text-stone-500 dark:text-stone-400 uppercase font-bold">Viento</p>
              <p class="text-stone-900 dark:text-white font-black text-sm">${arrow} ${wind} km/h</p>
            </div>
            <div>
              <p class="text-[10px] text-stone-500 dark:text-stone-400 uppercase font-bold">Racha</p>
              <p class="text-amber-600 dark:text-industrial-amarillo font-black text-lg">${gust} km/h</p>
            </div>
            <div>
              <p class="text-[10px] text-stone-500 dark:text-stone-400 uppercase font-bold">Dirección</p>
              <p class="text-stone-900 dark:text-white font-black text-sm">${dirText}</p>
            </div>
          </div>

          <p class="text-xs text-stone-700 dark:text-stone-300 leading-relaxed border-t border-stone-300/80 dark:border-stone-800/80 pt-3">
            ${evaluation.summary}
          </p>
        </article>
      `;
    });

    container.innerHTML = html || '<p class="text-sm text-stone-500">Sin pronóstico horario disponible para este día.</p>';

    // El badge de cabecera resume el día completo con el mismo criterio conservador
    // que el punto de color del selector, para que nunca se contradigan.
    const badge = $('ui-status-badge');
    if (badge) {
      const worst = RDCFT.rdcft.worst(rows.map(r => r.evaluation));
      badge.className = `px-3 py-1 rounded-full text-[10px] font-black uppercase border ${worst.badgeClass}`;
      badge.textContent = worst.status;
    }

    const sidebarDate = $('ui-sidebar-date');
    if (sidebarDate) sidebarDate.textContent = RDCFT.utils.formatLongDate(dateStr);
  }

  /** Resumen para decidir antes de entrar al detalle horario. */
  function renderOperationalSummary() {
    const el = $('ui-operational-summary');
    const dateStr = selectedDateStr();
    if (!el || !dateStr) return;

    const rows = dayEvaluations(dateStr).filter(row => row.sample && row.evaluation.score >= 0);
    if (!rows.length) {
      el.innerHTML = '<p class="text-xs text-stone-500 dark:text-stone-400">Sin datos suficientes para resumir la jornada.</p>';
      return;
    }

    const worst = RDCFT.rdcft.worst(rows.map(row => row.evaluation));
    const best = rows.reduce((current, row) => (
      row.evaluation.score < current.evaluation.score ? row : current
    ), rows[0]);
    const bestHour = `${String(best.hour).padStart(2, '0')}:00`;
    const restriction = worst.reasons?.[0] || 'Sin restricciones dentro de la ventana operacional.';
    const hourButtons = rows.map(row => {
      const hour = String(row.hour).padStart(2, '0');
      const selected = row.hour === RDCFT.state.selectedHour;
      return `<button type="button" data-summary-hour="${row.hour}" class="min-w-10 h-9 rounded-industrial border text-[10px] font-black transition-colors ${selected ? 'bg-industrial-naranja border-industrial-naranja text-white' : `${row.evaluation.cardClass} border-current/20 hover:bg-stone-200 dark:hover:bg-stone-800`}" aria-pressed="${selected}" aria-label="Mostrar ${hour}:00, ${RDCFT.utils.escapeHtml(row.evaluation.status)}">${hour}</button>`;
    }).join('');

    el.innerHTML = `
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-[10px] uppercase tracking-widest font-black text-stone-500 dark:text-stone-400">Resumen operacional</p>
          <p class="mt-1 text-sm font-black text-stone-900 dark:text-white">Mejor ventana: ${bestHour}</p>
        </div>
        <span class="shrink-0 px-2.5 py-1 rounded-full text-[10px] font-black uppercase border ${worst.badgeClass}">${RDCFT.utils.escapeHtml(worst.status)}</span>
      </div>
      <p class="mt-3 pt-3 border-t border-stone-300/80 dark:border-stone-700 text-xs leading-relaxed text-stone-700 dark:text-stone-300">
        <span class="font-bold">${worst.score === 0 ? 'Jornada apta:' : 'Principal restricción:'}</span> ${RDCFT.utils.escapeHtml(restriction)}
      </p>
      <div class="mt-3 flex items-center justify-between gap-2">
        <span class="text-[10px] uppercase tracking-wider font-bold text-stone-500 dark:text-stone-400">Horas</span>
        <div class="flex gap-1" role="group" aria-label="Elegir hora operacional">${hourButtons}</div>
      </div>
    `;
  }

  /** Compara dos ubicaciones elegidas explícitamente por la persona usuaria. */
  function renderComparison() {
    const el = $('ui-comparison-card');
    const comparison = RDCFT.state.comparison;
    const dateStr = selectedDateStr();
    if (!el) return;

    const pointA = comparison.pointA;
    const pointB = comparison.pointB;
    if (!pointA || !pointB) {
      el.innerHTML = '<p class="text-xs text-stone-500 dark:text-stone-400">Selecciona las dos ubicaciones y confirma la comparación.</p>';
      return;
    }
    if (comparison.isLoading) {
      el.innerHTML = '<p class="text-xs text-stone-500 dark:text-stone-400">Consultando pronósticos para ambas ubicaciones…</p>';
      return;
    }
    if (!pointA.weatherData?.hourly || !pointB.weatherData?.hourly || !dateStr) {
      el.innerHTML = '<p class="text-xs text-rose-600 dark:text-rose-400">No fue posible cargar el pronóstico de ambas ubicaciones.</p>';
      return;
    }

    const sampleFor = (point, hour) => RDCFT.weather.sampleAt(
      point.weatherData.hourly,
      RDCFT.weather.indexFor(point.weatherData.hourly, dateStr, hour)
    );
    const sampleA = sampleFor(pointA, RDCFT.state.selectedHour);
    const sampleB = sampleFor(pointB, RDCFT.state.selectedHour);
    const evaluationA = RDCFT.rdcft.evaluate(sampleA);
    const evaluationB = RDCFT.rdcft.evaluate(sampleB);
    const value = (number, unit) => number === null || number === undefined ? '—' : `${Math.round(number)}${unit}`;
    const metric = (label, a, b, unit) => `
      <div class="rounded-industrial bg-stone-100 dark:bg-stone-800/70 p-2.5 text-center">
        <p class="text-[9px] uppercase font-bold text-stone-500 dark:text-stone-400">${label}</p>
        <p class="mt-1 grid grid-cols-2 gap-1 text-[11px] font-black text-stone-900 dark:text-white"><span>A ${value(a, unit)}</span><span>B ${value(b, unit)}</span></p>
      </div>`;

    let verdict = 'Ambas ubicaciones presentan condiciones operacionales equivalentes.';
    if (evaluationA.score < evaluationB.score) verdict = 'La ubicación A presenta una condición operacional más favorable ahora.';
    if (evaluationB.score < evaluationA.score) verdict = 'La ubicación B presenta una condición operacional más favorable ahora.';
    const timeRows = RDCFT.config.OPERATIONAL_HOURS.map(hour => {
      const statusA = RDCFT.rdcft.evaluate(sampleFor(pointA, hour));
      const statusB = RDCFT.rdcft.evaluate(sampleFor(pointB, hour));
      const label = `${String(hour).padStart(2, '0')}:00 · A: ${statusA.status}; B: ${statusB.status}`;
      return `<div class="flex flex-col items-center gap-1" title="${RDCFT.utils.escapeHtml(label)}" aria-label="${RDCFT.utils.escapeHtml(label)}"><span class="text-[9px] font-black text-stone-500 dark:text-stone-400">${String(hour).padStart(2, '0')}</span><span class="flex gap-0.5" aria-hidden="true"><i class="w-2 h-2 rounded-full ${statusA.indicatorColor}"></i><i class="w-2 h-2 rounded-full ${statusB.indicatorColor}"></i></span></div>`;
    }).join('');
    const pointHeader = (point, letter, evaluation) => `
      <div class="min-w-0 rounded-industrial border border-stone-200 dark:border-stone-700 bg-white/80 dark:bg-stone-950/30 p-3">
        <div class="flex items-start justify-between gap-2"><p class="min-w-0 truncate text-xs font-black text-stone-900 dark:text-white">${letter}. ${RDCFT.utils.escapeHtml(point.name)}</p><span class="shrink-0 px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase border ${evaluation.badgeClass}">${RDCFT.utils.escapeHtml(evaluation.status)}</span></div>
        <p class="mt-2 text-[10px] leading-relaxed text-stone-600 dark:text-stone-300">${RDCFT.utils.escapeHtml(evaluation.reasons?.[0] || 'Sin restricciones activas.')}</p>
        <button type="button" data-use-comparison="${letter}" class="mt-2 text-[10px] font-black text-orange-700 dark:text-industrial-naranja hover:underline">Usar como punto principal</button>
      </div>`;

    el.innerHTML = `
      <div class="border-t border-stone-200 dark:border-stone-700 pt-3 space-y-3">
        <p class="text-[10px] text-stone-500 dark:text-stone-400">Condiciones a las ${String(RDCFT.state.selectedHour).padStart(2, '0')}:00 del ${RDCFT.utils.escapeHtml(RDCFT.utils.formatDDMMYYYY(dateStr))}</p>
        <div class="grid grid-cols-2 gap-2">${pointHeader(pointA, 'A', evaluationA)}${pointHeader(pointB, 'B', evaluationB)}</div>
        <div class="rounded-industrial border border-stone-200 dark:border-stone-700 bg-white/80 dark:bg-stone-950/30 p-3"><p class="text-xs font-black text-stone-800 dark:text-stone-100">${verdict}</p></div>
        <div class="grid grid-cols-2 gap-2">
          ${metric('Temperatura', sampleA?.temp, sampleB?.temp, '°C')}
          ${metric('Humedad', sampleA?.humidity, sampleB?.humidity, '%')}
          ${metric('Viento', sampleA?.wind, sampleB?.wind, ' km/h')}
          ${metric('Racha', sampleA?.gust, sampleB?.gust, ' km/h')}
          ${metric('Lluvia', sampleA?.rain, sampleB?.rain, ' mm')}
        </div>
        <div class="pt-3 border-t border-stone-200 dark:border-stone-700"><div class="flex items-center justify-between gap-3"><p class="text-[10px] uppercase tracking-wider font-black text-stone-500 dark:text-stone-400">Ventana operacional</p><p class="text-[9px] text-stone-500 dark:text-stone-400">Punto izq.: A · der.: B</p></div><div class="mt-2 flex items-center justify-between">${timeRows}</div></div>
      </div>
    `;
  }

  // --- Leyenda de color ---
  function renderLegend() {
    const el = $('ui-color-legend');
    if (!el) return;

    const layer = RDCFT.state.activeLayer;
    const cfg = RDCFT.config.LAYERS[layer];
    if (!cfg) {
      el.classList.add('hidden');
      el.innerHTML = '';
      return;
    }

    const ticks = cfg.ticks
      .map(t => `<span>${RDCFT.utils.escapeHtml(t)}</span>`)
      .join('');

    const sources = RDCFT.field.knownPoints(layer).length;

    el.innerHTML = `
      <div class="flex flex-col gap-1 text-[10px] font-bold text-stone-800 dark:text-stone-200">
        <div class="flex justify-between text-[9px] text-stone-500 dark:text-stone-400 w-44 xl:w-64">${ticks}</div>
        <div class="h-2.5 w-44 xl:w-64 rounded-full shadow-inner" style="background: ${RDCFT.field.gradientCss(layer)};"></div>
        <div class="text-right text-[9px] text-stone-500 dark:text-stone-400">
          ${RDCFT.utils.escapeHtml(cfg.label)} (${RDCFT.utils.escapeHtml(cfg.unit)}) · interpolado desde ${sources} punto${sources === 1 ? '' : 's'} de pronóstico
        </div>
      </div>
    `;
    el.classList.remove('hidden');
  }

  function updateLayerButtons() {
    document.querySelectorAll('.layer-btn').forEach(btn => {
      const active = btn.dataset.layer === RDCFT.state.activeLayer;
      btn.classList.toggle('chip-active', active);
      btn.classList.toggle('chip-inactive', !active);
      btn.setAttribute('aria-pressed', String(active));
    });
  }

  // --- Indicadores del mapa ---
  function updateCoords() {
    const st = RDCFT.state;
    const decimal = $('ui-coords-decimal');
    const dms = $('ui-coords-dms');
    if (decimal) decimal.textContent = `${st.coords.lat.toFixed(4)}, ${st.coords.lng.toFixed(4)}`;
    if (dms) dms.textContent = RDCFT.utils.formatCoordsDMS(st.coords.lat, st.coords.lng);
  }

  function updateComuna() {
    const el = $('ui-comuna-name');
    if (el) el.textContent = `Comuna: ${RDCFT.state.comunaName}`;
  }

  /**
   * Actualiza el título del paisaje. Antes esta función sólo se llamaba dentro de
   * una condición que nunca se cumplía (`locationName.startsWith('Coordenada')`),
   * así que el encabezado se quedaba congelado en "Valle de Cauquenes" aunque se
   * cambiara de punto, se buscara un lugar o se eligiera otro paisaje.
   */
  function updateLocationHeader() {
    const st = RDCFT.state;
    const title = $('ui-location-title');
    const paisaje = $('ui-map-paisaje');
    if (title) title.textContent = st.locationName;
    if (paisaje) paisaje.textContent = `Paisaje: ${st.locationName}`;

    // Mantener sincronizado el desplegable con la ubicación real.
    const select = $('ui-select-paisaje');
    if (select) {
      const match = RDCFT.config.PAISAJES.some(p => p.name === st.locationName);
      select.value = match ? st.locationName : '__custom__';
    }
  }

  function updateDateIndicator() {
    const el = $('ui-date-indicator');
    const dateStr = selectedDateStr();
    if (!el || !dateStr) return;
    el.textContent = `Día ${RDCFT.state.selectedDayIndex + 1}: ${RDCFT.utils.formatDDMMYYYY(dateStr)}`;
  }

  function updateHourLabel() {
    const label = $('ui-hour-label');
    const slider = $('ui-hour-slider');
    const hour = String(RDCFT.state.selectedHour).padStart(2, '0');
    if (label) label.textContent = `${hour}:00`;
    if (slider) {
      slider.value = String(RDCFT.state.selectedHour);
      slider.setAttribute('aria-valuetext', `${hour}:00`);
    }
  }

  function setLoading(isLoading) {
    const loader = $('ui-loader');
    if (loader) loader.classList.toggle('hidden', !isLoading);
  }

  /** Aviso no bloqueante; reemplaza a los `alert()` de la versión anterior. */
  function toast(message, type) {
    const host = $('ui-toasts');
    if (!host) return;

    const el = document.createElement('div');
    el.className = `toast toast-${type || 'info'}`;
    el.setAttribute('role', 'status');
    el.textContent = message;
    host.appendChild(el);

    setTimeout(() => {
      el.classList.add('toast-out');
      setTimeout(() => el.remove(), 300);
    }, 4500);
  }

  RDCFT.ui = {
    renderAll,
    renderDateSelector,
    renderSidebarCards,
    renderOperationalSummary,
    renderComparison,
    renderLegend,
    updateLayerButtons,
    updateCoords,
    updateComuna,
    updateLocationHeader,
    updateDateIndicator,
    updateHourLabel,
    setLoading,
    toast,
    selectedDateStr,
    dayEvaluations
  };
})(window.RDCFT = window.RDCFT || {});
