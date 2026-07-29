/**
 * RDCFT · Canvas de mapa de calor y partículas de viento
 */
(function (RDCFT) {
  'use strict';

  let rafId = null;
  let lastFrameAt = null;
  let windPausedForZoom = false;

  // --- Campo de viento -------------------------------------------------------
  // Componentes en ejes de PANTALLA (x→este, y→sur) y en km/h. Se interpolan por
  // separado: promediar ángulos de dirección directamente da resultados absurdos
  // (el promedio de 350° y 10° serían 180°, justo el rumbo opuesto).
  let windField = [];        // {lat, lng, sx, sy} de toda la red regional
  let activeWindPoints = []; // subconjunto en vista, ya proyectado a píxeles
  let windFieldKey = '';     // día|hora con que se construyó windField
  let lastFieldUpdate = 0;

  // Calibración visual. La velocidad se expresa en píxeles por segundo y es
  // independiente de los FPS. El suelo garantiza que el flujo se lea incluso con
  // viento muy débil, que es lo habitual en invierno en la zona.
  const MIN_PX_S = 45;
  const PX_PER_KMH = 9;
  const MAX_PX_S = 200;
  const TRAIL_POINTS = 14;   // posiciones guardadas por partícula

  /** Programa como máximo un fotograma pendiente. */
  function scheduleFrame() {
    if (rafId === null) rafId = requestAnimationFrame(animate);
  }

  function init() {
    const container = document.getElementById('map-viewport');
    if (!container) return;
    const st = RDCFT.state;

    // Capa de calor: bajo las partículas, fundida con las teselas vía mix-blend-mode.
    st.heatmapCanvas = document.createElement('canvas');
    st.heatmapCanvas.id = 'heatmap-canvas';
    st.heatmapCanvas.setAttribute('aria-hidden', 'true');
    st.heatmapCanvas.className = 'absolute inset-0 pointer-events-none z-[15] transition-opacity duration-500 ease-out blend-screen';
    container.appendChild(st.heatmapCanvas);
    st.heatmapCtx = st.heatmapCanvas.getContext('2d');

    st.windCanvas = document.createElement('canvas');
    st.windCanvas.id = 'wind-canvas';
    st.windCanvas.setAttribute('aria-hidden', 'true');
    st.windCanvas.className = 'absolute inset-0 pointer-events-none z-20';
    container.appendChild(st.windCanvas);
    st.windCtx = st.windCanvas.getContext('2d');

    RDCFT.map.applyHeatmapBlend();
    resize();
    createParticles();

    window.addEventListener('resize', resize);
    scheduleFrame();
  }

  /**
   * Ajusta un canvas al tamaño CSS del contenedor escalando por devicePixelRatio,
   * para que no se vea borroso en pantallas HiDPI.
   *
   * Devuelve `false` si las dimensiones no cambiaron. Asignar `canvas.width` borra
   * el contenido aunque el valor sea el mismo, así que sólo se toca cuando hace
   * falta de verdad.
   */
  function fitCanvas(canvas, ctx, cssWidth, cssHeight) {
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(cssWidth * dpr));
    const height = Math.max(1, Math.round(cssHeight * dpr));
    if (canvas.width === width && canvas.height === height) return false;

    canvas.width = width;
    canvas.height = height;
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    // A partir de aquí se dibuja en píxeles CSS.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }

  function resize() {
    const st = RDCFT.state;
    const container = document.getElementById('map-viewport');
    if (!container || !st.windCanvas || !st.heatmapCanvas) return;

    const w = container.clientWidth;
    const h = container.clientHeight;
    fitCanvas(st.windCanvas, st.windCtx, w, h);
    if (fitCanvas(st.heatmapCanvas, st.heatmapCtx, w, h)) RDCFT.markHeatmapDirty();
  }

  function viewportSize() {
    const container = document.getElementById('map-viewport');
    return { w: container ? container.clientWidth : 800, h: container ? container.clientHeight : 600 };
  }

  /**
   * Reconstruye el campo a partir de la red regional, una vez por día/hora.
   * Convierte cada rumbo meteorológico (dirección DESDE la que sopla, en grados
   * horarios desde el norte) a componentes de avance en pantalla.
   */
  function buildWindField() {
    const st = RDCFT.state;
    const dateStr = st.weatherData?.daily?.time?.[st.selectedDayIndex];
    const key = `${dateStr}|${st.selectedHour}|${st.regionalSamples.length}`;
    if (key === windFieldKey) return;
    windFieldKey = key;
    windField = [];
    // Reconstruir el campo invalida la proyección en píxeles: si no se vaciara,
    // se seguirían usando las posiciones y vectores del día u hora anteriores.
    activeWindPoints = [];
    if (!dateStr) return;

    st.regionalSamples.forEach(spot => {
      const index = RDCFT.weather.indexFor(spot.hourly, dateStr, st.selectedHour);
      if (index < 0) return;
      const speed = RDCFT.utils.num(spot.hourly?.wind_speed_10m?.[index], null);
      const direction = RDCFT.utils.num(spot.hourly?.wind_direction_10m?.[index], null);
      if (speed === null || direction === null) return;

      const radians = direction * Math.PI / 180;
      windField.push({
        lat: spot.lat,
        lng: spot.lng,
        sx: -Math.sin(radians) * speed,
        sy: Math.cos(radians) * speed
      });
    });
  }

  /**
   * Proyecta a píxeles los puntos del campo que están en vista. Hacerlo una vez
   * por refresco (y no por partícula) mantiene la interpolación barata: luego
   * todo el muestreo ocurre ya en coordenadas de pantalla.
   */
  function updateActiveWindPoints() {
    const st = RDCFT.state;
    if (!st.map || !windField.length) {
      activeWindPoints = [];
      return;
    }

    const bounds = st.map.getBounds().pad(0.6);
    let selection = windField.filter(p => bounds.contains([p.lat, p.lng]));

    // Cerca del borde del dominio puede no haber puntos dentro de la vista;
    // en ese caso se usan los más cercanos al centro para no quedarse sin campo.
    if (selection.length < 3) {
      const center = st.map.getCenter();
      const distance = p => (p.lat - center.lat) ** 2 + (p.lng - center.lng) ** 2;
      selection = windField.slice().sort((a, b) => distance(a) - distance(b)).slice(0, 8);
    }

    activeWindPoints = selection.slice(0, 48).map(p => {
      const point = st.map.latLngToContainerPoint([p.lat, p.lng]);
      return { x: point.x, y: point.y, sx: p.sx, sy: p.sy };
    });
  }

  /**
   * Interpolación por distancia inversa en coordenadas de pantalla. El término
   * de suavizado evita la singularidad justo encima de un punto de la red.
   */
  function sampleWindAtScreen(x, y) {
    const points = activeWindPoints;
    if (!points.length) return null;

    let sumX = 0;
    let sumY = 0;
    let weights = 0;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const dx = x - p.x;
      const dy = y - p.y;
      const weight = 1 / (dx * dx + dy * dy + 900);
      sumX += weight * p.sx;
      sumY += weight * p.sy;
      weights += weight;
    }
    if (!weights) return null;
    return { sx: sumX / weights, sy: sumY / weights };
  }

  /** Viento del punto consultado, como respaldo mientras no hay red regional. */
  function fallbackWind() {
    const sample = RDCFT.weather.currentSample();
    if (!sample || sample.wind === null || sample.direction === null) return { sx: 0, sy: 6 };
    const radians = sample.direction * Math.PI / 180;
    return {
      sx: -Math.sin(radians) * sample.wind,
      sy: Math.cos(radians) * sample.wind
    };
  }

  /** Convierte componentes en km/h a velocidad de pantalla en píxeles por segundo. */
  function toScreenVelocity(wind) {
    const magnitude = Math.hypot(wind.sx, wind.sy);
    const pixels = RDCFT.utils.clamp(MIN_PX_S + magnitude * PX_PER_KMH, MIN_PX_S, MAX_PX_S);
    if (magnitude < 0.001) return { vx: 0, vy: pixels };
    const scale = pixels / magnitude;
    return { vx: wind.sx * scale, vy: wind.sy * scale };
  }

  function createParticles() {
    const st = RDCFT.state;
    st.windParticles = [];
    for (let i = 0; i < particleCountForZoom(); i++) {
      const particle = resetParticle({});
      // Edad inicial repartida: evita que todas reaparezcan a la vez y se vea un
      // parpadeo sincronizado del campo entero.
      particle.age = Math.random() * particle.maxAge;
      st.windParticles.push(particle);
    }
  }

  /**
   * La cantidad se mide por pantalla, no por superficie geográfica. Con estelas
   * largas conviene menos densidad al acercarse para que no se saturen.
   */
  function particleCountForZoom() {
    const zoom = RDCFT.state.map?.getZoom?.() ?? 9;
    if (zoom >= 14) return 110;
    if (zoom >= 12) return 130;
    return RDCFT.config.PARTICLE_COUNT;
  }

  function syncParticleDensity() {
    const st = RDCFT.state;
    const target = particleCountForZoom();
    const particles = st.windParticles || (st.windParticles = []);

    if (particles.length > target) particles.length = target;
    while (particles.length < target) particles.push(resetParticle({}));
  }

  function resetParticle(p) {
    const { w, h } = viewportSize();

    p.x = Math.random() * w;
    p.y = Math.random() * h;
    p.age = 0;
    p.maxAge = 2.5 + Math.random() * 2.5;
    // Coordenadas planas [x0,y0,x1,y1,…]: evita crear un objeto por posición.
    p.trail = [p.x, p.y];

    return p;
  }

  /**
   * Mapa de calor anclado al terreno: cada punto de muestreo se reproyecta a
   * coordenadas de pantalla, así que el color se mueve y escala con el mapa.
   */
  function renderHeatmap() {
    const st = RDCFT.state;
    if (!st.heatmapCtx || !st.map || !st.weatherData) return;

    const ctx = st.heatmapCtx;
    const { w, h } = viewportSize();

    // El borrado va ANTES de cualquier salida temprana: si no, al pasar de lluvia
    // a temperatura el dibujo anterior se quedaba congelado sobre el mapa.
    ctx.clearRect(0, 0, w, h);

    const layer = st.activeLayer;
    if (!RDCFT.config.LAYERS[layer]) return;

    // Temperatura y humedad se leen mejor sobre el mapa base y en los badges de
    // ciudad; se omiten los focos difusos que podían tapar el territorio.
    if (layer === 'temp' || layer === 'humidity') return;

    const points = RDCFT.field.knownPoints(layer);
    if (!points.length) return;

    const zoom = st.map.getZoom();
    const radius = RDCFT.utils.clamp(60 * Math.pow(1.35, zoom - 10), 160, 900);
    const bounds = st.map.getBounds().pad(0.5);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    points.forEach(point => {
      if (!bounds.contains([point.lat, point.lng])) return;

      const [r, g, b] = RDCFT.field.colorForValue(layer, point.value);
      const pt = st.map.latLngToContainerPoint([point.lat, point.lng]);

      const gradient = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, radius);
      gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.55)`);
      gradient.addColorStop(0.6, `rgba(${r}, ${g}, ${b}, 0.26)`);
      gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.restore();
  }

  /**
   * Bucle de animación.
   *
   * El cuerpo va dentro de `drawFrame` y la reprogramación en el `finally` de
   * aquí: si una excepción escapara, nunca se llamaría a `requestAnimationFrame`
   * y el bucle moriría para siempre, dejando el último fotograma congelado sobre
   * el mapa. Ese era el origen de las «líneas estáticas»: estelas de viento que
   * seguían en pantalla incluso con otra capa activa, porque ya nadie borraba el
   * lienzo. Un fallo puntual ahora se registra una vez y la animación continúa.
   */
  let loopErrorLogged = false;

  function animate(timestamp) {
    // El callback ya se consumió. Así `scheduleFrame` no puede crear un segundo
    // bucle paralelo mientras se está dibujando el fotograma actual.
    rafId = null;
    try {
      drawFrame(timestamp);
    } catch (err) {
      if (!loopErrorLogged) {
        loopErrorLogged = true;
        console.error('Fallo al dibujar el fotograma; la animación continúa:', err);
      }
    } finally {
      // La animación continua sólo hace falta con Viento activo. Las demás capas
      // piden un único repintado cuando cambian, evitando trabajo a 60 FPS vacío.
      if (RDCFT.state.activeLayer === 'wind' && !windPausedForZoom) scheduleFrame();
    }
  }

  function drawFrame(timestamp) {
    const st = RDCFT.state;
    if (!st.windCtx || !st.windCanvas) return;

    if (st.heatmapDirty) {
      // La marca se limpia ANTES de dibujar: si el repintado fallara, no se
      // reintentaría en bucle en cada fotograma.
      st.heatmapDirty = false;
      renderHeatmap();
    }

    const ctx = st.windCtx;
    const { w, h } = viewportSize();

    // El lienzo se rehace entero en cada fotograma. Antes se desvanecía con
    // `destination-out`, lo que dejaba residuos si la animación se interrumpía;
    // redibujar estelas completas elimina esa clase de artefacto por completo.
    ctx.clearRect(0, 0, w, h);

    // Durante el zoom Leaflet escala el mapa por CSS y las proyecciones no valen.
    if (windPausedForZoom || st.activeLayer !== 'wind') {
      lastFrameAt = null;
      return;
    }

    const dt = lastFrameAt === null ? 1 / 60 : RDCFT.utils.clamp((timestamp - lastFrameAt) / 1000, 0, 0.05);
    lastFrameAt = timestamp;

    buildWindField();
    if (timestamp - lastFieldUpdate > 400) {
      updateActiveWindPoints();
      lastFieldUpdate = timestamp;
    }

    const speedScale = RDCFT.config.WIND_ANIMATION_SPEED;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();

    st.windParticles.forEach(p => {
      // El viento se muestrea en la posición actual de la partícula, así que la
      // trayectoria sigue el campo real en vez de una única dirección global.
      const wind = sampleWindAtScreen(p.x, p.y) || fallbackWind();
      const { vx, vy } = toScreenVelocity(wind);

      p.x += vx * speedScale * dt;
      p.y += vy * speedScale * dt;
      p.age += dt;

      p.trail.push(p.x, p.y);
      if (p.trail.length > TRAIL_POINTS * 2) p.trail.splice(0, 2);

      if (p.x < -20 || p.x > w + 20 || p.y < -20 || p.y > h + 20 || p.age > p.maxAge) {
        resetParticle(p);
        return;
      }

      const trail = p.trail;
      ctx.moveTo(trail[0], trail[1]);
      for (let i = 2; i < trail.length; i += 2) ctx.lineTo(trail[i], trail[i + 1]);
    });

    // Dos pasadas sobre el mismo trazado: un halo ancho y tenue más un núcleo
    // fino y brillante. Da sensación de luz sin coste apreciable.
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.20)';
    ctx.lineWidth = 3.4;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(186, 230, 253, 0.92)';
    ctx.lineWidth = 1.1;
    ctx.stroke();

  }

  /** Reinicia el campo de partículas tras cambiar de día, hora o ubicación. */
  function refreshParticles() {
    syncParticleDensity();
    RDCFT.state.windParticles.forEach(p => {
      resetParticle(p);
      p.age = Math.random() * p.maxAge;
    });
    windFieldKey = '';
    lastFieldUpdate = 0;
    if (RDCFT.state.activeLayer === 'wind' && !windPausedForZoom) scheduleFrame();
  }

  function setZooming(isZooming) {
    windPausedForZoom = Boolean(isZooming);
    const st = RDCFT.state;
    const { w, h } = viewportSize();
    st.windCtx?.clearRect(0, 0, w, h);
    if (!windPausedForZoom) {
      syncParticleDensity();
      // Sólo se descartan las estelas: las partículas conservan su posición, así
      // que el flujo continúa en vez de reaparecer entero de golpe tras el zoom.
      st.windParticles.forEach(p => { p.trail = [p.x, p.y]; });
      lastFieldUpdate = 0;
      if (st.activeLayer === 'wind') scheduleFrame();
    }
  }

  /**
   * Velocidad de pantalla (px/s) que tendría una partícula situada en ese píxel.
   * Es el punto por el que se verifica el invariante crítico del rumbo: viento
   * del norte debe empujar hacia abajo en pantalla, no hacia un lado.
   */
  function velocityAt(x, y) {
    buildWindField();
    if (!activeWindPoints.length) updateActiveWindPoints();
    return toScreenVelocity(sampleWindAtScreen(x, y) || fallbackWind());
  }

  RDCFT.canvas = { init, resize, refreshParticles, setZooming, velocityAt, requestRender: scheduleFrame };
})(window.RDCFT = window.RDCFT || {});
