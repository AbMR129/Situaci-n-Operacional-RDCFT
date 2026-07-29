/**
 * RDCFT · Mapa Leaflet
 * Capas base, marcador del punto consultado y badges regionales.
 */
(function (RDCFT) {
  'use strict';

  function init(onPointSelected) {
    const st = RDCFT.state;
    st.onPointSelected = onPointSelected;

    st.map = L.map('map-container', {
      zoomControl: false,
      attributionControl: true
    }).setView([st.coords.lat, st.coords.lng], 9);

    const esriSat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Esri World Imagery'
    });
    const esriLabels = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      opacity: 0.85
    });
    st.tileLayers.satellite = L.layerGroup([esriSat, esriLabels]);

    st.tileLayers.dark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd',
      attribution: '© OpenStreetMap, © CARTO'
    });

    st.tileLayers.light = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd',
      attribution: '© OpenStreetMap, © CARTO'
    });

    setTileType(st.mapTileType);

    const customIcon = L.divIcon({
      className: 'custom-map-pin',
      html: `
        <div class="relative flex items-center justify-center">
          <span class="animate-ping absolute inline-flex h-9 w-9 rounded-full bg-industrial-naranja opacity-80"></span>
          <div class="w-7 h-7 rounded-full bg-industrial-naranja border-2 border-white flex items-center justify-center shadow-2xl">
            <div class="w-2.5 h-2.5 rounded-full bg-stone-950"></div>
          </div>
        </div>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 18]
    });

    st.marker = L.marker([st.coords.lat, st.coords.lng], {
      icon: customIcon,
      keyboard: false,
      alt: 'Punto consultado'
    }).addTo(st.map);

    st.cityMarkersGroup = L.layerGroup().addTo(st.map);
    st.localityMarkersGroup = L.layerGroup().addTo(st.map);
    loadOfficialLocalities().then(() => renderCityBadges(onPointSelected));

    st.map.on('click', e => {
      clearParcelSelection();
      onPointSelected(e.latlng.lat, e.latlng.lng, null);
    });

    // El mapa de calor está anclado al terreno: cualquier desplazamiento o zoom
    // obliga a reproyectarlo. Antes aquí se redimensionaba el canvas en cada
    // evento `move`, lo que lo borraba y hacía desaparecer las estelas de viento
    // durante el arrastre.
    st.map.on('move zoom', RDCFT.markHeatmapDirty);
    // Los pueblos aparecen al acercarse y se ocultan al alejarse; el pronóstico
    // ya está en memoria, por lo que este ajuste no dispara nuevas peticiones.
    st.map.on('moveend', () => renderCityBadges(onPointSelected));
    st.map.on('zoomend', () => {
      applyAdaptiveBaseMap();
      renderCityBadges(onPointSelected);
    });
    st.map.on('resize', () => RDCFT.canvas.resize());
  }

  function setTileType(type, isManual = false) {
    const st = RDCFT.state;
    if (!st.map || !st.tileLayers[type]) return;

    Object.values(st.tileLayers).forEach(layer => {
      if (st.map.hasLayer(layer)) st.map.removeLayer(layer);
    });

    st.tileLayers[type].addTo(st.map);
    st.mapTileType = type;
    if (isManual) st.mapTypeManual = true;

    applyHeatmapBlend();
    RDCFT.markHeatmapDirty();

    document.querySelectorAll('.map-type-btn').forEach(btn => {
      const active = btn.dataset.maptype === type;
      btn.classList.toggle('chip-active', active);
      btn.classList.toggle('chip-inactive', !active);
      btn.setAttribute('aria-pressed', String(active));
    });
  }

  /**
   * Vista regional en oscuro y detalle territorial en satélite. Los dos
   * umbrales evitan alternancias al moverse entre los zooms 8 y 10. No modifica
   * el centro ni el nivel de zoom, sólo la imagen base.
   */
  function applyAdaptiveBaseMap() {
    const st = RDCFT.state;
    if (!st.map || st.mapTypeManual) return;

    const zoom = st.map.getZoom();
    if (zoom >= 10 && st.mapTileType !== 'satellite') {
      setTileType('satellite');
    } else if (zoom <= 8 && st.mapTileType !== 'dark') {
      setTileType('dark');
    }
  }

  function normalizeParcelText(value) {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('es-CL')
      .trim();
  }

  /** Área geodésica aproximada; suficiente para la ficha informativa del predio. */
  function ringArea(ring) {
    if (!Array.isArray(ring) || ring.length < 3) return 0;
    const radians = Math.PI / 180;
    const radius = 6378137;
    let total = 0;
    for (let index = 0; index < ring.length; index++) {
      const current = ring[index];
      const next = ring[(index + 1) % ring.length];
      total += (next[0] - current[0]) * radians * (2 + Math.sin(current[1] * radians) + Math.sin(next[1] * radians));
    }
    return Math.abs(total * radius * radius / 2);
  }

  function featureAreaHectares(feature) {
    const geometry = feature?.geometry;
    if (!geometry) return null;
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates]
      : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
    const squareMeters = polygons.reduce((sum, polygon) => {
      const exterior = ringArea(polygon[0]);
      const holes = polygon.slice(1).reduce((holeSum, ring) => holeSum + ringArea(ring), 0);
      return sum + Math.max(0, exterior - holes);
    }, 0);
    return squareMeters ? squareMeters / 10000 : null;
  }

  function parcelPopupHtml(feature, center) {
    const properties = feature.properties || {};
    const sample = RDCFT.weather.currentSample();
    const evaluation = sample ? RDCFT.rdcft.evaluate(sample) : null;
    const area = featureAreaHectares(feature);
    const dateStr = RDCFT.state.weatherData?.daily?.time?.[RDCFT.state.selectedDayIndex];
    const hour = String(RDCFT.state.selectedHour).padStart(2, '0');
    const metric = (label, value) => `<span style="color:#78716c;">${label}</span><strong style="color:#1c1917;">${value}</strong>`;
    const rounded = (value, unit) => value === null || value === undefined ? '—' : `${Math.round(value)}${unit}`;
    const weather = sample
      ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px 12px;margin-top:10px;font-size:12px;">
          ${metric('Temperatura', rounded(sample.temp, ' °C'))}
          ${metric('Humedad', rounded(sample.humidity, ' %'))}
          ${metric('Viento', rounded(sample.wind, ' km/h'))}
          ${metric('Estado', evaluation?.status || 'Sin evaluar')}
        </div>`
      : '<p style="margin:8px 0 0;color:#78716c;font-size:12px;">Consultando condiciones meteorológicas…</p>';

    return `<div style="font-family:'Hanken Grotesk',sans-serif;min-width:230px;line-height:1.35;">
      <p style="margin:0;color:#f97316;font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;">Ficha predial</p>
      <strong style="display:block;margin-top:3px;color:#1c1917;font-size:14px;">${RDCFT.utils.escapeHtml(properties.nombre || 'Predio sin nombre')}</strong>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px 12px;margin-top:9px;font-size:12px;">
        ${metric('ID predio', RDCFT.utils.escapeHtml(properties.id || '—'))}
        ${metric('Superficie', area === null ? '—' : `${area.toFixed(area >= 100 ? 0 : 1)} ha`)}
        ${metric('Latitud', center.lat.toFixed(5))}
        ${metric('Longitud', center.lng.toFixed(5))}
      </div>
      <p style="margin:9px 0 0;color:#78716c;font-size:11px;">Pronóstico: ${dateStr ? `${RDCFT.utils.formatLongDate(dateStr)} · ${hour}:00` : '—'}</p>
      ${weather}
    </div>`;
  }

  function selectParcelFeature(feature) {
    const st = RDCFT.state;
    if (!st.map || !feature) return;
    if (st.parcelSelectionLayer && st.map.hasLayer(st.parcelSelectionLayer)) st.map.removeLayer(st.parcelSelectionLayer);

    st.parcelSelectionLayer = L.geoJSON(feature, {
      style: { color: '#facc15', weight: 3, opacity: 1, fillColor: '#f97316', fillOpacity: 0.22 },
      onEachFeature(_, layer) {
        layer.on('click', event => L.DomEvent.stopPropagation(event.originalEvent));
      }
    }).addTo(st.map);
    const selectionLayer = st.parcelSelectionLayer;
    updateParcelSelectionControls(true);

    const bounds = st.parcelSelectionLayer.getBounds();
    if (!bounds.isValid()) return Promise.resolve();
    const center = bounds.getCenter();
    st.map.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 });
    st.parcelSelectionLayer.bindPopup(parcelPopupHtml(feature, center)).openPopup(center);

    const name = feature.properties?.nombre || `Predio ${feature.properties?.id || ''}`.trim();
    const forecastRequest = Promise.resolve(st.onPointSelected?.(center.lat, center.lng, name));
    forecastRequest.then(() => {
      if (st.parcelSelectionLayer === selectionLayer) selectionLayer.setPopupContent(parcelPopupHtml(feature, center)).openPopup(center);
    });
    return forecastRequest;
  }

  /** Quita el resaltado temporal y la ficha al volver a consultar el mapa libremente. */
  function clearParcelSelection() {
    const st = RDCFT.state;
    if (!st.parcelSelectionLayer) return;
    if (st.map?.hasLayer(st.parcelSelectionLayer)) st.map.removeLayer(st.parcelSelectionLayer);
    st.map?.closePopup();
    st.parcelSelectionLayer = null;
    updateParcelSelectionControls(false);
  }

  function updateParcelSelectionControls(active) {
    document.getElementById('ui-clear-parcel-selection')?.classList.toggle('hidden', !active);
  }

  async function loadParcelsData() {
    const st = RDCFT.state;
    if (st.parcelsData) return st.parcelsData;
    const response = await fetch('Data/predios.geojson');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    st.parcelsData = await response.json();
    return st.parcelsData;
  }

  async function findParcel(query) {
    const term = normalizeParcelText(query);
    if (!term) return null;
    const data = await loadParcelsData();
    const features = data.features || [];
    const matches = features.filter(feature => {
      const properties = feature.properties || {};
      return normalizeParcelText(properties.id).includes(term) || normalizeParcelText(properties.nombre).includes(term);
    });
    if (!matches.length) return null;

    const exact = matches.find(feature => {
      const properties = feature.properties || {};
      return normalizeParcelText(properties.id) === term || normalizeParcelText(properties.nombre) === term;
    });
    return { feature: exact || matches[0], count: matches.length };
  }

  /** Coincidencias breves para el menú del buscador, sin seleccionar un predio. */
  async function searchParcels(query, limit = 6) {
    const term = normalizeParcelText(query);
    if (term.length < 2) return [];
    const data = await loadParcelsData();
    const matches = (data.features || []).filter(feature => {
      const properties = feature.properties || {};
      return normalizeParcelText(properties.id).includes(term) || normalizeParcelText(properties.nombre).includes(term);
    });
    return matches.sort((a, b) => {
      const aProps = a.properties || {};
      const bProps = b.properties || {};
      const aExact = normalizeParcelText(aProps.id) === term || normalizeParcelText(aProps.nombre) === term;
      const bExact = normalizeParcelText(bProps.id) === term || normalizeParcelText(bProps.nombre) === term;
      return Number(bExact) - Number(aExact);
    }).slice(0, limit);
  }

  function updateParcelsButton(active, loading) {
    const button = document.getElementById('ui-parcels-toggle');
    if (!button) return;
    const legend = document.getElementById('ui-parcels-legend');
    button.disabled = Boolean(loading);
    button.classList.toggle('chip-active', Boolean(active));
    button.classList.toggle('chip-inactive', !active);
    button.setAttribute('aria-pressed', String(Boolean(active)));
    button.title = active ? 'Ocultar predios' : 'Mostrar predios';
    button.setAttribute('aria-label', button.title);
    if (legend) {
      legend.classList.toggle('hidden', !active);
      legend.classList.toggle('flex', Boolean(active));
    }
  }

  /** Carga los predios sólo cuando se solicitan, para no pesar el arranque. */
  async function toggleParcels() {
    const st = RDCFT.state;
    if (!st.map || st.parcelsLoading) return;

    if (st.parcelsLayer) {
      const visible = st.map.hasLayer(st.parcelsLayer);
      if (visible) {
        st.map.removeLayer(st.parcelsLayer);
        clearParcelSelection();
      }
      else st.parcelsLayer.addTo(st.map);
      updateParcelsButton(!visible, false);
      return;
    }

    st.parcelsLoading = true;
    updateParcelsButton(false, true);
    try {
      const data = await loadParcelsData();
      st.parcelsLayer = L.geoJSON(data, {
        style: {
          color: '#f97316',
          weight: 1,
          opacity: 0.8,
          fillColor: '#f97316',
          fillOpacity: 0.05
        },
        onEachFeature(feature, layer) {
          const properties = feature.properties || {};
          layer.bindPopup(`
            <div style="font-family: 'Hanken Grotesk', sans-serif; min-width: 160px;">
              <strong>${RDCFT.utils.escapeHtml(properties.nombre || 'Predio sin nombre')}</strong><br>
              <span style="font-size: 12px; color: #57534e;">ID predio: ${RDCFT.utils.escapeHtml(properties.id || '—')}</span>
            </div>
          `);
          layer.on('click', event => {
            L.DomEvent.stopPropagation(event.originalEvent);
            selectParcelFeature(feature);
          });
        }
      }).addTo(st.map);
      updateParcelsButton(true, false);
    } catch (err) {
      console.error('No se pudo cargar la capa de predios:', err);
      RDCFT.ui.toast('No se pudo cargar la capa de predios. Abra el proyecto desde un servidor local.', 'warn');
      updateParcelsButton(false, false);
    } finally {
      st.parcelsLoading = false;
    }
  }

  /**
   * Modo de fusión del mapa de calor según el brillo de la base.
   *
   * El satélite NO puede usar `screen`: esa mezcla sólo aclara, y sobre un terreno
   * ya brillante el color se satura hacia el blanco. El resultado era un velo
   * pálido casi idéntico entre capas, que se percibe como que cambiar de
   * temperatura a humedad "no hace nada". Sobre satélite se pinta en modo normal,
   * que conserva el color real de la escala.
   */
  const BLEND_BY_BASE = {
    satellite: 'blend-normal',   // base brillante y con textura
    dark: 'blend-screen',        // base casi negra: aclarar funciona bien
    light: 'blend-multiply'      // base clara y plana: oscurecer conserva contraste
  };

  function applyHeatmapBlend() {
    const canvas = RDCFT.state.heatmapCanvas;
    if (!canvas) return;
    const wanted = BLEND_BY_BASE[RDCFT.state.mapTileType] || 'blend-normal';
    Object.values(BLEND_BY_BASE).forEach(cls => canvas.classList.toggle(cls, cls === wanted));
  }

  const INE_LOCALITIES_URL = 'https://services5.arcgis.com/hUyD8u3TeZLKPe4T/ArcGIS/rest/services/Censo2024_v2/FeatureServer/0/query';
  const INE_REGIONS_WHERE = '(CUT >= 7000 AND CUT < 8000) OR (CUT >= 8000 AND CUT < 11000) OR (CUT >= 14000 AND CUT < 15000) OR (CUT >= 16000 AND CUT < 17000)';
  const INE_PAGE_SIZE = 2000;

  function normalizedLocalityName(value) {
    return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-CL').trim();
  }

  /** Carga todos los topónimos oficiales INE de Maule a Los Lagos por páginas. */
  async function loadOfficialLocalities() {
    const st = RDCFT.state;
    if (st.officialLocalities.length || st.officialLocalitiesLoading) return st.officialLocalities;
    st.officialLocalitiesLoading = true;
    try {
      const all = [];
      for (let offset = 0; ; offset += INE_PAGE_SIZE) {
        const params = new URLSearchParams({
          where: INE_REGIONS_WHERE,
          outFields: 'CUT,LOCALIDAD',
          returnGeometry: 'true',
          f: 'geojson',
          resultOffset: String(offset),
          resultRecordCount: String(INE_PAGE_SIZE),
          orderByFields: 'OBJECTID'
        });
        const response = await fetch(`${INE_LOCALITIES_URL}?${params}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const batch = data.features || [];
        all.push(...batch);
        if (batch.length < INE_PAGE_SIZE) break;
      }
      st.officialLocalities = all.map(feature => ({
        name: feature.properties?.LOCALIDAD,
        lng: feature.geometry?.coordinates?.[0],
        lat: feature.geometry?.coordinates?.[1]
      })).filter(place => place.name && Number.isFinite(place.lat) && Number.isFinite(place.lng));
    } catch (err) {
      console.warn('No se pudieron cargar las localidades oficiales INE:', err);
      RDCFT.ui.toast('No se pudo cargar el catálogo completo de localidades.', 'warn');
    } finally {
      st.officialLocalitiesLoading = false;
    }
    return st.officialLocalities;
  }

  function localityBadgeColor(layer, value) {
    if (value === null || value === undefined || Number.isNaN(value)) return '#38bdf8';
    if (layer === 'wind') return '#22d3ee';
    const rgb = RDCFT.field.colorForValue(layer, value);
    return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
  }

  function localityBadgeIcon(name, text, color) {
    return L.divIcon({
      className: 'windy-city-badge',
      html: `<div class="city-badge" style="--badge-dot:${color}"><i class="city-badge-dot" aria-hidden="true"></i><span class="city-badge-name">${RDCFT.utils.escapeHtml(name)}</span><span class="city-badge-value">${RDCFT.utils.escapeHtml(text)}</span></div>`,
      iconSize: [120, 20],
      iconAnchor: [0, 10]
    });
  }

  /**
   * Badges de ciudad al estilo Windy. Cada uno muestra el valor real de su propio
   * pronóstico para el día y la hora seleccionados.
   */
  function renderCityBadges(onPointSelected) {
    const st = RDCFT.state;
    if (!st.cityMarkersGroup || !st.localityMarkersGroup) return;
    st.cityMarkersGroup.clearLayers();
    st.localityMarkersGroup.clearLayers();

    const layer = st.activeLayer;
    const isWindLayer = layer === 'wind';
    const cfg = RDCFT.config.LAYERS[layer];
    const dateStr = st.weatherData?.daily?.time?.[st.selectedDayIndex];

    const zoom = st.map?.getZoom() ?? 0;
    const visibleArea = st.map?.getBounds()?.pad(0.12);
    st.regionalSamples.filter(spot =>
      zoom >= Math.max(8, spot.minZoom ?? 7) && (!visibleArea || visibleArea.contains([spot.lat, spot.lng]))
    ).forEach(spot => {
      let value;
      let text;

      if (isWindLayer) {
        const index = dateStr ? RDCFT.weather.indexFor(spot.hourly, dateStr, st.selectedHour) : -1;
        value = index >= 0 ? RDCFT.utils.num(spot.hourly?.wind_speed_10m?.[index], null) : null;
        const direction = index >= 0 ? RDCFT.utils.num(spot.hourly?.wind_direction_10m?.[index], null) : null;
        text = value === null
          ? '—'
          : `${direction === null ? '' : RDCFT.utils.windArrow(direction) + ' '}${Math.round(value)} km/h`;
      } else {
        value = RDCFT.field.sampleValue(spot, layer);
        text = value === null
          ? '—'
          : `${layer === 'rain' ? value.toFixed(1) : Math.round(value)}${cfg.unit === '°C' ? '°' : ' ' + cfg.unit}`;
      }

      const icon = localityBadgeIcon(spot.name, text, localityBadgeColor(layer, value));

      const marker = L.marker([spot.lat, spot.lng], {
        icon: icon,
        alt: `${spot.name}: ${text}`
      });
      marker.on('click', () => onPointSelected(spot.lat, spot.lng, spot.name));
      st.cityMarkersGroup.addLayer(marker);
    });

    renderOfficialLocalityBadges(onPointSelected, layer, cfg, dateStr, isWindLayer);
  }

  function interpolateLocalityValue(layer, lat, lng, dateStr) {
    const st = RDCFT.state;
    if (layer !== 'wind') return RDCFT.field.interpolate(RDCFT.field.knownPoints(layer), lat, lng);
    const points = st.regionalSamples.map(spot => {
      const index = dateStr ? RDCFT.weather.indexFor(spot.hourly, dateStr, st.selectedHour) : -1;
      const value = index >= 0 ? RDCFT.utils.num(spot.hourly?.wind_speed_10m?.[index], null) : null;
      return value === null ? null : { lat: spot.lat, lng: spot.lng, value };
    }).filter(Boolean);
    return RDCFT.field.interpolate(points, lat, lng);
  }

  /** Etiquetas de todas las localidades INE visibles al acercar el mapa. */
  function renderOfficialLocalityBadges(onPointSelected, layer, cfg, dateStr, isWindLayer) {
    const st = RDCFT.state;
    if (!st.localityMarkersGroup || !st.map || st.map.getZoom() < 11) return;
    const visibleArea = st.map.getBounds().pad(0.04);
    const regionalNames = new Set(st.regionalSamples.map(spot => normalizedLocalityName(spot.name)));

    st.officialLocalities.filter(place =>
      !regionalNames.has(normalizedLocalityName(place.name)) && visibleArea.contains([place.lat, place.lng])
    ).forEach(place => {
      const value = interpolateLocalityValue(layer, place.lat, place.lng, dateStr);
      const text = value === null
        ? '—'
        : `${layer === 'rain' ? value.toFixed(1) : Math.round(value)}${isWindLayer ? ' km/h' : cfg.unit === '°C' ? '°' : ' ' + cfg.unit}`;
      const icon = localityBadgeIcon(place.name, text, localityBadgeColor(layer, value));
      const marker = L.marker([place.lat, place.lng], { icon, alt: `${place.name}: ${text} (interpolado)` });
      marker.on('click', () => onPointSelected(place.lat, place.lng, place.name));
      st.localityMarkersGroup.addLayer(marker);
    });
  }

  function moveMarker(lat, lng) {
    if (RDCFT.state.marker) RDCFT.state.marker.setLatLng([lat, lng]);
  }

  RDCFT.map = { init, setTileType, toggleParcels, findParcel, searchParcels, selectParcelFeature, clearParcelSelection, applyHeatmapBlend, renderCityBadges, moveMarker };
})(window.RDCFT = window.RDCFT || {});
