/**
 * RDCFT · Utilidades
 * Formato de fechas y coordenadas, dirección de viento y escapado de HTML.
 */
(function (RDCFT) {
  'use strict';

  const DAY_NAMES_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  /** Escapa texto antes de interpolarlo en HTML. */
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str ?? '');
    return div.innerHTML;
  }

  /**
   * Convierte 'YYYY-MM-DD' en un Date local.
   * `new Date('2026-07-28')` lo interpretaría como UTC y en Chile mostraría el día
   * anterior, así que se construye componente a componente.
   */
  function parseISODate(dateStr) {
    const [y, m, d] = String(dateStr).split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  /** 'Mar' a partir de 'YYYY-MM-DD' devuelto por la API (no del reloj del navegador). */
  function dayNameShort(dateStr) {
    return DAY_NAMES_SHORT[parseISODate(dateStr).getDay()];
  }

  /** '28' a partir de 'YYYY-MM-DD'. */
  function dayNumber(dateStr) {
    return String(parseISODate(dateStr).getDate()).padStart(2, '0');
  }

  /** '28-07-2026' a partir de 'YYYY-MM-DD'. */
  function formatDDMMYYYY(dateStr) {
    const d = parseISODate(dateStr);
    return [
      String(d.getDate()).padStart(2, '0'),
      String(d.getMonth() + 1).padStart(2, '0'),
      d.getFullYear()
    ].join('-');
  }

  /** 'martes, 28 de julio de 2026' a partir de 'YYYY-MM-DD'. */
  function formatLongDate(dateStr, withYear) {
    const options = { weekday: 'long', day: 'numeric', month: 'long' };
    if (withYear) options.year = 'numeric';
    return parseISODate(dateStr).toLocaleDateString('es-CL', options);
  }

  /** Grados decimales a grados/minutos/segundos. */
  function toDMS(deg, isLat) {
    const absolute = Math.abs(deg);
    const degrees = Math.floor(absolute);
    const minutesNotTruncated = (absolute - degrees) * 60;
    const minutes = Math.floor(minutesNotTruncated);
    const seconds = ((minutesNotTruncated - minutes) * 60).toFixed(1);
    const card = deg >= 0 ? (isLat ? 'N' : 'E') : (isLat ? 'S' : 'O');
    return `${degrees}°${minutes}'${seconds}"${card}`;
  }

  function formatCoordsDMS(lat, lng) {
    return `${toDMS(lat, true)} ${toDMS(lng, false)}`;
  }

  /**
   * Rumbo meteorológico (dirección DESDE la que sopla el viento, en grados
   * horarios desde el norte) a punto cardinal.
   */
  function cardinalDirection(angle) {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
    return directions[Math.round(angle / 45) % 8];
  }

  /** Flecha que apunta hacia donde AVANZA el viento, dado el rumbo de procedencia. */
  function windArrow(angle) {
    const arrows = ['↓', '↙', '←', '↖', '↑', '↗', '→', '↘'];
    return arrows[Math.round(angle / 45) % 8];
  }

  /**
   * Devuelve `value` salvo que sea null/undefined/NaN.
   * Reemplaza al operador `||`, que convertía valores válidos de 0 (0 °C, calma
   * total, viento del norte exacto) en el valor por defecto.
   */
  function num(value, fallback) {
    return (value === null || value === undefined || Number.isNaN(value)) ? fallback : value;
  }

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  RDCFT.utils = {
    escapeHtml,
    parseISODate,
    dayNameShort,
    dayNumber,
    formatDDMMYYYY,
    formatLongDate,
    toDMS,
    formatCoordsDMS,
    cardinalDirection,
    windArrow,
    num,
    clamp
  };
})(window.RDCFT = window.RDCFT || {});
