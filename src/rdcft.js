/**
 * RDCFT · Motor de evaluación
 * Traduce una muestra meteorológica a un semáforo operacional según los umbrales
 * de config.js. No toca el DOM: sólo devuelve datos.
 */
(function (RDCFT) {
  'use strict';

  const STATUSES = {
    0: {
      status: 'FAVORABLE',
      badgeClass: 'bg-emerald-500/20 text-emerald-600 dark:text-industrial-verde border-emerald-500/30',
      cardClass: 'text-emerald-600 dark:text-emerald-500 bg-emerald-500/10',
      indicatorColor: 'bg-emerald-500',
      dotColor: '#10b981'
    },
    1: {
      status: 'CON RESTRICCIONES',
      badgeClass: 'bg-amber-500/20 text-amber-600 dark:text-industrial-amarillo border-amber-500/30',
      cardClass: 'text-amber-600 dark:text-amber-500 bg-amber-500/10',
      indicatorColor: 'bg-amber-500',
      dotColor: '#f59e0b'
    },
    2: {
      status: 'NO FAVORABLE',
      badgeClass: 'bg-rose-500/20 text-rose-600 dark:text-industrial-rojo border-rose-500/30',
      cardClass: 'text-rose-600 dark:text-rose-500 bg-rose-500/10',
      indicatorColor: 'bg-rose-500',
      dotColor: '#ef4444'
    }
  };

  const NO_DATA = {
    score: -1,
    status: 'SIN DATOS',
    badgeClass: 'bg-stone-500/20 text-stone-600 dark:text-stone-400 border-stone-500/30',
    cardClass: 'text-stone-600 dark:text-stone-400 bg-stone-500/10',
    indicatorColor: 'bg-stone-500',
    dotColor: '#78716c',
    reasons: [],
    summary: 'Sin pronóstico disponible para esta hora.'
  };

  function isMissing(v) {
    return v === null || v === undefined || Number.isNaN(v);
  }

  /**
   * @param {{temp:number, humidity:number, wind:number, gust:number, rain:number}} sample
   * @returns evaluación con estado, clases de estilo, razones y resumen.
   */
  function evaluate(sample) {
    if (!sample || [sample.temp, sample.humidity, sample.wind, sample.gust, sample.rain].some(isMissing)) {
      return NO_DATA;
    }

    const T = RDCFT.config.THRESHOLDS;
    const temp = sample.temp;
    const hum = sample.humidity;
    const wind = sample.wind;
    const gust = sample.gust;
    const rain = sample.rain;

    let score = 0;
    const reasons = [];
    const bump = (level, reason) => {
      score = Math.max(score, level);
      reasons.push(reason);
    };

    if (temp > T.temp.crit) {
      bump(2, `Temperatura elevada (${Math.round(temp)} °C > ${T.temp.crit} °C)`);
    } else if (temp > T.temp.warn) {
      bump(1, `Temperatura moderada (${Math.round(temp)} °C)`);
    }

    if (hum < T.humidity.crit) {
      bump(2, `Humedad relativa crítica (${Math.round(hum)} % < ${T.humidity.crit} %)`);
    } else if (hum < T.humidity.warn) {
      bump(1, `Humedad relativa moderada (${Math.round(hum)} %)`);
    }

    if (wind > T.wind.crit || gust > T.gust.crit) {
      bump(2, `Viento o ráfagas altas (${Math.round(wind)} km/h, ráfagas ${Math.round(gust)} km/h)`);
    } else if (wind > T.wind.warn || gust > T.gust.warn) {
      bump(1, `Viento moderado (${Math.round(wind)} km/h, ráfagas ${Math.round(gust)} km/h)`);
    }

    if (rain > T.rain.crit) {
      bump(2, `Precipitación alta (${rain.toFixed(1)} mm): combustible fuera de prescripción`);
    }

    const base = STATUSES[score];
    let summary;
    if (score === 0) {
      summary = `Viento ${Math.round(wind)} km/h (ráfagas ${Math.round(gust)} km/h), ${Math.round(temp)} °C y ${Math.round(hum)} % de humedad. Condición dentro de prescripción para quema controlada.`;
    } else if (score === 1) {
      summary = `Condiciones límite: ${reasons.join('; ')}. Ejecutar con monitoreo continuo del comportamiento del fuego.`;
    } else {
      summary = `NO RECOMENDADO: ${reasons.join('; ')}. Alto riesgo de escape o propagación no deseada.`;
    }

    return Object.assign({ score: score, reasons: reasons, summary: summary }, base);
  }

  /**
   * Peor evaluación de un conjunto. Es el criterio conservador correcto para
   * resumir un día completo en un solo semáforo: basta una hora fuera de
   * prescripción para que la ventana no sea limpia.
   */
  function worst(evaluations) {
    const valid = evaluations.filter(e => e && e.score >= 0);
    if (!valid.length) return NO_DATA;
    return valid.reduce((acc, e) => (e.score > acc.score ? e : acc), valid[0]);
  }

  RDCFT.rdcft = { evaluate, worst, NO_DATA };
})(window.RDCFT = window.RDCFT || {});
