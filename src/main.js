/**
 * RDCFT · Arranque y orquestación
 * Une los módulos, enlaza los eventos de la interfaz y coordina la carga de datos.
 */
(function (RDCFT) {
  'use strict';

  const st = RDCFT.state;
  const CUSTOM_OPTION = '__custom__';
  const comparisonDrafts = { A: null, B: null };
  let comparisonMapPickTarget = null;
  let searchSuggestionItems = [];
  let searchSuggestionRequest = 0;
  let searchSuggestionTimer = null;
  const LAST_POINT_STORAGE_KEY = 'rdcft-last-point-v1';

  function persistLastPoint() {
    try {
      localStorage.setItem(LAST_POINT_STORAGE_KEY, JSON.stringify({
        lat: st.coords.lat,
        lng: st.coords.lng,
        locationName: st.locationName,
        comunaName: st.comunaName
      }));
    } catch (_) {
      // El modo privado o una política del navegador puede bloquear almacenamiento.
    }
  }

  function restoreLastPoint() {
    try {
      const saved = JSON.parse(localStorage.getItem(LAST_POINT_STORAGE_KEY) || 'null');
      if (!saved || !Number.isFinite(saved.lat) || !Number.isFinite(saved.lng)) return;
      st.coords = { lat: saved.lat, lng: saved.lng };
      st.locationName = saved.locationName || st.locationName;
      st.comunaName = saved.comunaName || st.comunaName;
    } catch (_) {
      // Si el dato almacenado no es válido, se usa el punto predeterminado.
    }
  }

  // --- Cambios que obligan a repintar todo lo que depende de los datos ---
  function refreshDerived(resetRegionalWind = false) {
    RDCFT.ui.renderAll();
    RDCFT.map.renderCityBadges(selectPoint);
    if (resetRegionalWind) RDCFT.canvas.refreshParticles();
    RDCFT.markHeatmapDirty();
  }

  function openComparisonModal() {
    const modal = document.getElementById('ui-comparison-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.getElementById('ui-select-comparison-a')?.focus();
  }

  function closeComparisonModal(restoreFocus) {
    const modal = document.getElementById('ui-comparison-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    if (restoreFocus) document.getElementById('ui-comparison-open')?.focus();
  }

  function clearComparison() {
    const comparison = st.comparison;
    comparison.requestSeq++;
    comparison.controller?.abort();
    comparison.pointA = null;
    comparison.pointB = null;
    comparison.isLoading = false;
    RDCFT.ui.renderComparison();
  }

  function comparisonSelection(letter) {
    if (comparisonDrafts[letter]) return comparisonDrafts[letter];
    const value = document.getElementById(`ui-select-comparison-${letter.toLowerCase()}`)?.value;
    return RDCFT.config.PAISAJES.find(p => p.name === value) || null;
  }

  function updateComparisonButton() {
    const pointA = comparisonSelection('A');
    const pointB = comparisonSelection('B');
    const button = document.getElementById('ui-run-comparison');
    if (button) button.disabled = !pointA || !pointB || (pointA.lat === pointB.lat && pointA.lng === pointB.lng);
  }

  function removeMapOption(letter) {
    document.querySelector(`#ui-select-comparison-${letter.toLowerCase()} option[data-map-selection]`)?.remove();
  }

  function saveMapComparisonPoint(letter, lat, lng) {
    const key = letter.toLowerCase();
    const point = {
      lat,
      lng,
      name: `Punto del mapa (${lat.toFixed(4)}, ${lng.toFixed(4)})`
    };
    comparisonDrafts[letter] = point;
    removeMapOption(letter);

    const select = document.getElementById(`ui-select-comparison-${key}`);
    if (select) {
      const option = document.createElement('option');
      option.value = `__map_point_${letter}`;
      option.dataset.mapSelection = 'true';
      option.dataset.lat = String(lat);
      option.dataset.lng = String(lng);
      option.textContent = point.name;
      select.appendChild(option);
      select.value = option.value;
    }
    const status = document.getElementById(`ui-search-comparison-${key}-status`);
    if (status) status.textContent = `Seleccionado en el mapa: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    clearComparison();
    updateComparisonButton();
    openComparisonModal();

    // El nombre de la comuna mejora la etiqueta cuando el servicio responde,
    // pero las coordenadas ya quedan disponibles sin esperar esta consulta.
    RDCFT.weather.reverseGeocode(lat, lng).then(name => {
      if (comparisonDrafts[letter] !== point || !name) return;
      point.name = name;
      const option = document.querySelector(`#ui-select-comparison-${key} option[data-map-selection]`);
      if (option) option.textContent = name;
      if (status) status.textContent = `Seleccionado en el mapa: ${name}`;
    }).catch(() => {});
  }

  function beginMapComparisonPick(letter) {
    closeComparisonModal(false);
    comparisonMapPickTarget = letter;
    const status = document.getElementById(`ui-search-comparison-${letter.toLowerCase()}-status`);
    if (status) status.textContent = 'Haz clic en el sector que deseas usar en el mapa.';
    const container = st.map?.getContainer?.();
    if (container) container.style.cursor = 'crosshair';
    RDCFT.ui.toast(`Selecciona en el mapa la ubicación ${letter}.`, 'info');
  }

  function onMapPointSelected(lat, lng, name) {
    if (comparisonMapPickTarget) {
      const target = comparisonMapPickTarget;
      comparisonMapPickTarget = null;
      const container = st.map?.getContainer?.();
      if (container) container.style.cursor = '';
      saveMapComparisonPoint(target, lat, lng);
      return;
    }
    selectPoint(lat, lng, name);
  }

  async function searchComparisonLocation(letter) {
    const key = letter.toLowerCase();
    const input = document.getElementById(`ui-search-comparison-${key}`);
    const status = document.getElementById(`ui-search-comparison-${key}-status`);
    const button = document.getElementById(`ui-search-comparison-${key}-button`);
    const term = input?.value.trim();
    if (!term) return;

    if (button) button.disabled = true;
    if (status) status.textContent = 'Buscando en el mapa…';
    try {
      const place = await RDCFT.weather.searchPlace(term);
      if (!place) {
        if (status) status.textContent = 'No se encontraron resultados en Chile.';
        return;
      }
      comparisonDrafts[letter] = place;
      const select = document.getElementById(`ui-select-comparison-${key}`);
      if (select) select.value = '';
      if (status) status.textContent = `Seleccionado: ${place.name}`;
      st.map?.setView([place.lat, place.lng], 12);
      clearComparison();
      updateComparisonButton();
    } catch (err) {
      console.error('Error al buscar ubicación para comparar:', err);
      if (status) status.textContent = 'La búsqueda no está disponible. Intenta nuevamente.';
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function loadComparison(paisajeA, paisajeB) {
    if (!paisajeA || !paisajeB || (paisajeA.lat === paisajeB.lat && paisajeA.lng === paisajeB.lng)) {
      RDCFT.ui.toast('Selecciona dos ubicaciones diferentes para comparar.', 'warn');
      return;
    }

    const comparison = st.comparison;
    const seq = ++comparison.requestSeq;
    comparison.controller?.abort();
    comparison.controller = new AbortController();
    comparison.pointA = { name: paisajeA.name, coords: { lat: paisajeA.lat, lng: paisajeA.lng }, weatherData: null };
    comparison.pointB = { name: paisajeB.name, coords: { lat: paisajeB.lat, lng: paisajeB.lng }, weatherData: null };
    comparison.isLoading = true;
    RDCFT.ui.renderComparison();

    try {
      const [dataA, dataB] = await Promise.all([
        RDCFT.weather.fetchForecast(paisajeA.lat, paisajeA.lng, comparison.controller.signal),
        RDCFT.weather.fetchForecast(paisajeB.lat, paisajeB.lng, comparison.controller.signal)
      ]);
      if (seq !== comparison.requestSeq) return;
      comparison.pointA.weatherData = dataA;
      comparison.pointB.weatherData = dataB;
      RDCFT.ui.renderComparison();
    } catch (err) {
      if (err.name === 'AbortError' || seq !== comparison.requestSeq) return;
      console.error('Error al obtener el pronóstico comparativo:', err);
      RDCFT.ui.toast('No se pudo cargar el pronóstico de comparación.', 'error');
    } finally {
      if (seq === comparison.requestSeq) {
        comparison.isLoading = false;
        RDCFT.ui.renderComparison();
      }
    }
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
      persistLastPoint();
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
      persistLastPoint();
    } catch (err) {
      console.warn('Geocodificación inversa no disponible:', err);
    }
  }

  /** Pronóstico real de los puntos regionales: una sola petición multipunto. */
  async function loadRegionalSamples() {
    try {
      st.regionalSamples = await RDCFT.weather.fetchRegional(RDCFT.config.REGIONAL_SPOTS);
      RDCFT.map.renderCityBadges(selectPoint);
      RDCFT.canvas.refreshParticles();
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
    refreshDerived(true);
  }

  function setHour(hour) {
    st.selectedHour = RDCFT.utils.clamp(parseInt(hour, 10) || 0, 0, 23);
    RDCFT.ui.updateHourLabel();
    RDCFT.ui.renderOperationalSummary();
    RDCFT.ui.renderComparison();
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
    // Si veníamos de otra capa, el bucle de viento estaba detenido. Este único
    // repintado lo reactiva al elegir Viento y limpia el canvas al elegir otra.
    RDCFT.canvas.requestRender();

    // El mapa de calor queda reservado para lluvia; temperatura y humedad se
    // muestran mediante badges y leyenda para no ocultar la cartografía base.
    if (st.heatmapCanvas) {
      st.heatmapCanvas.style.opacity = layer === 'rain' ? '1' : '0';
    }
  }

  /** Abre o cierra la bandeja de detalle usada en tablet y móvil. */
  function setDetailsOpen(open) {
    const panel = document.getElementById('details-sidebar');
    if (!panel) return;

    panel.classList.toggle('is-open', open);
    document.querySelectorAll('[aria-controls="details-sidebar"]').forEach(control => {
      control.setAttribute('aria-expanded', String(open));
    });
  }

  function normalizeSearchText(value) {
    return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-CL').trim();
  }

  function localityMatches(term) {
    const seen = new Set();
    return [...RDCFT.config.PAISAJES, ...RDCFT.config.REGIONAL_SPOTS]
      .filter(place => {
        const key = normalizeSearchText(place.name);
        if (seen.has(key)) return false;
        seen.add(key);
        return key.includes(term);
      })
      .slice(0, 6);
  }

  function closeSearchSuggestions() {
    const results = document.getElementById('ui-search-results');
    if (!results) return;
    results.classList.add('hidden');
    results.innerHTML = '';
    searchSuggestionItems = [];
  }

  async function renderSearchSuggestions(query) {
    const term = normalizeSearchText(query);
    if (term.length < 2) {
      closeSearchSuggestions();
      return;
    }

    const request = ++searchSuggestionRequest;
    const localities = localityMatches(term);
    let regionalPlaces = [];
    let parcels = [];
    try {
      parcels = await RDCFT.map.searchParcels(query, 6);
    } catch (err) {
      console.warn('Sugerencias prediales no disponibles:', err);
    }
    if (!localities.length) {
      try {
        regionalPlaces = await RDCFT.weather.searchRegionalPlaces(query);
      } catch (err) {
        console.warn('Sugerencias de localidades no disponibles:', err);
      }
    }
    if (request !== searchSuggestionRequest) return;

    const results = document.getElementById('ui-search-results');
    if (!results) return;
    searchSuggestionItems = [
      ...localities.map(place => ({ type: 'locality', place })),
      ...regionalPlaces.map(place => ({ type: 'regional-place', place })),
      ...parcels.map(feature => ({ type: 'parcel', feature }))
    ];

    const section = (title, items, offset) => items.length ? `
      <p class="px-2 pt-1.5 pb-1 text-[10px] uppercase font-black tracking-wider text-stone-500 dark:text-stone-400">${title}</p>
      ${items.map((item, index) => {
        const choice = searchSuggestionItems[offset + index];
        const props = choice.feature?.properties || {};
        const isPlace = choice.type === 'locality' || choice.type === 'regional-place';
        const name = isPlace ? choice.place.name : (props.nombre || 'Predio sin nombre');
        const description = choice.type === 'locality'
          ? 'Ciudad o poblado del catálogo'
          : choice.type === 'regional-place'
            ? choice.place.detail
            : `Predio · ID ${props.id || 'sin código'}`;
        return `<button type="button" data-search-suggestion="${offset + index}" role="option" class="w-full rounded-industrial px-3 py-2 text-left hover:bg-orange-500/10 focus:bg-orange-500/10 transition-colors"><span class="block text-xs font-bold text-stone-900 dark:text-white">${RDCFT.utils.escapeHtml(name)}</span><span class="block text-[10px] text-stone-500 dark:text-stone-400">${RDCFT.utils.escapeHtml(description)}</span></button>`;
      }).join('')}` : '';

    const html = section('Ciudades y poblados', localities, 0)
      + section('Otras localidades de la zona', regionalPlaces, localities.length)
      + section('Predios', parcels, localities.length + regionalPlaces.length);
    results.innerHTML = html || '<p class="px-3 py-2 text-xs text-stone-500 dark:text-stone-400">Sin coincidencias locales. Presiona Enter para buscar otros lugares en Chile.</p>';
    results.classList.remove('hidden');
  }

  function queueSearchSuggestions(query) {
    clearTimeout(searchSuggestionTimer);
    searchSuggestionTimer = setTimeout(() => renderSearchSuggestions(query), 180);
  }

  async function selectSearchSuggestion(item) {
    if (!item) return;
    const input = document.getElementById('ui-search-global');
    closeSearchSuggestions();
    if (item.type === 'locality' || item.type === 'regional-place') {
      input.value = item.place.name;
      st.map.setView([item.place.lat, item.place.lng], 12);
      await selectPoint(item.place.lat, item.place.lng, item.place.name);
      return;
    }
    const properties = item.feature.properties || {};
    input.value = properties.id ? `${properties.nombre || 'Predio'} · ${properties.id}` : (properties.nombre || 'Predio');
    await RDCFT.map.selectParcelFeature(item.feature);
  }

  async function runSearch(query) {
    const term = (query || '').trim();
    if (!term) return;

    closeSearchSuggestions();
    RDCFT.ui.setLoading(true);
    try {
      // Una localidad conocida tiene prioridad al pulsar Enter; evita que un
      // nombre compartido, como "Los Ángeles", abra un predio homónimo.
      const exactLocality = localityMatches(normalizeSearchText(term))
        .find(place => normalizeSearchText(place.name) === normalizeSearchText(term));
      if (exactLocality) {
        st.map.setView([exactLocality.lat, exactLocality.lng], 12);
        await selectPoint(exactLocality.lat, exactLocality.lng, exactLocality.name);
        return;
      }

      // Los predios se buscan primero porque un ID o nombre predial no suele
      // existir en el geocodificador público. Si la capa local no está
      // disponible, la búsqueda normal de lugares sigue funcionando.
      let parcelResult = null;
      try {
        parcelResult = await RDCFT.map.findParcel(term);
      } catch (parcelError) {
        console.warn('Búsqueda predial no disponible:', parcelError);
      }
      if (parcelResult) {
        await RDCFT.map.selectParcelFeature(parcelResult.feature);
        const suffix = parcelResult.count > 1 ? ` Se encontraron ${parcelResult.count}; se muestra la mejor coincidencia.` : '';
        RDCFT.ui.toast(`Ficha del predio abierta.${suffix}`, 'info');
        return;
      }

      const place = await RDCFT.weather.searchPlace(term);
      if (!place) {
        RDCFT.ui.toast(`Sin resultados de lugar ni predio para "${term}".`, 'warn');
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

    const comparisonOptions = '<option value="">Elegir…</option>' + RDCFT.config.PAISAJES
      .map(p => `<option value="${RDCFT.utils.escapeHtml(p.name)}">${RDCFT.utils.escapeHtml(p.name)}</option>`)
      .join('');
    const comparisonA = document.getElementById('ui-select-comparison-a');
    const comparisonB = document.getElementById('ui-select-comparison-b');
    if (comparisonA) comparisonA.innerHTML = comparisonOptions;
    if (comparisonB) comparisonB.innerHTML = comparisonOptions;
    const onComparisonSelectionChange = letter => event => {
      const selected = event.currentTarget.selectedOptions[0];
      if (selected?.dataset.mapSelection) {
        comparisonDrafts[letter] = {
          lat: parseFloat(selected.dataset.lat),
          lng: parseFloat(selected.dataset.lng),
          name: selected.textContent
        };
      } else {
        comparisonDrafts[letter] = null;
        removeMapOption(letter);
      }
      const status = document.getElementById(`ui-search-comparison-${letter.toLowerCase()}-status`);
      if (status) status.textContent = selected?.dataset.mapSelection ? `Seleccionado en el mapa: ${selected.textContent}` : '';
      clearComparison();
      updateComparisonButton();
    };
    comparisonA?.addEventListener('change', onComparisonSelectionChange('A'));
    comparisonB?.addEventListener('change', onComparisonSelectionChange('B'));
    document.getElementById('ui-run-comparison')?.addEventListener('click', () => {
      const paisajeA = comparisonSelection('A');
      const paisajeB = comparisonSelection('B');
      loadComparison(paisajeA, paisajeB);
    });
    ['A', 'B'].forEach(letter => {
      const key = letter.toLowerCase();
      document.getElementById(`ui-search-comparison-${key}-button`)?.addEventListener('click', () => searchComparisonLocation(letter));
      document.getElementById(`ui-pick-comparison-${key}`)?.addEventListener('click', () => beginMapComparisonPick(letter));
      document.getElementById(`ui-search-comparison-${key}`)?.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          searchComparisonLocation(letter);
        }
      });
    });
    updateComparisonButton();
  }

  function bindEvents() {
    // Los manejadores se resuelven de forma diferida (`() => RDCFT.x.y()`) en vez de
    // pasar la referencia directa: así, si un módulo no llegara a cargarse, sólo falla
    // su propio botón al pulsarlo en vez de abortar todo el enlace de eventos y dejar
    // la mitad de la interfaz sin responder.
    document.getElementById('ui-theme-toggle')?.addEventListener('click', () => RDCFT.theme.toggle());
    document.getElementById('ui-zoom-in')?.addEventListener('click', () => st.map?.zoomIn());
    document.getElementById('ui-zoom-out')?.addEventListener('click', () => st.map?.zoomOut());
    document.getElementById('ui-btn-pdf')?.addEventListener('click', () => RDCFT.pdf.exportReport());
    document.getElementById('ui-parcels-toggle')?.addEventListener('click', () => RDCFT.map.toggleParcels());
    document.getElementById('ui-clear-parcel-selection')?.addEventListener('click', () => RDCFT.map.clearParcelSelection());
    document.getElementById('ui-comparison-open')?.addEventListener('click', openComparisonModal);
    document.getElementById('ui-comparison-close')?.addEventListener('click', () => closeComparisonModal(true));
    document.getElementById('ui-comparison-modal')?.addEventListener('click', e => {
      if (e.target === e.currentTarget) closeComparisonModal(true);
    });
    document.getElementById('ui-details-toggle')?.addEventListener('click', () => {
      setDetailsOpen(!document.getElementById('details-sidebar')?.classList.contains('is-open'));
    });
    document.getElementById('ui-details-handle')?.addEventListener('click', () => {
      setDetailsOpen(!document.getElementById('details-sidebar')?.classList.contains('is-open'));
    });
    document.getElementById('ui-nav-map')?.addEventListener('click', () => setDetailsOpen(false));
    document.getElementById('ui-nav-meteorology')?.addEventListener('click', () => {
      setLayer('temp');
      RDCFT.ui.toast('Capa de temperatura activada.', 'info');
    });
    document.getElementById('ui-nav-summary')?.addEventListener('click', () => setDetailsOpen(true));
    const themeShortcut = document.querySelector('[data-purpose="sidebar-navigation"] .mt-auto button');
    if (themeShortcut) {
      themeShortcut.title = 'Cambiar tema';
      themeShortcut.setAttribute('aria-label', 'Cambiar tema');
      themeShortcut.addEventListener('click', () => RDCFT.theme.toggle());
    }

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !document.getElementById('ui-comparison-modal')?.classList.contains('hidden')) {
        closeComparisonModal(true);
      } else if (e.key === 'Escape' && document.getElementById('details-sidebar')?.classList.contains('is-open')) {
        setDetailsOpen(false);
        document.getElementById('ui-details-toggle')?.focus();
      }
    });

    // Barras de capa y de mapa base, y chips de día: delegación única en `document`
    // en vez de un listener por botón. Un listener por elemento depende de que el
    // botón exista y sea el mismo nodo en el momento del enlace; delegando, el clic
    // se resuelve al producirse, así que sigue funcionando aunque la barra se
    // reconstruya, se enlace antes de tiempo o se pulse un hijo (icono o etiqueta).
    document.addEventListener('click', e => {
      const target = e.target;
      if (!target || typeof target.closest !== 'function') return;

      const mapBtn = target.closest('.map-type-btn');
      if (mapBtn) {
        RDCFT.map.setTileType(mapBtn.dataset.maptype, true);
        return;
      }

      const searchSuggestion = target.closest('[data-search-suggestion]');
      if (searchSuggestion) {
        const index = parseInt(searchSuggestion.dataset.searchSuggestion, 10);
        selectSearchSuggestion(searchSuggestionItems[index]);
        return;
      }

      const layerBtn = target.closest('.layer-btn');
      if (layerBtn) {
        setLayer(layerBtn.dataset.layer);
        return;
      }

      const useComparison = target.closest('[data-use-comparison]');
      const pointKey = useComparison?.dataset.useComparison === 'A' ? 'pointA' : 'pointB';
      const comparisonPoint = useComparison ? st.comparison[pointKey] : null;
      if (comparisonPoint) {
        st.map?.setView([comparisonPoint.coords.lat, comparisonPoint.coords.lng], 12);
        selectPoint(comparisonPoint.coords.lat, comparisonPoint.coords.lng, comparisonPoint.name);
        RDCFT.ui.toast(`La ubicación ${useComparison.dataset.useComparison} ahora es el punto principal.`, 'info');
        return;
      }

      const dayChip = target.closest('#ui-date-selector [data-day]');
      if (dayChip) selectDay(parseInt(dayChip.dataset.day, 10));

      const summaryHour = target.closest('#ui-operational-summary [data-summary-hour]');
      if (summaryHour) setHour(summaryHour.dataset.summaryHour);
    });

    const slider = document.getElementById('ui-hour-slider');
    slider?.addEventListener('input', e => setHour(e.target.value));

    document.querySelectorAll('[data-role="search"]').forEach(input => {
      if (input.id === 'ui-search-global') {
        input.addEventListener('input', () => queueSearchSuggestions(input.value));
        input.addEventListener('focus', () => {
          if (input.value.trim().length >= 2) queueSearchSuggestions(input.value);
        });
        input.addEventListener('blur', () => setTimeout(closeSearchSuggestions, 150));
      }
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          runSearch(input.value);
        } else if (e.key === 'Escape' && input.id === 'ui-search-global') {
          closeSearchSuggestions();
          input.blur();
        }
      });
    });
  }

  /**
   * Ejecuta una fase del arranque sin que su fallo tumbe a las siguientes.
   * La aplicación se abre a menudo con doble clic sobre index.html, sin consola a la
   * vista: un error silencioso en una fase dejaría media interfaz sin responder y sin
   * ninguna pista de por qué.
   */
  function phase(name, fn) {
    try {
      fn();
      return true;
    } catch (err) {
      console.error(`Fallo al inicializar "${name}":`, err);
      RDCFT.ui?.toast?.(`Fallo al inicializar ${name}. Revise la consola del navegador.`, 'error');
      return false;
    }
  }

  function init() {
    restoreLastPoint();
    phase('el tema', () => RDCFT.theme.init());
    phase('el mapa', () => RDCFT.map.init(onMapPointSelected));
    phase('las capas de canvas', () => RDCFT.canvas.init());
    phase('el selector de paisajes', populatePaisajeSelect);
    phase('los controles', bindEvents);
    RDCFT.ui.updateCoords();
    RDCFT.ui.updateComuna();
    RDCFT.ui.updateLocationHeader();
    RDCFT.ui.updateHourLabel();
    RDCFT.ui.updateLayerButtons();

    selectPoint(st.coords.lat, st.coords.lng, RDCFT.config.DEFAULT_LOCATION);
    loadRegionalSamples();
  }

  document.addEventListener('DOMContentLoaded', init);

  RDCFT.actions = { selectPoint, selectDay, setHour, setLayer, runSearch, setDetailsOpen, loadComparison, openComparisonModal };
})(window.RDCFT = window.RDCFT || {});
