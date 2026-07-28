/**
 * RDCFT - Reducción de Combustible Fuego Técnico
 * Engine de Meteorología & Situación Operacional 
 */

// --- ESTADO GLOBAL ---
const state = {
    coords: { lat: -36.1645, lng: -72.1882 }, // Cauquenes por defecto
    locationName: 'Valle de Cauquenes',
    comunaName: 'Cauquenes',
    weatherData: null,
    selectedDayIndex: 0, // 0 = hoy, 1..6
    selectedHour: 12,
    activeLayer: 'temp', // wind, temp, humidity, rain (default temp estilo Windy)
    mapTileType: 'satellite', // satellite, dark, light
    theme: 'dark', // dark, light
    isPlaying: false,
    playInterval: null,
    windParticles: [],
    windCanvas: null,
    windCtx: null,
    heatmapCanvas: null,
    heatmapCtx: null,
    map: null,
    marker: null,
    cityMarkersGroup: null,
    tileLayers: {}
};

// Zonas urbanas/regionales para marcadores de temperatura en mapa (estilo Windy)
const REGIONAL_SPOTS = [
    { name: 'Cauquenes', lat: -36.1645, lng: -72.1882 },
    { name: 'Talca', lat: -35.4264, lng: -71.6554 },
    { name: 'Concepción', lat: -36.8270, lng: -73.0498 },
    { name: 'Chillán', lat: -36.6063, lng: -72.1034 },
    { name: 'Linares', lat: -35.8454, lng: -71.5979 },
    { name: 'Parral', lat: -36.1436, lng: -71.8267 },
    { name: 'Constitución', lat: -35.3333, lng: -72.4167 },
    { name: 'Los Ángeles', lat: -37.4697, lng: -72.3537 },
    { name: 'Curicó', lat: -34.9856, lng: -71.2394 }
];

// --- CONFIGURACIÓN DE UMBRALES RDCFT ---
const RDCFT_THRESHOLDS = {
    eval: (temp, humidity, windSpeed, gust, rain) => {
        let score = 0; // 0 = Favorable, 1 = Restricción, 2 = No Favorable
        let reasons = [];

        if (temp > 26) {
            score = 2;
            reasons.push(`Temperatura elevada (${temp}°C > 26°C)`);
        } else if (temp > 21) {
            score = Math.max(score, 1);
            reasons.push(`Temperatura moderada (${temp}°C)`);
        }

        if (humidity < 30) {
            score = 2;
            reasons.push(`Humedad relativa crítica (${humidity}% < 30%)`);
        } else if (humidity < 45) {
            score = Math.max(score, 1);
            reasons.push(`Humedad relativa moderada (${humidity}%)`);
        }

        if (windSpeed > 20 || gust > 30) {
            score = 2;
            reasons.push(`Viento/Ráfagas altas (${windSpeed} km/h, ráfagas ${gust} km/h)`);
        } else if (windSpeed > 12 || gust > 20) {
            score = Math.max(score, 1);
            reasons.push(`Viento moderado (${windSpeed} km/h)`);
        }

        if (rain > 5) {
            score = 2;
            reasons.push(`Precipitación alta (${rain} mm)`);
        }

        if (score === 0) {
            return {
                status: 'FAVORABLE',
                badgeClass: 'bg-emerald-500/20 text-emerald-500 dark:text-industrial-verde border-emerald-500/30',
                cardClass: 'text-emerald-500 bg-emerald-500/10',
                indicatorColor: 'bg-emerald-500',
                dotColor: '#10b981',
                summary: `Viento bajo (${windSpeed} km/h), temp (${temp}°C) y humedad (${humidity}%). Condición idónea para quema controlada y RDCFT.`
            };
        } else if (score === 1) {
            return {
                status: 'CON RESTRICCIONES',
                badgeClass: 'bg-amber-500/20 text-amber-600 dark:text-industrial-amarillo border-amber-500/30',
                cardClass: 'text-amber-500 bg-amber-500/10',
                indicatorColor: 'bg-amber-500',
                dotColor: '#f59e0b',
                summary: `Condiciones límite: ${reasons.join(', ')}. Ejecutar con monitoreo continuo de comportamiento del fuego.`
            };
        } else {
            return {
                status: 'NO FAVORABLE',
                badgeClass: 'bg-rose-500/20 text-rose-600 dark:text-industrial-rojo border-rose-500/30',
                cardClass: 'text-rose-500 bg-rose-500/10',
                indicatorColor: 'bg-rose-500',
                dotColor: '#ef4444',
                summary: `NO RECOMENDADO: ${reasons.join(', ')}. Alto riesgo de escape o propagación no deseada.`
            };
        }
    }
};

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initMap();
    initWindCanvas();
    setupEventListeners();
    fetchWeatherData(state.coords.lat, state.coords.lng);
});

// --- SISTEMA DE TEMAS (MODO DÍA / MODO NOCHE) ---
function initTheme() {
    const savedTheme = localStorage.getItem('rdcft_theme') || 'dark';
    setTheme(savedTheme);
}

function toggleTheme() {
    const newTheme = state.theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
}

function setTheme(theme) {
    state.theme = theme;
    localStorage.setItem('rdcft_theme', theme);
    const htmlEl = document.documentElement;
    
    if (theme === 'light') {
        htmlEl.classList.remove('dark');
        htmlEl.classList.add('light');
    } else {
        htmlEl.classList.remove('light');
        htmlEl.classList.add('dark');
    }

    const themeBtn = document.getElementById('ui-theme-toggle');
    if (themeBtn) {
        if (theme === 'light') {
            themeBtn.innerHTML = `
                <svg class="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M12 5a7 7 0 100 14 7 7 0 000-14z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>
                <span class="text-xs font-bold hidden md:inline">Modo Día</span>
            `;
            themeBtn.title = "Cambiar a Modo Noche";
        } else {
            themeBtn.innerHTML = `
                <svg class="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>
                <span class="text-xs font-bold hidden md:inline">Modo Noche</span>
            `;
            themeBtn.title = "Cambiar a Modo Día";
        }
    }

    if (state.weatherData) {
        renderWeatherUI();
    }
}

// --- MAPA LEAFLET & SATÉLITE ---
function initMap() {
    state.map = L.map('map-container', {
        zoomControl: false,
        attributionControl: false
    }).setView([state.coords.lat, state.coords.lng], 10);

    const esriSat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: 'Esri World Imagery'
    });
    const esriLabels = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        opacity: 0.85
    });
    state.tileLayers.satellite = L.layerGroup([esriSat, esriLabels]);

    state.tileLayers.dark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd'
    });

    state.tileLayers.light = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd'
    });

    setMapTileType(state.mapTileType);

    // Marcador principal para punto consultado
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

    state.marker = L.marker([state.coords.lat, state.coords.lng], { icon: customIcon }).addTo(state.map);

    // Grupo de marcadores para ciudades/puntos regionales (estilo Windy)
    state.cityMarkersGroup = L.layerGroup().addTo(state.map);
    renderRegionalCityMarkers();

    state.map.on('click', (e) => {
        const { lat, lng } = e.latlng;
        updateLocation(lat, lng);
    });

    state.map.on('move', resizeWindCanvas);
    state.map.on('zoomend', () => {
        resizeWindCanvas();
        renderRegionalCityMarkers();
    });
}

function setMapTileType(type) {
    if (!state.map || !state.tileLayers[type]) return;

    Object.values(state.tileLayers).forEach(layer => {
        if (state.map.hasLayer(layer)) {
            state.map.removeLayer(layer);
        }
    });

    state.tileLayers[type].addTo(state.map);
    state.mapTileType = type;

    // El mapa de calor se funde distinto según el brillo de la base: 'screen' aclara sobre fondos
    // oscuros (satélite/oscuro), 'multiply' preserva contraste sobre el mapa claro.
    if (state.heatmapCanvas) {
        if (type === 'light') {
            state.heatmapCanvas.classList.remove('blend-screen');
            state.heatmapCanvas.classList.add('blend-multiply');
        } else {
            state.heatmapCanvas.classList.remove('blend-multiply');
            state.heatmapCanvas.classList.add('blend-screen');
        }
    }

    const mapTypeBtns = document.querySelectorAll('.map-type-btn');
    mapTypeBtns.forEach(btn => {
        if (btn.dataset.maptype === type) {
            btn.classList.add('bg-industrial-naranja', 'text-white', 'font-bold', 'shadow-md');
            btn.classList.remove('text-stone-300', 'bg-stone-900/80', 'bg-stone-100');
        } else {
            btn.classList.remove('bg-industrial-naranja', 'text-white', 'font-bold', 'shadow-md');
            btn.classList.add('text-stone-300', 'bg-stone-900/80');
        }
    });
}

// Valor de campo (temp/humedad/lluvia) en cualquier punto geográfico, interpolado a partir del
// dato consultado con una variación coherente por distancia. Comparte fórmula con el mapa de
// calor (renderHeatmapField) para que los badges de ciudad coincidan con el color bajo ellos.
function getFieldValue(layer, lat, lng) {
    const hourly = state.weatherData?.hourly;
    if (!hourly) return null;

    const baseIdx = state.selectedDayIndex * 24 + state.selectedHour;
    const latDiff = lat - state.coords.lat;
    const lngDiff = lng - state.coords.lng;

    if (layer === 'temp') {
        const base = hourly.temperature_2m[baseIdx] ?? 14;
        return base + latDiff * 1.5 + lngDiff * -1.2;
    }
    if (layer === 'humidity') {
        const base = hourly.relative_humidity_2m[baseIdx] ?? 50;
        return base + latDiff * -8 + lngDiff * 6;
    }
    if (layer === 'rain') {
        const base = hourly.precipitation[baseIdx] ?? 0;
        return Math.max(0, base + latDiff * -2 + lngDiff * 1.5);
    }
    return null;
}

// Escalas de color del mapa de calor: deben coincidir con los degradados de updateLegendBar().
const HEATMAP_COLOR_SCALES = {
    temp:     { min: -10, max: 40,  colors: [[30,64,175], [14,116,144], [101,163,13], [234,179,8], [249,115,22], [239,68,68]] },
    humidity: { min: 0,   max: 100, colors: [[234,179,8], [16,185,129], [14,165,233], [30,64,175]] },
    rain:     { min: 0,   max: 30,  colors: [[37,99,235], [34,197,94],  [234,179,8],  [239,68,68]] }
};

function colorForValue(layer, value) {
    const scale = HEATMAP_COLOR_SCALES[layer];
    if (!scale) return [255, 255, 255];

    const t = Math.min(1, Math.max(0, (value - scale.min) / (scale.max - scale.min)));
    const segments = scale.colors.length - 1;
    const segment = Math.min(segments - 1, Math.floor(t * segments));
    const localT = (t * segments) - segment;
    const c1 = scale.colors[segment];
    const c2 = scale.colors[segment + 1];

    return [
        Math.round(c1[0] + (c2[0] - c1[0]) * localT),
        Math.round(c1[1] + (c2[1] - c1[1]) * localT),
        Math.round(c1[2] + (c2[2] - c1[2]) * localT)
    ];
}

// Renderizar marcadores de ciudades regionales con temperatura (estilo Windy)
function renderRegionalCityMarkers() {
    if (!state.cityMarkersGroup) return;
    state.cityMarkersGroup.clearLayers();

    REGIONAL_SPOTS.forEach(spot => {
        const fieldTemp = getFieldValue('temp', spot.lat, spot.lng);
        const spotTemp = fieldTemp !== null ? Math.round(fieldTemp) : 14;

        const cityIcon = L.divIcon({
            className: 'windy-city-badge',
            html: `
                <div class="flex items-center gap-1 bg-stone-950/80 backdrop-blur text-white px-2 py-0.5 rounded border border-stone-700/80 shadow-lg text-[11px] font-extrabold whitespace-nowrap hover:scale-110 transition-transform">
                    <span class="text-stone-300">${spot.name}</span>
                    <span class="text-amber-400 font-black">${spotTemp}°</span>
                </div>
            `,
            iconSize: [80, 20],
            iconAnchor: [40, 10]
        });

        const m = L.marker([spot.lat, spot.lng], { icon: cityIcon });
        m.on('click', () => updateLocation(spot.lat, spot.lng, spot.name));
        state.cityMarkersGroup.addLayer(m);
    });
}

// --- ACTUALIZAR UBICACIÓN ---
async function updateLocation(lat, lng, name = null) {
    state.coords = { lat: parseFloat(lat.toFixed(4)), lng: parseFloat(lng.toFixed(4)) };
    state.marker.setLatLng([state.coords.lat, state.coords.lng]);

    if (name) {
        state.locationName = name;
    }

    updateCoordsUI();
    reverseGeocode(state.coords.lat, state.coords.lng);
    await fetchWeatherData(state.coords.lat, state.coords.lng);
}

function updateCoordsUI() {
    const latStr = state.coords.lat.toFixed(4);
    const lngStr = state.coords.lng.toFixed(4);
    
    const toDMS = (deg, isLat) => {
        const absolute = Math.abs(deg);
        const degrees = Math.floor(absolute);
        const minutesNotTruncated = (absolute - degrees) * 60;
        const minutes = Math.floor(minutesNotTruncated);
        const seconds = ((minutesNotTruncated - minutes) * 60).toFixed(1);
        const card = deg >= 0 ? (isLat ? 'N' : 'E') : (isLat ? 'S' : 'O');
        return `${degrees}°${minutes}'${seconds}"${card}`;
    };

    const dmsText = `${toDMS(state.coords.lat, true)} ${toDMS(state.coords.lng, false)}`;

    const elCoordsDecimal = document.getElementById('ui-coords-decimal');
    const elCoordsDMS = document.getElementById('ui-coords-dms');
    const elDateIndicator = document.getElementById('ui-date-indicator');

    if (elCoordsDecimal) elCoordsDecimal.textContent = `${latStr}, ${lngStr}`;
    if (elCoordsDMS) elCoordsDMS.textContent = dmsText;
    
    if (elDateIndicator && state.weatherData) {
        const currentDayStr = getDayFormatted(state.selectedDayIndex);
        elDateIndicator.textContent = `Día ${state.selectedDayIndex + 1}: ${currentDayStr}`;
    }
}

// --- REVERSE GEOCODING (NOMINATIM) ---
async function reverseGeocode(lat, lng) {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10`);
        if (response.ok) {
            const data = await response.json();
            const comuna = data.address.city || data.address.town || data.address.suburb || data.address.county || data.address.state || 'Chile';
            state.comunaName = comuna;
            
            const elComuna = document.getElementById('ui-comuna-name');
            if (elComuna) elComuna.textContent = `Comuna: ${comuna}`;

            if (!state.locationName || state.locationName.startsWith('Coordenada')) {
                state.locationName = comuna;
                updateLocationHeader();
            }
        }
    } catch (e) {
        console.warn('Geocodificación inversa no disponible:', e);
    }
}

function updateLocationHeader() {
    const elHeaderTitle = document.getElementById('ui-location-title');
    const elMapPaisaje = document.getElementById('ui-map-paisaje');
    if (elHeaderTitle) elHeaderTitle.textContent = state.locationName;
    if (elMapPaisaje) elMapPaisaje.textContent = `Paisaje: ${state.locationName}`;
}

// --- API METEOROLÓGICA (OPEN-METEO) ---
async function fetchWeatherData(lat, lng) {
    showLoadingState(true);
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max&timezone=auto`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Error al conectar con la API de meteorología');
        
        state.weatherData = await res.json();
        renderWeatherUI();
        renderRegionalCityMarkers();
    } catch (err) {
        console.error('Error fetching weather data:', err);
        alert('No se pudieron obtener los datos meteorológicos. Verifique su conexión.');
    } finally {
        showLoadingState(false);
    }
}

function showLoadingState(isLoading) {
    const loader = document.getElementById('ui-loader');
    if (loader) {
        if (isLoading) loader.classList.remove('hidden');
        else loader.classList.add('hidden');
    }
}

// --- RENDERIZADO DE INTERFAZ ---
function renderWeatherUI() {
    if (!state.weatherData) return;

    renderDateSelector();
    renderSidebarCards();
    updateLayerOverlay();
    updateLegendBar();
}

function getDayFormatted(dayOffset) {
    const date = new Date();
    date.setDate(date.getDate() + dayOffset);
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
}

function getDayNameShort(dayOffset) {
    const date = new Date();
    date.setDate(date.getDate() + dayOffset);
    const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    return days[date.getDay()];
}

function renderDateSelector() {
    const container = document.getElementById('ui-date-selector');
    if (!container || !state.weatherData.daily) return;

    const daily = state.weatherData.daily;
    const hourly = state.weatherData.hourly;

    let html = '';
    for (let i = 0; i < Math.min(6, daily.time.length); i++) {
        const isSelected = i === state.selectedDayIndex;
        const dayName = getDayNameShort(i);
        const dayNumber = daily.time[i].split('-')[2];

        const hourIdx = i * 24 + 14;
        const temp = hourly.temperature_2m[hourIdx] || 15;
        const hum = hourly.relative_humidity_2m[hourIdx] || 50;
        const wind = hourly.wind_speed_10m[hourIdx] || 5;
        const gust = hourly.wind_gusts_10m[hourIdx] || 10;
        const rain = hourly.precipitation[hourIdx] || 0;

        const evalRes = RDCFT_THRESHOLDS.eval(temp, hum, wind, gust, rain);

        const activeClass = isSelected
            ? 'bg-industrial-naranja text-white shadow-lg scale-105 font-black ring-2 ring-industrial-naranja/50'
            : 'bg-stone-800/60 dark:bg-industrial-corteza/60 hover:bg-stone-700/80 text-stone-200 dark:text-stone-300';

        html += `
            <button onclick="selectDay(${i})" class="min-w-[58px] ${activeClass} rounded-industrial p-2 flex flex-col items-center transition-all cursor-pointer border border-stone-700/50 dark:border-stone-800">
                <span class="text-[10px] uppercase ${isSelected ? 'text-white font-bold' : 'opacity-70'}">${dayName}</span>
                <span class="text-xl font-black">${dayNumber}</span>
                <span class="w-2 h-2 rounded-full ${evalRes.indicatorColor} mt-1 shadow-sm"></span>
            </button>
        `;
    }

    container.innerHTML = html;

    const elDateIndicator = document.getElementById('ui-date-indicator');
    if (elDateIndicator) {
        elDateIndicator.textContent = `Día ${state.selectedDayIndex + 1}: ${getDayFormatted(state.selectedDayIndex)}`;
    }

    const elHeaderDate = document.getElementById('ui-sidebar-date');
    if (elHeaderDate) {
        const dateObj = new Date();
        dateObj.setDate(dateObj.getDate() + state.selectedDayIndex);
        const options = { weekday: 'long', day: 'numeric', month: 'long' };
        elHeaderDate.textContent = dateObj.toLocaleDateString('es-CL', options);
    }
}

function selectDay(index) {
    state.selectedDayIndex = index;
    renderWeatherUI();
    renderRegionalCityMarkers();
}

function renderSidebarCards() {
    const container = document.getElementById('ui-timeline-cards');
    if (!container || !state.weatherData.hourly) return;

    const hourly = state.weatherData.hourly;
    const baseHourIdx = state.selectedDayIndex * 24;

    const keyHours = [10, 15, 18];
    let html = '';

    keyHours.forEach(h => {
        const idx = baseHourIdx + h;
        if (idx >= hourly.time.length) return;

        const temp = Math.round(hourly.temperature_2m[idx]);
        const hum = Math.round(hourly.relative_humidity_2m[idx]);
        const rain = hourly.precipitation[idx] ? hourly.precipitation[idx].toFixed(1) : '0.0';
        const wind = Math.round(hourly.wind_speed_10m[idx]);
        const gust = Math.round(hourly.wind_gusts_10m[idx]);
        const dir = hourly.wind_direction_10m[idx];

        const evalRes = RDCFT_THRESHOLDS.eval(temp, hum, wind, gust, parseFloat(rain));

        const cardinalDir = getCardinalDirection(dir);
        const windArrow = getWindArrow(dir);

        const weatherIcon = h === 18 ? 
            `<svg class="w-8 h-8 text-orange-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M12 5a7 7 0 100 14 7 7 0 000-14z"></path></svg>` :
            (h === 15 ?
            `<svg class="w-8 h-8 text-amber-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0s-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0s-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96c.39-.39.39-1.03 0-1.41s-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36c.39-.39.39-1.03 0-1.41s-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"></path></svg>` :
            `<svg class="w-8 h-8 text-sky-500" fill="currentColor" viewBox="0 0 24 24"><path d="M13 16.35c.39 0 .74-.26.85-.63.59-2.01 1.5-3.88 2.66-5.51.13-.18.14-.42.02-.61-.31-.47-.56-.97-.73-1.5-.11-.33-.4-.57-.75-.57h-3.41c-.49 0-.88.4-.88.88 0 .14.03.28.09.4l1.32 2.64c.14.28.14.61 0 .89L10.86 15c-.24.48.11 1.35.84 1.35h1.3zM19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"></path></svg>`);

        html += `
            <div class="bg-stone-100 dark:bg-industrial-corteza/80 rounded-industrial p-5 border border-stone-300 dark:border-stone-800 space-y-4 shadow-sm hover:border-stone-400 dark:hover:border-stone-700 transition-all">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <span class="text-xl font-black text-stone-800 dark:text-white">${h}:00</span>
                        ${weatherIcon}
                    </div>
                    <div class="flex items-center gap-1.5 ${evalRes.cardClass} px-2.5 py-1 rounded text-[10px] font-black tracking-wide border border-current/20">
                        <span class="w-2 h-2 rounded-full ${evalRes.indicatorColor}"></span>
                        ${evalRes.status}
                    </div>
                </div>

                <div class="grid grid-cols-3 gap-3 text-center bg-stone-200/70 dark:bg-stone-900/60 p-3 rounded-industrial border border-stone-300/80 dark:border-stone-800/80">
                    <div>
                        <p class="text-[10px] text-stone-500 dark:text-stone-400 uppercase font-bold">Temp.</p>
                        <p class="text-sky-600 dark:text-industrial-calipso font-black text-lg">${temp}°C</p>
                    </div>
                    <div>
                        <p class="text-[10px] text-stone-500 dark:text-stone-400 uppercase font-bold">Humedad</p>
                        <p class="text-sky-600 dark:text-industrial-calipso font-black text-lg">${hum}%</p>
                    </div>
                    <div>
                        <p class="text-[10px] text-stone-500 dark:text-stone-400 uppercase font-bold">Lluvia</p>
                        <p class="${parseFloat(rain) > 0 ? 'text-sky-600 dark:text-industrial-calipso font-black text-lg' : 'text-stone-500 dark:text-stone-400 font-bold text-base'}">${rain} mm</p>
                    </div>
                    <div>
                        <p class="text-[10px] text-stone-500 dark:text-stone-400 uppercase font-bold">Viento</p>
                        <p class="text-stone-900 dark:text-white font-black text-sm">${windArrow} ${wind} km/h</p>
                    </div>
                    <div>
                        <p class="text-[10px] text-stone-500 dark:text-stone-400 uppercase font-bold">Racha</p>
                        <p class="text-amber-600 dark:text-industrial-amarillo font-black text-lg">${gust} km/h</p>
                    </div>
                    <div>
                        <p class="text-[10px] text-stone-500 dark:text-stone-400 uppercase font-bold">Dirección</p>
                        <p class="text-stone-900 dark:text-white font-black text-sm">${dir}° ${cardinalDir}</p>
                    </div>
                </div>

                <p class="text-xs text-stone-700 dark:text-stone-300 leading-relaxed border-t border-stone-300/80 dark:border-stone-800/80 pt-3">
                    ${evalRes.summary}
                </p>
            </div>
        `;
    });

    container.innerHTML = html;

    const elStatusBadge = document.getElementById('ui-status-badge');
    if (elStatusBadge) {
        const finalEval = RDCFT_THRESHOLDS.eval(
            hourly.temperature_2m[baseHourIdx + 15] || 20,
            hourly.relative_humidity_2m[baseHourIdx + 15] || 50,
            hourly.wind_speed_10m[baseHourIdx + 15] || 5,
            hourly.wind_gusts_10m[baseHourIdx + 15] || 10,
            hourly.precipitation[baseHourIdx + 15] || 0
        );

        elStatusBadge.className = `px-3 py-1 rounded-full text-[10px] font-black uppercase border ${finalEval.badgeClass}`;
        elStatusBadge.textContent = finalEval.status;
    }
}

function getCardinalDirection(angle) {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
    return directions[Math.round(angle / 45) % 8];
}

function getWindArrow(angle) {
    const arrows = ['↓', '↙', '←', '↖', '↑', '↗', '→', '↘'];
    return arrows[Math.round(angle / 45) % 8];
}

// --- CANVAS DE PARTÍCULAS Y MAPA DE CALOR (ESTILO WINDY) ---
function initWindCanvas() {
    const container = document.getElementById('map-viewport');
    if (!container) return;

    // Canvas de calor: por debajo de las partículas, fusionado con las teselas del mapa vía CSS
    // mix-blend-mode (ver setMapTileType) para que se sienta incrustado y no como un panel flotante.
    state.heatmapCanvas = document.createElement('canvas');
    state.heatmapCanvas.id = 'heatmap-canvas';
    state.heatmapCanvas.className = 'absolute inset-0 pointer-events-none z-[15] transition-opacity duration-500 ease-out blend-screen';
    container.appendChild(state.heatmapCanvas);
    state.heatmapCtx = state.heatmapCanvas.getContext('2d');

    state.windCanvas = document.createElement('canvas');
    state.windCanvas.id = 'wind-canvas';
    state.windCanvas.className = 'absolute inset-0 pointer-events-none z-20';
    container.appendChild(state.windCanvas);

    state.windCtx = state.windCanvas.getContext('2d');

    resizeWindCanvas();
    createParticles();
    requestAnimationFrame(animateWind);
}

function resizeWindCanvas() {
    if (!state.windCanvas || !state.map) return;
    const container = document.getElementById('map-viewport');
    state.windCanvas.width = container.clientWidth;
    state.windCanvas.height = container.clientHeight;

    if (state.heatmapCanvas) {
        state.heatmapCanvas.width = container.clientWidth;
        state.heatmapCanvas.height = container.clientHeight;
    }
}

function createParticles() {
    const count = 220;
    state.windParticles = [];
    for (let i = 0; i < count; i++) {
        state.windParticles.push(resetParticle({}));
    }
}

function resetParticle(p) {
    const w = state.windCanvas ? state.windCanvas.width : 800;
    const h = state.windCanvas ? state.windCanvas.height : 600;

    p.x = Math.random() * w;
    p.y = Math.random() * h;
    p.age = 0;
    p.maxAge = 40 + Math.random() * 60;

    let speed = 8;
    let angleRad = Math.PI * 0.75;

    if (state.weatherData && state.weatherData.hourly) {
        const baseIdx = state.selectedDayIndex * 24 + state.selectedHour;
        const windKmh = state.weatherData.hourly.wind_speed_10m[baseIdx] || 10;
        const dirDeg = state.weatherData.hourly.wind_direction_10m[baseIdx] || 315;

        speed = Math.max(2, windKmh * 0.4);
        angleRad = ((dirDeg + 180) * Math.PI) / 180;
    }

    p.vx = Math.cos(angleRad) * speed * (0.8 + Math.random() * 0.4);
    p.vy = Math.sin(angleRad) * speed * (0.8 + Math.random() * 0.4);
    p.speed = speed;

    return p;
}

// Renderizar Mapa de Calor Estilo Windy (Temperatura, Humedad, Lluvia)
// A diferencia de la versión anterior (un degradado fijo en pantalla), esto proyecta cada punto de
// muestreo a coordenadas de pantalla vía Leaflet en cada frame, por lo que el "glow" de color queda
// anclado al terreno real y se mueve/escala con el pan y el zoom del mapa en vez de flotar encima.
function renderHeatmapField() {
    if (!state.heatmapCtx || !state.heatmapCanvas || !state.map || !state.weatherData) return;

    // Si la capa activa es viento, no se redibuja nada: el último frame queda congelado mientras
    // la transición de opacidad CSS (blend-screen/blend-multiply) lo desvanece suavemente.
    if (state.activeLayer === 'wind') return;

    const ctx = state.heatmapCtx;
    const w = state.heatmapCanvas.width;
    const h = state.heatmapCanvas.height;
    ctx.clearRect(0, 0, w, h);

    const zoom = state.map.getZoom();
    const radius = Math.min(900, Math.max(160, 60 * Math.pow(1.35, zoom - 10)));
    const bounds = state.map.getBounds().pad(0.5);

    const samplePoints = [...REGIONAL_SPOTS, { name: state.locationName, lat: state.coords.lat, lng: state.coords.lng }];

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    samplePoints.forEach(spot => {
        if (!bounds.contains([spot.lat, spot.lng])) return;

        const value = getFieldValue(state.activeLayer, spot.lat, spot.lng);
        if (value === null) return;

        const [r, g, b] = colorForValue(state.activeLayer, value);
        const pt = state.map.latLngToContainerPoint([spot.lat, spot.lng]);

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

function animateWind() {
    if (!state.windCtx || !state.windCanvas) return;

    renderHeatmapField();

    const ctx = state.windCtx;
    const w = state.windCanvas.width;
    const h = state.windCanvas.height;

    // Desvanecer estelas de forma 100% transparente sin acumular fondo negro
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
    ctx.fillRect(0, 0, w, h);

    ctx.globalCompositeOperation = 'source-over';

    // Estelas de viento (el mapa de calor ahora vive en heatmap-canvas, fusionado con las teselas)
    let particleColor = 'rgba(255, 255, 255, 0.9)'; // Blanco para máximo contraste estilo Windy
    if (state.activeLayer === 'wind') particleColor = '#38bdf8'; // Calipso en capa viento libre

    ctx.lineWidth = 1.8;
    ctx.strokeStyle = particleColor;
    ctx.beginPath();

    state.windParticles.forEach(p => {
        ctx.moveTo(p.x, p.y);

        p.x += p.vx;
        p.y += p.vy;
        p.age++;

        ctx.lineTo(p.x, p.y);

        if (p.x < 0 || p.x > w || p.y < 0 || p.y > h || p.age > p.maxAge) {
            resetParticle(p);
        }
    });

    ctx.stroke();
    requestAnimationFrame(animateWind);
}

function updateLayerOverlay() {
    const buttons = document.querySelectorAll('.layer-btn');
    buttons.forEach(btn => {
        if (btn.dataset.layer === state.activeLayer) {
            btn.classList.add('bg-industrial-naranja', 'text-white', 'font-bold', 'shadow-md');
            btn.classList.remove('text-stone-400', 'bg-stone-900/80', 'bg-stone-100');
        } else {
            btn.classList.remove('bg-industrial-naranja', 'text-white', 'font-bold', 'shadow-md');
            btn.classList.add('text-stone-400', 'bg-stone-900/80');
        }
    });
}

function setLayer(layerName) {
    state.activeLayer = layerName;
    updateLayerOverlay();
    updateLegendBar();

    // Fundido suave del mapa de calor al entrar/salir de la capa de viento, en vez de un corte seco
    if (state.heatmapCanvas) {
        state.heatmapCanvas.style.opacity = layerName === 'wind' ? '0' : '1';
    }
}

// Barra de Leyenda de Colores inferior derecha (estilo Windy)
function updateLegendBar() {
    const legendEl = document.getElementById('ui-color-legend');
    if (!legendEl) return;

    if (state.activeLayer === 'temp') {
        legendEl.innerHTML = `
            <div class="flex flex-col gap-1 text-[10px] font-bold text-stone-800 dark:text-stone-200">
                <div class="flex justify-between text-[9px] text-stone-500 dark:text-stone-400">
                    <span>-10°C</span>
                    <span>0°C</span>
                    <span>10°C</span>
                    <span>20°C</span>
                    <span>30°C</span>
                    <span>40°C+</span>
                </div>
                <div class="h-2.5 w-64 rounded-full shadow-inner" style="background: linear-gradient(to right, #1e40af, #0e7490, #65a30d, #eab308, #f97316, #ef4444);"></div>
                <div class="text-right text-[9px] text-stone-500 dark:text-stone-400">Escala de Temperatura (°C)</div>
            </div>
        `;
        legendEl.classList.remove('hidden');
    } else if (state.activeLayer === 'humidity') {
        legendEl.innerHTML = `
            <div class="flex flex-col gap-1 text-[10px] font-bold text-stone-800 dark:text-stone-200">
                <div class="flex justify-between text-[9px] text-stone-500 dark:text-stone-400">
                    <span>0%</span>
                    <span>25%</span>
                    <span>50%</span>
                    <span>75%</span>
                    <span>100%</span>
                </div>
                <div class="h-2.5 w-56 rounded-full shadow-inner" style="background: linear-gradient(to right, #eab308, #10b981, #0ea5e9, #1e40af);"></div>
                <div class="text-right text-[9px] text-stone-500 dark:text-stone-400">Humedad Relativa (%)</div>
            </div>
        `;
        legendEl.classList.remove('hidden');
    } else if (state.activeLayer === 'rain') {
        legendEl.innerHTML = `
            <div class="flex flex-col gap-1 text-[10px] font-bold text-stone-800 dark:text-stone-200">
                <div class="flex justify-between text-[9px] text-stone-500 dark:text-stone-400">
                    <span>0 mm</span>
                    <span>2 mm</span>
                    <span>5 mm</span>
                    <span>15 mm</span>
                    <span>30 mm+</span>
                </div>
                <div class="h-2.5 w-56 rounded-full shadow-inner" style="background: linear-gradient(to right, #2563eb, #22c55e, #eab308, #ef4444);"></div>
                <div class="text-right text-[9px] text-stone-500 dark:text-stone-400">Precipitación (mm)</div>
            </div>
        `;
        legendEl.classList.remove('hidden');
    } else {
        legendEl.classList.add('hidden');
    }
}

// --- EVENT LISTENERS & UI CONTROLS ---
function setupEventListeners() {
    const searchInputs = document.querySelectorAll('input[placeholder*="Buscar"]');
    searchInputs.forEach(input => {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                performSearch(input.value);
            }
        });
    });

    const selectPaisaje = document.getElementById('ui-select-paisaje');
    if (selectPaisaje) {
        selectPaisaje.addEventListener('change', (e) => {
            const val = e.target.value;
            if (val === 'Valle de Cauquenes') {
                updateLocation(-36.1645, -72.1882, 'Valle de Cauquenes');
                state.map.setView([-36.1645, -72.1882], 10);
            } else if (val === 'Secano del Mataquito') {
                updateLocation(-35.0500, -71.4000, 'Secano del Mataquito');
                state.map.setView([-35.0500, -71.4000], 10);
            } else if (val === 'Alto Biobío') {
                updateLocation(-37.8833, -71.4167, 'Alto Biobío');
                state.map.setView([-37.8833, -71.4167], 10);
            }
        });
    }

    const btnTheme = document.getElementById('ui-theme-toggle');
    if (btnTheme) {
        btnTheme.addEventListener('click', toggleTheme);
    }

    const btnZoomIn = document.getElementById('ui-zoom-in');
    const btnZoomOut = document.getElementById('ui-zoom-out');
    if (btnZoomIn) btnZoomIn.addEventListener('click', () => state.map && state.map.zoomIn());
    if (btnZoomOut) btnZoomOut.addEventListener('click', () => state.map && state.map.zoomOut());

    const btnPdf = document.getElementById('ui-btn-pdf');
    if (btnPdf) {
        btnPdf.addEventListener('click', exportPDFReport);
    }
}

async function performSearch(query) {
    if (!query || query.trim() === '') return;
    try {
        showLoadingState(true);
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=cl`);
        if (res.ok) {
            const results = await res.json();
            if (results && results.length > 0) {
                const item = results[0];
                const lat = parseFloat(item.lat);
                const lon = parseFloat(item.lon);
                state.map.setView([lat, lon], 12);
                await updateLocation(lat, lon, item.display_name.split(',')[0]);
            } else {
                alert('No se encontraron resultados para la búsqueda.');
            }
        }
    } catch (e) {
        console.error('Error al buscar lugar:', e);
    } finally {
        showLoadingState(false);
    }
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
}

function exportPDFReport() {
    const dayStr = getDayFormatted(state.selectedDayIndex);
    const dateObj = new Date();
    dateObj.setDate(dateObj.getDate() + state.selectedDayIndex);
    const dateFormatted = dateObj.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    const pdfWindow = window.open('', '_blank');
    const pdfContent = `
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="utf-8">
            <title>Informe de Situación Operacional - ${escapeHtml(state.locationName)}</title>
            <style>
                body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1a1816; margin: 30px; line-height: 1.5; }
                .header { border-b: 3px solid #f97316; padding-bottom: 15px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
                .title { font-size: 24px; font-weight: bold; color: #1a1816; text-transform: uppercase; }
                .subtitle { font-size: 14px; color: #f97316; font-weight: bold; }
                .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 25px; }
                .meta-table td { padding: 8px 12px; border: 1px solid #e5e7eb; font-size: 13px; }
                .meta-title { background: #2a2724; color: #fff; font-weight: bold; width: 25%; }
                .section-title { font-size: 16px; font-weight: bold; margin-top: 25px; margin-bottom: 10px; border-bottom: 1px solid #d1d5db; padding-bottom: 5px; }
                .forecast-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                .forecast-table th { background: #1a1816; color: #fff; padding: 8px; text-align: center; font-size: 12px; }
                .forecast-table td { padding: 8px; border: 1px solid #e5e7eb; text-align: center; font-size: 12px; }
                .footer { margin-top: 40px; font-size: 11px; color: #6b7280; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 15px; }
            </style>
        </head>
        <body>
            <div class="header">
                <div>
                    <div class="title">Informe de Situación Operacional</div>
                    <div class="subtitle">Plataforma RDCFT - Reducción de Combustible Fuego Técnico</div>
                </div>
                <div style="text-align: right; font-size: 12px; color: #4b5563;">
                    Fecha Emisión: ${new Date().toLocaleDateString('es-CL')}<br>
                    Hora: ${new Date().toLocaleTimeString('es-CL')}
                </div>
            </div>

            <table class="meta-table">
                <tr>
                    <td class="meta-title">Paisaje / Ubicación</td>
                    <td><strong>${escapeHtml(state.locationName)}</strong></td>
                    <td class="meta-title">Comuna</td>
                    <td>${escapeHtml(state.comunaName)}</td>
                </tr>
                <tr>
                    <td class="meta-title">Coordenadas</td>
                    <td>${state.coords.lat}, ${state.coords.lng}</td>
                    <td class="meta-title">Fecha Evaluada</td>
                    <td>${dateFormatted} (${dayStr})</td>
                </tr>
            </table>

            <div class="section-title">Pronóstico Horario y Ventana Operacional</div>
            <table class="forecast-table">
                <thead>
                    <tr>
                        <th>Hora</th>
                        <th>Temperatura</th>
                        <th>Humedad Relativa</th>
                        <th>Precipitación</th>
                        <th>Viento / Ráfagas</th>
                        <th>Dirección</th>
                        <th>Evaluación RDCFT</th>
                    </tr>
                </thead>
                <tbody>
                    ${generatePDFForecastRows()}
                </tbody>
            </table>

            <div class="section-title">Recomendación Técnica Operacional</div>
            <p style="font-size: 13px; color: #374151; background: #f9fafb; padding: 15px; border-left: 4px solid #f97316; border-radius: 4px;">
                La evaluación del comportamiento del fuego técnico está sujeta a las variaciones del microclima local y tipo de combustible. Se recomienda validar con mediciones de estación meteorológica móvil en terreno antes y durante el encendido.
            </p>

            <div class="footer">
                Documento generado automáticamente por el Sistema de Situación Operacional RDCFT.
            </div>

            <script>
                window.onload = function() { window.print(); }
            </script>
        </body>
        </html>
    `;
    pdfWindow.document.write(pdfContent);
    pdfWindow.document.close();
}

function generatePDFForecastRows() {
    if (!state.weatherData || !state.weatherData.hourly) return '';
    const hourly = state.weatherData.hourly;
    const baseIdx = state.selectedDayIndex * 24;
    let rows = '';

    [9, 11, 13, 15, 17, 19].forEach(h => {
        const idx = baseIdx + h;
        if (idx >= hourly.time.length) return;

        const temp = Math.round(hourly.temperature_2m[idx]);
        const hum = Math.round(hourly.relative_humidity_2m[idx]);
        const rain = hourly.precipitation[idx] ? hourly.precipitation[idx].toFixed(1) : '0.0';
        const wind = Math.round(hourly.wind_speed_10m[idx]);
        const gust = Math.round(hourly.wind_gusts_10m[idx]);
        const dir = hourly.wind_direction_10m[idx];

        const evalRes = RDCFT_THRESHOLDS.eval(temp, hum, wind, gust, parseFloat(rain));

        rows += `
            <tr>
                <td><strong>${h}:00</strong></td>
                <td>${temp}°C</td>
                <td>${hum}%</td>
                <td>${rain} mm</td>
                <td>${wind} / ${gust} km/h</td>
                <td>${dir}° ${getCardinalDirection(dir)}</td>
                <td style="font-weight: bold;">${evalRes.status}</td>
            </tr>
        `;
    });
    return rows;
}
