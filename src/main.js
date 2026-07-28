/**
 * RDCFT · Arranque y orquestación
 * Une los módulos, enlaza los eventos de la interfaz y coordina la carga de datos.
 */
(function (RDCFT) {
  'use strict';

  const st = RDCFT.state;
  const CUSTOM_OPTION = '__custom__';

  // --- Cambios que obligan a repintar todo lo que depende de los datos ---
  function refreshDerived() {
    RDCFT.ui.renderAll();
    RDCFT.map.renderCityBadges(selectPoint);
    RDCFT.canvas.refreshParticles();
    RDCFT.markHeatmapDirty();
  }

  /**
   * Selecciona un punto y carga su pronóstico.
   *
   * Cada llamada obtiene un número de secuencia y cancela la petición anterior:
   * antes, dos clics seguidos podían resolverse en desorden y la respuesta vieja
   * sobrescribía a la nueva.
   */
  async function selectPoint(lat, lng, name) {
    st.coords = { lat: parseFloat(lat.toFixed(4)), lng: parseFloat(lng.toFixed(4)) };
    if (name) st.locationName = name;

    RDCFT.map.moveMarker(st.coords.lat, st.coords.lng);
    RDCFT.ui.updateCoords();
    RDCFT.ui.updateLocationHeader();

    const seq = ++st.requestSeq;
    if (st.activeController) st.activeController.abort();
    const controller = new AbortController();
    st.activeController = controller;

    RDCFT.ui.setLoading(true);
    try {
      const data = await RDCFT.weather.fetchForecast(st.coords.lat, st.coords.lng, controller.signal);
      if (seq !== st.requestSeq) return;   // llegó tarde: ya hay otra consulta en curso
      st.weatherData = data;
      refreshDerived();
    } catch (err) {
      if (err.name === 'AbortError' || seq !== st.requestSeq) return;
      console.error('Error al obtener el pronóstico:', err);
      RDCFT.ui.toast('No se pudo obtener el pronóstico meteorológico. Revise su conexión.', 'error');
    } finally {
      if (seq === st.requestSeq) RDCFT.ui.setLoading(false);
    }

    resolveComuna(seq, !name);
  }

  /** Geocodificación inversa en segundo plano: nunca bloquea el pronóstico. */
  async function resolveComuna(seq, adoptAsLocationName) {
    try {
      const comuna = await RDCFT.weather.reverseGeocode(st.coords.lat, st.coords.lng);
      if (seq !== st.requestSeq || !comuna) return;

      st.comunaName = comuna;
      RDCFT.ui.updateComuna();

      // Si el punto no traía nombre propio (clic libre en el mapa), la comuna pasa
      // a ser el nombre del paisaje mostrado.
      if (adoptAsLocationName) {
        st.locationName = comuna;
        RDCFT.ui.updateLocationHeader();
      }
    } catch (err) {
      console.warn('Geocodificación inversa no disponible:', err);
    }
  }

  /** Pronóstico real de los puntos regionales: una sola petición multipunto. */
  async function loadRegionalSamples() {
    try {
      st.regionalSamples = await RDCFT.weather.fetchRegional(RDCFT.config.REGIONAL_SPOTS);
      RDCFT.map.renderCityBadges(selectPoint);
      RDCFT.ui.renderLegend();
      RDCFT.markHeatmapDirty();
    } catch (err) {
      console.warn('No se pudieron cargar los puntos regionales:', err);
      RDCFT.ui.toast('Los puntos regionales no se pudieron cargar; el mapa de calor usará sólo el punto consultado.', 'warn');
    }
  }

  // --- Acciones de interfaz ---
  function selectDay(index) {
    st.selectedDayIndex = index;
    refreshDerived();
  }

  function setHour(hour) {
    st.selectedHour = RDCFT.utils.clamp(parseInt(hour, 10) || 0, 0, 23);
    RDCFT.ui.updateHourLabel();
    RDCFT.map.renderCityBadges(selectPoint);
    RDCFT.canvas.refreshParticles();
    RDCFT.ui.renderLegend();
    RDCFT.markHeatmapDirty();
  }

  function setLayer(layer) {
    st.activeLayer = layer;
    RDCFT.ui.updateLayerButtons();
    RDCFT.ui.renderLegend();
    RDCFT.map.renderCityBadges(selectPoint);
    RDCFT.markHeatmapDirty();

    // Fundido suave al entrar y salir de la capa de viento, que no tiene campo escalar.
    if (st.heatmapCanvas) {
      st.heatmapCanvas.style.opacity = RDCFT.config.LAYERS[layer] ? '1' : '0';
    }
  }

  async function runSearch(query) {
    const term = (query || '').trim();
    if (!term) return;

    RDCFT.ui.setLoading(true);
    try {
      const place = await RDCFT.weather.searchPlace(term);
      if (!place) {
        RDCFT.ui.toast(`Sin resultados en Chile para "${term}".`, 'warn');
        return;
      }
      st.map.setView([place.lat, place.lng], 12);
      await selectPoint(place.lat, place.lng, place.name);
    } catch (err) {
      console.error('Error al buscar lugar:', err);
      RDCFT.ui.toast('El servicio de búsqueda no respondió. Intente nuevamente.', 'error');
    } finally {
      RDCFT.ui.setLoading(false);
    }
  }

  // --- Enlace de eventos ---
  function populatePaisajeSelect() {
    const select = document.getElementById('ui-select-paisaje');
    if (!select) return;

    select.innerHTML = RDCFT.config.PAISAJES
      .map(p => `<option value="${RDCFT.utils.escapeHtml(p.name)}">${RDCFT.utils.escapeHtml(p.name)}</option>`)
      .join('') + `<option value="${CUSTOM_OPTION}">Punto personalizado</option>`;

    select.addEventListener('change', e => {
      const paisaje = RDCFT.config.PAISAJES.find(p => p.name === e.target.value);
      if (!paisaje) return;
      st.map.setView([paisaje.lat, paisaje.lng], paisaje.zoom);
      selectPoint(paisaje.lat, paisaje.lng, paisaje.name);
    });
  }

  function bindEvents() {
    document.getElementById('ui-theme-toggle')?.addEventListener('click', RDCFT.theme.toggle);
    document.getElementById('ui-zoom-in')?.addEventListener('click', () => st.map?.zoomIn());
    document.getElementById('ui-zoom-out')?.addEventListener('click', () => st.map?.zoomOut());
    document.getElementById('ui-btn-pdf')?.addEventListener('click', RDCFT.pdf.exportReport);

    document.querySelectorAll('.map-type-btn').forEach(btn => {
      btn.addEventListener('click', () => RDCFT.map.setTileType(btn.dataset.maptype));
    });

    document.querySelectorAll('.layer-btn').forEach(btn => {
      btn.addEventListener('click', () => setLayer(btn.dataset.layer));
    });

    // Los chips de día se regeneran en cada render, así que el listener va delegado.
    document.getElementById('ui-date-selector')?.addEventListener('click', e => {
      const chip = e.target.closest('[data-day]');
      if (chip) selectDay(parseInt(chip.dataset.day, 10));
    });

    const slider = document.getElementById('ui-hour-slider');
    slider?.addEventListener('input', e => setHour(e.target.value));

    document.querySelectorAll('[data-role="search"]').forEach(input => {
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          runSearch(input.value);
        }
      });
    });
  }

  function init() {
    RDCFT.theme.init();
    RDCFT.map.init(selectPoint);
    RDCFT.canvas.init();
    populatePaisajeSelect();
    bindEvents();
    RDCFT.ui.updateCoords();
    RDCFT.ui.updateComuna();
    RDCFT.ui.updateLocationHeader();
    RDCFT.ui.updateHourLabel();
    RDCFT.ui.updateLayerButtons();

    selectPoint(st.coords.lat, st.coords.lng, RDCFT.config.DEFAULT_LOCATION);
    loadRegionalSamples();
  }

  document.addEventListener('DOMContentLoaded', init);

  RDCFT.actions = { selectPoint, selectDay, setHour, setLayer, runSearch };
})(window.RDCFT = window.RDCFT || {});
