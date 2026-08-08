/*
 * donde-comer-cdu/js/actualizacion-disponible.js
 * ---------------------------------------------------------------------
 * Contraparte cliente de la revalidación en segundo plano de sw.js
 * (estrategia stale-while-revalidate para JS/CSS, perf 2026-07-31).
 *
 * sw.js sirve el JS/CSS cacheado al instante y revisa en segundo plano
 * si cambió. Si cambió de verdad, postea un mensaje acá. Este script
 * solo se encarga de avisar — nunca recarga la pestaña por su cuenta:
 * quien esté navegando puede estar a mitad de una búsqueda o llenando
 * un formulario, y forzar un reload ahí sería peor que el problema que
 * resuelve.
 *
 * Sin dependencias de app.js — puede fallar en silencio (try/catch)
 * sin afectar el resto del sitio.
 */

'use strict';

(function () {
  if (!('serviceWorker' in navigator)) return;

  var yaAvisado = false; // no duplicar el banner si cambian varios archivos

  function mostrarBanner() {
    if (yaAvisado) return;
    yaAvisado = true;

    var banner = document.getElementById('actualizacionBanner');
    if (!banner) return;

    var btnActualizar = document.getElementById('actualizacionBtn');
    var btnCerrar = document.getElementById('actualizacionCerrar');

    if (btnActualizar) {
      btnActualizar.addEventListener('click', function () {
        location.reload();
      });
    }
    if (btnCerrar) {
      btnCerrar.addEventListener('click', function () {
        banner.hidden = true;
        // Se cierra para esta sesión de pestaña. No hace falta volver
        // a avisar: la próxima vez que la persona navegue o recargue
        // por cualquier motivo, ya va a recibir el contenido nuevo
        // (quedó guardado en cache desde la revalidación).
      });
    }

    banner.hidden = false;
  }

  try {
    navigator.serviceWorker.addEventListener('message', function (evento) {
      if (evento && evento.data && evento.data.tipo === 'uru-spot-actualizacion-disponible') {
        mostrarBanner();
      }
    });
  } catch (e) { /* no rompe el resto del sitio si esto falla */ }
})();

