/**
 * RDCFT · Informe imprimible
 * Abre una ventana con el informe del día seleccionado y lanza el diálogo de impresión.
 */
(function (RDCFT) {
  'use strict';

  function forecastRows() {
    const dateStr = RDCFT.ui.selectedDateStr();
    if (!dateStr) return '';

    // Mismas horas que las tarjetas del panel y el semáforo diario.
    return RDCFT.ui.dayEvaluations(dateStr).map(({ hour, sample, evaluation }) => {
      if (!sample) return '';
      const u = RDCFT.utils;
      const temp = sample.temp === null ? '—' : `${Math.round(sample.temp)} °C`;
      const hum = sample.humidity === null ? '—' : `${Math.round(sample.humidity)} %`;
      const rain = sample.rain === null ? '—' : `${sample.rain.toFixed(1)} mm`;
      const wind = sample.wind === null ? '—' : Math.round(sample.wind);
      const gust = sample.gust === null ? '—' : Math.round(sample.gust);
      const dir = sample.direction === null
        ? '—'
        : `${Math.round(sample.direction)}° ${u.cardinalDirection(sample.direction)}`;

      return `
        <tr>
          <td><strong>${String(hour).padStart(2, '0')}:00</strong></td>
          <td>${temp}</td>
          <td>${hum}</td>
          <td>${rain}</td>
          <td>${wind} / ${gust} km/h</td>
          <td>${dir}</td>
          <td class="status">${u.escapeHtml(evaluation.status)}</td>
        </tr>
      `;
    }).join('');
  }

  function exportReport() {
    const st = RDCFT.state;
    const u = RDCFT.utils;
    const dateStr = RDCFT.ui.selectedDateStr();

    if (!dateStr || !st.weatherData) {
      RDCFT.ui.toast('Aún no hay pronóstico cargado para generar el informe.', 'warn');
      return;
    }

    // Si el navegador bloquea las ventanas emergentes, `window.open` devuelve null
    // y la versión anterior lanzaba una excepción sin avisar de nada al usuario.
    const win = window.open('', '_blank');
    if (!win) {
      RDCFT.ui.toast('El navegador bloqueó la ventana del informe. Permita las ventanas emergentes para este sitio.', 'error');
      return;
    }

    const worst = RDCFT.rdcft.worst(RDCFT.ui.dayEvaluations(dateStr).map(r => r.evaluation));
    const now = new Date();

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Informe de Situación Operacional · ${u.escapeHtml(st.locationName)}</title>
  <style>
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1a1816; margin: 30px; line-height: 1.5; }
    /* Antes esta regla usaba border-b, sintaxis de Tailwind que no es CSS válido,
       así que la línea naranja del encabezado nunca llegaba a dibujarse. */
    .header { border-bottom: 3px solid #f97316; padding-bottom: 15px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
    .title { font-size: 24px; font-weight: bold; text-transform: uppercase; }
    .subtitle { font-size: 14px; color: #f97316; font-weight: bold; }
    .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 25px; }
    .meta-table td { padding: 8px 12px; border: 1px solid #e5e7eb; font-size: 13px; }
    .meta-title { background: #2a2724; color: #fff; font-weight: bold; width: 25%; }
    .section-title { font-size: 16px; font-weight: bold; margin-top: 25px; margin-bottom: 10px; border-bottom: 1px solid #d1d5db; padding-bottom: 5px; }
    .forecast-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    .forecast-table th { background: #1a1816; color: #fff; padding: 8px; text-align: center; font-size: 12px; }
    .forecast-table td { padding: 8px; border: 1px solid #e5e7eb; text-align: center; font-size: 12px; }
    .forecast-table td.status { font-weight: bold; }
    .verdict { font-size: 14px; font-weight: bold; padding: 12px 15px; border-radius: 4px; background: #f9fafb; border-left: 4px solid #f97316; }
    .note { font-size: 13px; color: #374151; background: #f9fafb; padding: 15px; border-left: 4px solid #f97316; border-radius: 4px; }
    .footer { margin-top: 40px; font-size: 11px; color: #6b7280; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 15px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="title">Informe de Situación Operacional</div>
      <div class="subtitle">Plataforma RDCFT · Reducción de Combustible por Fuego Técnico</div>
    </div>
    <div style="text-align: right; font-size: 12px; color: #4b5563;">
      Emitido: ${u.escapeHtml(now.toLocaleDateString('es-CL'))}<br>
      Hora: ${u.escapeHtml(now.toLocaleTimeString('es-CL'))}
    </div>
  </div>

  <table class="meta-table">
    <tr>
      <td class="meta-title">Paisaje / Ubicación</td>
      <td><strong>${u.escapeHtml(st.locationName)}</strong></td>
      <td class="meta-title">Comuna</td>
      <td>${u.escapeHtml(st.comunaName)}</td>
    </tr>
    <tr>
      <td class="meta-title">Coordenadas</td>
      <td>${st.coords.lat.toFixed(4)}, ${st.coords.lng.toFixed(4)}</td>
      <td class="meta-title">Fecha evaluada</td>
      <td>${u.escapeHtml(u.formatLongDate(dateStr, true))} (${u.escapeHtml(u.formatDDMMYYYY(dateStr))})</td>
    </tr>
  </table>

  <div class="section-title">Evaluación de la ventana operacional</div>
  <p class="verdict">Condición del día: ${u.escapeHtml(worst.status)}</p>

  <div class="section-title">Pronóstico horario</div>
  <table class="forecast-table">
    <thead>
      <tr>
        <th>Hora</th><th>Temperatura</th><th>Humedad relativa</th><th>Precipitación</th>
        <th>Viento / ráfagas</th><th>Dirección</th><th>Evaluación RDCFT</th>
      </tr>
    </thead>
    <tbody>${forecastRows()}</tbody>
  </table>

  <div class="section-title">Recomendación técnica operacional</div>
  <p class="note">
    La evaluación del comportamiento del fuego técnico está sujeta a las variaciones del microclima
    local y al tipo de combustible. Se recomienda validar con mediciones de estación meteorológica
    móvil en terreno antes y durante el encendido.
  </p>

  <div class="footer">
    Documento generado automáticamente por el Sistema de Situación Operacional RDCFT.<br>
    Pronóstico: Open-Meteo · Geocodificación: Nominatim / OpenStreetMap.
  </div>

  <script>window.onload = function () { window.print(); };<\/script>
</body>
</html>`;

    win.document.write(html);
    win.document.close();
  }

  RDCFT.pdf = { exportReport };
})(window.RDCFT = window.RDCFT || {});
