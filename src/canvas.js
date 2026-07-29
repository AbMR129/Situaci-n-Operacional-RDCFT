/**
 * RDCFT · Canvas de mapa de calor y partículas de viento
 */
(function (RDCFT) {
  'use strict';

  let rafId = null;
  let lastFrameAt = null;

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
    if (rafId === null) rafId = requestAnimationFrame(animate);
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

  function createParticles() {
    const st = RDCFT.state;
    st.windParticles = [];
    for (let i = 0; i < RDCFT.config.PARTICLE_COUNT; i++) {
      st.windParticles.push(resetParticle({}));
    }
  }

  function resetParticle(p) {
    const { w, h } = viewportSize();

    p.x = Math.random() * w;
    p.y = Math.random() * h;
    p.age = 0;
    p.maxAge = 1.6 + Math.random() * 1.4;

    let speed = 22;
    let dirDeg = 315;

    const sample = RDCFT.weather.currentSample();
    if (sample) {
      // Velocidad visual en píxeles por segundo, deliberadamente desacoplada
      // de los FPS para que la lectura sea estable y no tape el mapa.
      speed = Math.max(16, RDCFT.utils.num(sample.wind, 10) * 2.1);
      dirDeg = RDCFT.utils.num(sample.direction, 315);
    }

    // El rumbo meteorológico indica desde DÓNDE sopla el viento, medido en grados
    // horarios desde el norte. En coordenadas de pantalla (x→este, y→sur) el
    // vector de avance es vx = -sen θ, vy = cos θ, equivalente a un ángulo de
    // pantalla de (θ + 90°). La versión anterior usaba (θ + 180°), que dibujaba
    // las partículas giradas 90° respecto del viento real.
    const angleRad = ((dirDeg + 90) * Math.PI) / 180;
    const jitter = 0.8 + Math.random() * 0.4;

    p.vx = Math.cos(angleRad) * speed * jitter;
    p.vy = Math.sin(angleRad) * speed * jitter;
    p.speed = speed;

    return p;
  }

  /**
   * Mapa de calor anclado al terreno: cada punto de muestreo se reproyecta a
   * coordenadas de pantalla, así que el color se mueve y escala con el mapa.
   */
  function renderHeatmap() {
    const st = RDCFT.state;
    if (!st.heatmapCtx || !st.map || !st.weatherData) return;

    const layer = st.activeLayer;
    if (!RDCFT.config.LAYERS[layer]) return;

    // Temperatura y humedad se leen mejor sobre el mapa base y en los badges de
    // ciudad; se omiten los focos difusos que podían tapar el territorio.
    if (layer === 'temp' || layer === 'humidity') return;

    const ctx = st.heatmapCtx;
    const { w, h } = viewportSize();
    ctx.clearRect(0, 0, w, h);

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

  function animate(timestamp) {
    const st = RDCFT.state;
    if (!st.windCtx || !st.windCanvas) {
      rafId = requestAnimationFrame(animate);
      return;
    }

    // El mapa de calor sólo se recalcula cuando cambió algo (mapa, capa, día,
    // hora o datos), en vez de redibujar diez gradientes radiales en cada frame.
    if (st.heatmapDirty) {
      renderHeatmap();
      st.heatmapDirty = false;
    }

    const ctx = st.windCtx;
    const { w, h } = viewportSize();

    const dt = lastFrameAt === null ? 1 / 60 : RDCFT.utils.clamp((timestamp - lastFrameAt) / 1000, 0, 0.05);
    lastFrameAt = timestamp;

    // Fuera de la capa de viento, el canvas queda limpio para preservar la
    // lectura de temperatura, humedad y precipitación.
    if (st.activeLayer !== 'wind') {
      ctx.clearRect(0, 0, w, h);
      rafId = requestAnimationFrame(animate);
      return;
    }

    // Desvanecer las estelas sin acumular fondo negro.
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.07)';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';

    ctx.lineWidth = 1.8;
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.88)';
    ctx.beginPath();

    st.windParticles.forEach(p => {
      ctx.moveTo(p.x, p.y);
      p.x += p.vx * RDCFT.config.WIND_ANIMATION_SPEED * dt;
      p.y += p.vy * RDCFT.config.WIND_ANIMATION_SPEED * dt;
      p.age += dt;
      ctx.lineTo(p.x, p.y);

      if (p.x < 0 || p.x > w || p.y < 0 || p.y > h || p.age > p.maxAge) resetParticle(p);
    });

    ctx.stroke();
    rafId = requestAnimationFrame(animate);
  }

  /** Reinicia el campo de partículas tras cambiar de día, hora o ubicación. */
  function refreshParticles() {
    RDCFT.state.windParticles.forEach(resetParticle);
  }

  RDCFT.canvas = { init, resize, refreshParticles };
})(window.RDCFT = window.RDCFT || {});
