/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — DIAGNÓSTICO TEMPORAL DE RENDIMIENTO (borrar tras usar)
   ---------------------------------------------------------------------
   Objetivo: medir qué está pasando en el hilo principal DURANTE LOS
   PRIMEROS 10s de vida de la página, sin que nadie tenga que abrir
   DevTools ni grabar nada. Se auto-ejecuta al cargar, mide, y muestra
   un cuadro en pantalla con el resultado + botón "Copiar".

   Qué mide:
   - Long Tasks (PerformanceObserver 'longtask'): cualquier bloque de
     JS/estilos/layout que ocupe el hilo principal >50ms sin soltarlo.
     Si hay muchas, aunque cada una dure poco, la app se siente
     "pastosa" incluso sin que el usuario toque nada — es la métrica
     más directa para "lento en reposo".
   - FPS real vía requestAnimationFrame durante la misma ventana.
   - Memoria de heap JS (solo Chrome/Edge — performance.memory) al
     inicio y al final de la ventana, para detectar crecimiento
     sostenido típico de un leak.
   - Nivel de fidelidad y capacidad de dispositivo que el propio
     Ambient Engine ya calcula (AmbienteRendimiento), para cruzar
     "¿el sistema ya se dio cuenta de que está lento?".
   - hardwareConcurrency / deviceMemory / connection.effectiveType,
     para saber en qué clase de dispositivo se tomó la muestra.

   IMPORTANTE: este archivo es de un solo uso, para diagnóstico. No
   forma parte del Ambient Engine ni del motor. Cargarlo temporalmente
   como PRIMER <script> del <head> (antes que motor.bundle.js), probar,
   sacar la data, y BORRARLO del index.html y del repo después — no
   debe quedar en producción.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var VENTANA_MS = 10000;
  var inicio = performance.now();

  // ── Long Tasks ──────────────────────────────────────────────────
  var longTasks = [];
  var observerOk = false;
  try {
    if (typeof PerformanceObserver !== 'undefined' &&
        PerformanceObserver.supportedEntryTypes &&
        PerformanceObserver.supportedEntryTypes.indexOf('longtask') !== -1) {
      var po = new PerformanceObserver(function (list) {
        list.getEntries().forEach(function (entry) {
          longTasks.push({
            duracion: Math.round(entry.duration),
            inicio: Math.round(entry.startTime),
            nombre: entry.name || 'desconocido'
          });
        });
      });
      po.observe({ entryTypes: ['longtask'] });
      observerOk = true;
    }
  } catch (e) { /* API no soportada en este navegador — seguimos sin longtasks */ }

  // ── FPS real ────────────────────────────────────────────────────
  var frames = 0;
  var minFrameGap = Infinity;
  var maxFrameGap = 0;
  var ultimoFrame = null;

  function medirFrame(t) {
    frames++;
    if (ultimoFrame !== null) {
      var gap = t - ultimoFrame;
      if (gap < minFrameGap) minFrameGap = gap;
      if (gap > maxFrameGap) maxFrameGap = gap;
    }
    ultimoFrame = t;
    if (performance.now() - inicio < VENTANA_MS) {
      requestAnimationFrame(medirFrame);
    }
  }
  requestAnimationFrame(medirFrame);

  // ── Memoria (solo Chrome/Edge) ──────────────────────────────────
  var memInicial = (performance.memory && performance.memory.usedJSHeapSize) || null;

  function bytesAMb(b) { return b ? (b / 1048576).toFixed(1) + ' MB' : 'no disponible (Firefox/Safari no exponen esto)'; }

  // ── Reporte final ───────────────────────────────────────────────
  function generarReporte() {
    var duracionReal = performance.now() - inicio;
    var fpsPromedio = frames / (duracionReal / 1000);
    var memFinal = (performance.memory && performance.memory.usedJSHeapSize) || null;

    var totalLongTaskMs = longTasks.reduce(function (acc, t) { return acc + t.duracion; }, 0);
    var tareaMasLarga = longTasks.reduce(function (max, t) { return t.duracion > max ? t.duracion : max; }, 0);

    var ambRend = window.AmbienteRendimiento;
    var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

    var reporte = {
      timestamp: new Date().toISOString(),
      url: location.href,
      dispositivo: {
        userAgent: navigator.userAgent,
        pantalla: screen.width + 'x' + screen.height + ' @' + (window.devicePixelRatio || 1) + 'x',
        nucleos: navigator.hardwareConcurrency || 'desconocido',
        memoriaRAM_GB: navigator.deviceMemory || 'desconocido (solo Chrome/Android expone esto)',
        conexion: conn ? conn.effectiveType : 'desconocido'
      },
      ambientEngine: ambRend ? {
        nivelFidelidad: ambRend.nivelFidelidad,
        capacidadDispositivoEstimada: ambRend.capacidadDispositivo
      } : 'AmbienteRendimiento no disponible',
      fps: {
        promedio: fpsPromedio.toFixed(1),
        framesCapturados: frames,
        gapMaxEntreFrames_ms: maxFrameGap === 0 ? 0 : Math.round(maxFrameGap),
        nota: maxFrameGap > 100 ? 'HUBO AL MENOS UN FRAME PERDIDO GRANDE (>100ms)' : 'sin caídas grandes de frame'
      },
      longTasks: {
        soportado: observerOk,
        cantidad: longTasks.length,
        totalMs: Math.round(totalLongTaskMs),
        masLarga_ms: Math.round(tareaMasLarga),
        detalle: longTasks.slice(0, 10) // primeras 10, para no saturar
      },
      memoriaJS: {
        inicial: bytesAMb(memInicial),
        final: bytesAMb(memFinal),
        crecimiento: (memInicial && memFinal) ? bytesAMb(memFinal - memInicial) : 'no disponible'
      },
      ventanaMedida_ms: Math.round(duracionReal)
    };

    return reporte;
  }

  function mostrarOverlay(reporte) {
    var texto = JSON.stringify(reporte, null, 2);

    var caja = document.createElement('div');
    caja.style.cssText = 'position:fixed;bottom:12px;right:12px;left:12px;max-width:520px;' +
      'margin-left:auto;z-index:2147483647;background:#0b0b0f;color:#e8e8ec;' +
      'font:12px/1.4 ui-monospace,monospace;padding:14px;border-radius:10px;' +
      'box-shadow:0 8px 30px rgba(0,0,0,.5);max-height:60vh;overflow:auto;';

    var titulo = document.createElement('div');
    titulo.textContent = '🔎 Diagnóstico de rendimiento (10s en reposo)';
    titulo.style.cssText = 'font-weight:600;margin-bottom:8px;font-family:sans-serif;font-size:13px;';

    var pre = document.createElement('pre');
    pre.textContent = texto;
    pre.style.cssText = 'white-space:pre-wrap;word-break:break-word;margin:0 0 10px;';

    var boton = document.createElement('button');
    boton.textContent = 'Copiar reporte';
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
    caja.appendChild(pre);
    caja.appendChild(boton);
    document.body.appendChild(caja);

    // También lo dejamos en consola por si alguien SÍ tiene DevTools a mano
    console.log('[diagnostico-rendimiento]', reporte);
  }

  function finalizar() {
    var reporte = generarReporte();
    if (document.body) {
      mostrarOverlay(reporte);
    } else {
      document.addEventListener('DOMContentLoaded', function () { mostrarOverlay(reporte); });
    }
  }

  setTimeout(finalizar, VENTANA_MS);
})();
