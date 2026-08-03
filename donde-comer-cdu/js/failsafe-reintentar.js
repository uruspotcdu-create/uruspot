/**
 * RESILIENCE SCRIPT: detección de falla silenciosa en carga de datos.
 *
 * Si sigue habiendo un placeholder ".vacio" (y no ".vacio.error", que
 * ya sería un error ya manejado) pasados 12s desde que se ejecutó
 * este bloque, algo falló sin avisar: motor-render.js caído, un
 * fetch colgado, o una excepción silenciosa en algún módulo previo.
 * Se reemplaza el contenido de #panelDescubrimiento por un aviso
 * accesible (role="alert") con botón de recarga, sin tocar el resto
 * del flujo normal ni asumir nada sobre qué falló exactamente.
 *
 * Externalizado desde un <script> inline: la CSP (script-src 'self')
 * bloqueaba tanto este bloque completo como, dentro de él, el
 * onclick="..." del botón "Reintentar" — un atributo on* es
 * equivalente a inline para CSP. Al vivir en js/ con <script src>,
 * y usar addEventListener en vez de onclick, todo el flujo queda
 * permitido por la CSP actual sin tener que tocarla.
 */
(function () {
  // Fase 4 (Motion Direction Bible v2.0, K.11/B.2.3): antes era un
  // literal local independiente de AmbienteConfig.UMBRALES.timeoutCargaMs
  // (que a su vez era 8000 y sin consumidores reales) — dos timeouts de
  // "carga" que podían desincronizarse. Ahora hay un solo número: si
  // AmbienteConfig ya cargó (carga antes que este script, ver orden de
  // <script defer> en index.html), se lee de ahí; si no, cae al mismo
  // 12000 que ya funcionaba en producción (fail-open, nunca deja el
  // failsafe sin timeout).
  var TIMEOUT_MS = (window.AmbienteConfig && window.AmbienteConfig.UMBRALES &&
    window.AmbienteConfig.UMBRALES.timeoutCargaMs) || 12000;

  var failsafeTimer = window.setTimeout(function () {
    var placeholder = document.querySelector('[class*="vacio"]:not(.error)');
    if (!placeholder) return; // ya se renderizó algo real, todo bien

    var container = document.getElementById('panelDescubrimiento');
    if (!container) return;

    container.innerHTML = '';
    var alerta = document.createElement('div');
    alerta.className = 'vacio error';
    alerta.setAttribute('role', 'alert');
    alerta.innerHTML =
      '<p>Esto está tardando más de lo esperado. Puede ser tu conexión o un problema nuestro.</p>' +
      '<button type="button" class="btn btn--small" data-accion="reintentar-failsafe">Reintentar</button>';
    container.appendChild(alerta);

    var btnReintentar = alerta.querySelector('[data-accion="reintentar-failsafe"]');
    if (btnReintentar) {
      btnReintentar.addEventListener('click', function () {
        window.location.reload();
      });
    }
  }, TIMEOUT_MS);

  // Limpia el timer si la página se descarga antes de los 12s, para
  // no dejar un setTimeout colgado innecesariamente.
  //
  // PERF (auditoría performance, 2026-08-03): antes escuchaba 'unload'.
  // Un listener de 'unload' es la causa #1, documentada por Chrome, de
  // que una página quede excluida del back/forward cache (bfcache) —
  // confirmado en este caso con el propio Lighthouse del sitio
  // ("Page prevented back/forward cache restoration"). El motivo real
  // es que el navegador no puede saber de antemano si ese código en
  // 'unload' depende de ejecutarse siempre al abandonar la página, así
  // que directamente no ofrece bfcache si hay uno registrado, aunque el
  // handler en sí sea inofensivo (como acá). 'pagehide' cubre el mismo
  // caso (limpiar un timer que ya no importa) sin ese costo: dispara en
  // ambos escenarios (cierre real o posible bfcache), pero no bloquea
  // el bfcache. No hace falta mirar event.persisted acá — sea que la
  // página se restaure después o no, cancelar este timeout puntual
  // nunca causa un problema (peor caso: se vuelve a programar solo si
  // la app se reinicializa de cero, que es justo lo que pasa si NO se
  // restaura desde bfcache).
  window.addEventListener('pagehide', function () { clearTimeout(failsafeTimer); });
})();
