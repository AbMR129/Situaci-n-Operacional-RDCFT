/**
 * RDCFT · Mapa Leaflet
 * Capas base, marcador del punto consultado y badges regionales.
 */
(function (RDCFT) {
  'use strict';

  function init(onPointSelected) {
    const st = RDCFT.state;

    st.map = L.map('map-container', {
      zoomControl: false,
      attributionControl: true
    }).setView([st.coords.lat, st.coords.lng], 10);

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

    st.map.on('click', e => onPointSelected(e.latlng.lat, e.latlng.lng, null));

    // El mapa de calor está anclado al terreno: cualquier desplazamiento o zoom
    // obliga a reproyectarlo. Antes aquí se redimensionaba el canvas en cada
    // evento `move`, lo que lo borraba y hacía desaparecer las estelas de viento
    // durante el arrastre.
    st.map.on('move zoom', RDCFT.markHeatmapDirty);
    st.map.on('resize', () => RDCFT.canvas.resize());
  }

  function setTileType(type) {
    const st = RDCFT.state;
    if (!st.map || !st.tileLayers[type]) return;

    Object.values(st.tileLayers).forEach(layer => {
      if (st.map.hasLayer(layer)) st.map.removeLayer(layer);
    });

    st.tileLayers[type].addTo(st.map);
    st.mapTileType = type;

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

  /**
   * Badges de ciudad al estilo Windy. Cada uno muestra el valor real de su propio
   * pronóstico para el día y la hora seleccionados.
   */
  function renderCityBadges(onPointSelected) {
    const st = RDCFT.state;
    if (!st.cityMarkersGroup) return;
    st.cityMarkersGroup.clearLayers();

    // La capa de viento no tiene escala de campo; en ese caso los badges siguen
    // mostrando temperatura, que es la referencia más útil.
    const layer = RDCFT.config.LAYERS[st.activeLayer] ? st.activeLayer : 'temp';
    const cfg = RDCFT.config.LAYERS[layer];

    st.regionalSamples.forEach(spot => {
      const value = RDCFT.field.sampleValue(spot, layer);
      const text = value === null
        ? '—'
        : `${layer === 'rain' ? value.toFixed(1) : Math.round(value)}${cfg.unit === '°C' ? '°' : ' ' + cfg.unit}`;

      const icon = L.divIcon({
        className: 'windy-city-badge',
        html: `
          <div class="city-badge">
            <span class="city-badge-name">${RDCFT.utils.escapeHtml(spot.name)}</span>
            <span class="city-badge-value">${RDCFT.utils.escapeHtml(text)}</span>
          </div>
        `,
        iconSize: [90, 20],
        iconAnchor: [45, 10]
      });

      const marker = L.marker([spot.lat, spot.lng], {
        icon: icon,
        alt: `${spot.name}: ${text}`
      });
      marker.on('click', () => onPointSelected(spot.lat, spot.lng, spot.name));
      st.cityMarkersGroup.addLayer(marker);
    });
  }

  function moveMarker(lat, lng) {
    if (RDCFT.state.marker) RDCFT.state.marker.setLatLng([lat, lng]);
  }

  RDCFT.map = { init, setTileType, applyHeatmapBlend, renderCityBadges, moveMarker };
})(window.RDCFT = window.RDCFT || {});
