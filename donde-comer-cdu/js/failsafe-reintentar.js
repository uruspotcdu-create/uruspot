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
  var TIMEOUT_MS = 12000;

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
  window.addEventListener('unload', function () { clearTimeout(failsafeTimer); });
})();
