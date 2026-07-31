/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — DIAGNÓSTICO TEMPORAL DE RENDIMIENTO v2 — A/B automático
   (borrar tras usar — este archivo y la línea que lo carga en index.html)
   ---------------------------------------------------------------------
   v1 medía una sola vez. Esta versión hace el experimento completo
   solo, sin que nadie tenga que escribir una URL a mano:

     Etapa 1 (esta carga, tal cual): mide 10s con TODO activo (línea
     base, lo que el usuario real experimenta hoy).
     → guarda el resultado en sessionStorage y se recarga sola,
       agregando ?ambiente_off=motor,sustratoVisual,clima,horarioTinte
       a la URL (apaga el Ambient Engine completo vía el propio
       AmbienteFlags que ya existe en el repo — cero código nuevo de
       apagado, reusa el mecanismo real).

     Etapa 2 (recarga automática): mide otros 10s con el Ambient
     Engine apagado → compara ambas mediciones y muestra un cuadro
     único con las dos, lado a lado, más una conclusión automática.

   Se detiene solo (sessionStorage) — si se refresca la página después
   de ver el resultado, no vuelve a repetir el ciclo.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var VENTANA_MS = 10000;
  var CLAVE_SESSION = 'perfDiagEtapa1';

  function medir(callback) {
    var inicio = performance.now();
    var longTasks = [];
    var observerOk = false;
    try {
      if (typeof PerformanceObserver !== 'undefined' &&
          PerformanceObserver.supportedEntryTypes &&
          PerformanceObserver.supportedEntryTypes.indexOf('longtask') !== -1) {
        var po = new PerformanceObserver(function (list) {
          list.getEntries().forEach(function (entry) {
            longTasks.push({ duracion: Math.round(entry.duration), inicio: Math.round(entry.startTime) });
          });
        });
        po.observe({ entryTypes: ['longtask'] });
        observerOk = true;
      }
    } catch (e) { /* no soportado */ }

    var frames = 0;
    var maxFrameGap = 0;
    var ultimoFrame = null;

    function medirFrame(t) {
      frames++;
      if (ultimoFrame !== null) {
        var gap = t - ultimoFrame;
        if (gap > maxFrameGap) maxFrameGap = gap;
      }
      ultimoFrame = t;
      if (performance.now() - inicio < VENTANA_MS) {
        requestAnimationFrame(medirFrame);
      }
    }
    requestAnimationFrame(medirFrame);

    var memInicial = (performance.memory && performance.memory.usedJSHeapSize) || null;

    setTimeout(function () {
      var duracionReal = performance.now() - inicio;
      var fpsPromedio = frames / (duracionReal / 1000);
      var memFinal = (performance.memory && performance.memory.usedJSHeapSize) || null;
      var totalLongTaskMs = longTasks.reduce(function (acc, t) { return acc + t.duracion; }, 0);
      var ambRend = window.AmbienteRendimiento;
      var ambFlags = window.AmbienteFlags;

      callback({
        fpsPromedio: fpsPromedio,
        framesCapturados: frames,
        gapMaxEntreFrames_ms: Math.round(maxFrameGap),
        longTasksSoportado: observerOk,
        longTasksCantidad: longTasks.length,
        longTasksTotalMs: Math.round(totalLongTaskMs),
        longTasksMasLarga_ms: longTasks.reduce(function (m, t) { return t.duracion > m ? t.duracion : m; }, 0),
        memInicial_MB: memInicial ? (memInicial / 1048576).toFixed(1) : null,
        memFinal_MB: memFinal ? (memFinal / 1048576).toFixed(1) : null,
        nivelFidelidad: ambRend ? ambRend.nivelFidelidad : null,
        ambienteFlagsEstado: ambFlags ? ambFlags.estadoActual() : null
      });
    }, VENTANA_MS + 50);
  }

  function construirUrlEtapa2() {
    var url = new URL(location.href);
    var params = new URLSearchParams(url.search);
    params.set('ambiente_off', 'motor,sustratoVisual,clima,horarioTinte');
    params.set('perfdiag', '2');
    url.search = params.toString();
    return url.toString();
  }

  function limpiarUrl() {
    try {
      var url = new URL(location.href);
      var params = new URLSearchParams(url.search);
      params.delete('ambiente_off');
      params.delete('perfdiag');
      url.search = params.toString();
      history.replaceState(null, '', url.toString());
    } catch (e) { /* no crítico si falla */ }
  }

  function mostrarComparacion(etapa1, etapa2) {
    var deltaFps = (etapa2.fpsPromedio - etapa1.fpsPromedio).toFixed(1);
    var conclusion;
    if (etapa2.fpsPromedio - etapa1.fpsPromedio >= 10) {
      conclusion = '✅ CON el Ambient Engine apagado el FPS sube claramente (+' + deltaFps + 'fps). El Ambient Engine es una causa real y medible del problema.';
    } else if (Math.abs(etapa2.fpsPromedio - etapa1.fpsPromedio) < 5) {
      conclusion = '⚠️ Casi no cambia (' + deltaFps + 'fps de diferencia). El Ambient Engine NO es el responsable principal — el problema está en otro lado (motor de mapa, render de lista, u otra cosa).';
    } else {
      conclusion = 'ℹ️ Cambio moderado (' + deltaFps + 'fps). Puede ser una causa parcial, no la única.';
    }

    var texto = JSON.stringify({ etapa1_ambientON: etapa1, etapa2_ambientOFF: etapa2, conclusion: conclusion }, null, 2);

    var caja = document.createElement('div');
    caja.style.cssText = 'position:fixed;bottom:12px;right:12px;left:12px;max-width:560px;' +
      'margin-left:auto;z-index:2147483647;background:#0b0b0f;color:#e8e8ec;' +
      'font:12px/1.4 ui-monospace,monospace;padding:14px;border-radius:10px;' +
      'box-shadow:0 8px 30px rgba(0,0,0,.5);max-height:70vh;overflow:auto;';

    var titulo = document.createElement('div');
    titulo.textContent = '🔎 Diagnóstico A/B — Ambient Engine ON vs OFF';
    titulo.style.cssText = 'font-weight:600;margin-bottom:8px;font-family:sans-serif;font-size:13px;';

    var resumen = document.createElement('div');
    resumen.style.cssText = 'font-family:sans-serif;margin-bottom:10px;line-height:1.5;';
    resumen.innerHTML =
      '<b>FPS con Ambient Engine ON:</b> ' + etapa1.fpsPromedio.toFixed(1) + '<br>' +
      '<b>FPS con Ambient Engine OFF:</b> ' + etapa2.fpsPromedio.toFixed(1) + '<br>' +
      '<b>Diferencia:</b> ' + deltaFps + ' fps<br><br>' + conclusion;

    var pre = document.createElement('pre');
    pre.textContent = texto;
    pre.style.cssText = 'white-space:pre-wrap;word-break:break-word;margin:0 0 10px;font-size:11px;';

    var boton = document.createElement('button');
    boton.textContent = 'Copiar reporte completo';
    boton.style.cssText = 'background:#e8e8ec;color:#0b0b0f;border:none;border-radius:6px;' +
      'padding:8px 14px;font-family:sans-serif;font-size:12px;font-weight:600;cursor:pointer;';
    boton.onclick = function () {
      navigator.clipboard.writeText(texto).then(function () {
        boton.textContent = '✅ Copiado — pegalo en el chat';
      }).catch(function () {
        boton.textContent = 'No se pudo copiar — seleccioná el texto manualmente';
      });
    };

    caja.appendChild(titulo);
    caja.appendChild(resumen);
    caja.appendChild(pre);
    caja.appendChild(boton);
    document.body.appendChild(caja);
    console.log('[diagnostico-rendimiento A/B]', { etapa1: etapa1, etapa2: etapa2, conclusion: conclusion });

    limpiarUrl();
    sessionStorage.removeItem(CLAVE_SESSION);
  }

  function iniciar() {
    var esEtapa2 = location.search.indexOf('perfdiag=2') !== -1;
    var etapa1Guardada = sessionStorage.getItem(CLAVE_SESSION);

    if (esEtapa2 && etapa1Guardada) {
      // Etapa 2: ya estamos en la recarga con ambiente_off en la URL.
      medir(function (resultado2) {
        var etapa1 = JSON.parse(etapa1Guardada);
        if (document.body) {
          mostrarComparacion(etapa1, resultado2);
        } else {
          document.addEventListener('DOMContentLoaded', function () { mostrarComparacion(etapa1, resultado2); });
        }
      });
      return;
    }

    // Etapa 1: medición normal, línea base.
    medir(function (resultado1) {
      sessionStorage.setItem(CLAVE_SESSION, JSON.stringify(resultado1));
      location.replace(construirUrlEtapa2());
    });
  }

  iniciar();
})();
