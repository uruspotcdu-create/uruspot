/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — DIAGNÓSTICO TEMPORAL DE RENDIMIENTO v3 — aislar sustratoVisual
   (borrar tras usar)
   ---------------------------------------------------------------------
   v2 ya confirmó: Ambient Engine completo apagado (`motor` off, que
   apaga todo de una) sube el FPS de ~22 a ~56. Pero `motor` apaga a
   la vez el núcleo (Movimiento/Estados/Respiración) Y las 10 familias
   visuales (sustratoVisual: planos, retícula, topografía, corrientes,
   coordenadas, brújula, partículas de deriva, halos, capa de fondo,
   luz) — no dice cuál de los dos pesa.

   Esta v3 hace UN solo test (no dos etapas): mide 10s con
     motor=ON, sustratoVisual=OFF, clima=OFF, horarioTinte=OFF
   (si la URL no tiene ya esa config, se auto-redirige una vez, igual
   que v1/v2). Compara contra los dos números ya conocidos de la
   sesión anterior (22.6fps todo ON, 55.8fps todo OFF) y concluye
   dónde está el peso real.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var VENTANA_MS = 10000;
  var FPS_BASELINE_TODO_ON = 22.6;
  var FPS_BASELINE_TODO_OFF = 55.8;

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
            longTasks.push({ duracion: Math.round(entry.duration) });
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

    setTimeout(function () {
      var duracionReal = performance.now() - inicio;
      var fpsPromedio = frames / (duracionReal / 1000);
      var totalLongTaskMs = longTasks.reduce(function (acc, t) { return acc + t.duracion; }, 0);

      callback({
        fpsPromedio: fpsPromedio,
        framesCapturados: frames,
        gapMaxEntreFrames_ms: Math.round(maxFrameGap),
        longTasksCantidad: longTasks.length,
        longTasksTotalMs: Math.round(totalLongTaskMs),
        ambienteFlagsEstado: window.AmbienteFlags ? window.AmbienteFlags.estadoActual() : null
      });
    }, VENTANA_MS + 50);
  }

  function construirUrlTest() {
    var url = new URL(location.href);
    var params = new URLSearchParams(url.search);
    params.set('ambiente_off', 'sustratoVisual,clima,horarioTinte'); // motor queda ON a propósito
    params.set('perfdiag', '3');
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
    } catch (e) { /* no crítico */ }
  }

  function mostrarResultado(resultado) {
    var fps = resultado.fpsPromedio;
    var cercaDeOn = Math.abs(fps - FPS_BASELINE_TODO_ON) < 8;
    var cercaDeOff = Math.abs(fps - FPS_BASELINE_TODO_OFF) < 8;

    var conclusion;
    if (cercaDeOff) {
      conclusion = '✅ Con sustratoVisual apagado (y el núcleo del motor prendido) el FPS vuelve casi a los ' + FPS_BASELINE_TODO_OFF.toFixed(1) + 'fps de "todo apagado". EL PESO ESTÁ EN LOS 10 MÓDULOS VISUALES (partículas, halos, corrientes, brújula, luz, etc.), no en el núcleo.';
    } else if (cercaDeOn) {
      conclusion = '⚠️ Con sustratoVisual apagado el FPS sigue cerca de los ' + FPS_BASELINE_TODO_ON.toFixed(1) + 'fps de "todo prendido". EL PESO ESTÁ EN EL NÚCLEO (Movimiento/Estados/Respiración), no en los módulos visuales — apagar solo lo visual no alcanza.';
    } else {
      conclusion = 'ℹ️ Quedó en un punto intermedio (' + fps.toFixed(1) + 'fps, entre ' + FPS_BASELINE_TODO_ON.toFixed(1) + ' y ' + FPS_BASELINE_TODO_OFF.toFixed(1) + '). El peso está repartido entre el núcleo y los módulos visuales — ninguno de los dos por sí solo explica todo.';
    }

    var texto = JSON.stringify({
      test: 'motor=ON, sustratoVisual=OFF, clima=OFF, horarioTinte=OFF',
      resultado: resultado,
      referencia_todo_ON: FPS_BASELINE_TODO_ON,
      referencia_todo_OFF: FPS_BASELINE_TODO_OFF,
      conclusion: conclusion
    }, null, 2);

    var caja = document.createElement('div');
    caja.style.cssText = 'position:fixed;bottom:12px;right:12px;left:12px;max-width:560px;' +
      'margin-left:auto;z-index:2147483647;background:#0b0b0f;color:#e8e8ec;' +
      'font:12px/1.4 ui-monospace,monospace;padding:14px;border-radius:10px;' +
      'box-shadow:0 8px 30px rgba(0,0,0,.5);max-height:70vh;overflow:auto;';

    var titulo = document.createElement('div');
    titulo.textContent = '🔎 Diagnóstico v3 — núcleo vs módulos visuales';
    titulo.style.cssText = 'font-weight:600;margin-bottom:8px;font-family:sans-serif;font-size:13px;';

    var resumen = document.createElement('div');
    resumen.style.cssText = 'font-family:sans-serif;margin-bottom:10px;line-height:1.5;';
    resumen.innerHTML =
      '<b>FPS con solo núcleo (motor) prendido:</b> ' + fps.toFixed(1) + '<br>' +
      '<b>Referencia — todo prendido:</b> ' + FPS_BASELINE_TODO_ON.toFixed(1) + '<br>' +
      '<b>Referencia — todo apagado:</b> ' + FPS_BASELINE_TODO_OFF.toFixed(1) + '<br><br>' + conclusion;

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
    console.log('[diagnostico-rendimiento v3]', resultado, conclusion);

    limpiarUrl();
  }

  function iniciar() {
    var esTest = location.search.indexOf('perfdiag=3') !== -1;

    if (!esTest) {
      location.replace(construirUrlTest());
      return;
    }

    medir(function (resultado) {
      if (document.body) {
        mostrarResultado(resultado);
      } else {
        document.addEventListener('DOMContentLoaded', function () { mostrarResultado(resultado); });
      }
    });
  }

  iniciar();
})();
