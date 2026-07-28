/**
 * RDCFT · Modo día / modo noche
 *
 * Los chips de las barras de herramientas ya no reciben clases Tailwind oscuras
 * fijas desde JS (`bg-stone-900/80`, `text-stone-300`), que en modo día dejaban
 * botones oscuros sobre fondo claro. Ahora sólo se alternan las clases
 * semánticas `chip-active` / `chip-inactive`, definidas para ambos temas en CSS.
 */
(function (RDCFT) {
  'use strict';

  const SUN_ICON = '<svg class="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M12 5a7 7 0 100 14 7 7 0 000-14z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>';
  const MOON_ICON = '<svg class="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>';

  function init() {
    let saved = null;
    try {
      saved = localStorage.getItem('rdcft_theme');
    } catch (e) {
      // localStorage puede fallar en modo privado o bajo file:// en algunos navegadores.
    }
    set(saved === 'light' || saved === 'dark' ? saved : 'dark');
  }

  function toggle() {
    set(RDCFT.state.theme === 'dark' ? 'light' : 'dark');
  }

  function set(theme) {
    RDCFT.state.theme = theme;
    try {
      localStorage.setItem('rdcft_theme', theme);
    } catch (e) { /* sin persistencia disponible */ }

    const html = document.documentElement;
    html.classList.toggle('dark', theme === 'dark');
    html.classList.toggle('light', theme === 'light');

    const btn = document.getElementById('ui-theme-toggle');
    if (btn) {
      const isLight = theme === 'light';
      btn.innerHTML = `${isLight ? SUN_ICON : MOON_ICON}<span class="text-xs font-bold hidden md:inline">${isLight ? 'Modo Día' : 'Modo Noche'}</span>`;
      btn.title = isLight ? 'Cambiar a Modo Noche' : 'Cambiar a Modo Día';
      btn.setAttribute('aria-label', btn.title);
    }

    // El mapa de calor se funde distinto según el brillo de la base.
    RDCFT.map?.applyHeatmapBlend?.();
    RDCFT.markHeatmapDirty();
  }

  RDCFT.theme = { init, toggle, set };
})(window.RDCFT = window.RDCFT || {});
