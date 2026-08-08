/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — geolocation.js

   FASE 3 (paso 2) del Plan Maestro de Modularización (2026-08-06).
   Extraído de app.js §21 (Geolocalización Avanzada): la llamada cruda
   a navigator.geolocation.getCurrentPosition() dentro de
   activarCercaDeMi().

   Qué NO se extrae acá, y por qué: activarCercaDeMi()/
   desactivarCercaDeMi()/inicializarGeolocation() se quedan en app.js.
   Son UI (crean y mutan un <button>, tocan uiState.cercaTuyoActivo /
   uiState.ubicacionUsuario, llaman render()) — el contrato del plan
   (§7, FASE 3: "GeolocationService.request(timeout) → Promise<{lat,
   lng}>") pide solo el acceso a la API del navegador envuelto en
   Promise, no el manejo del botón. Mismo criterio que ya separó
   fetchJSON (transporte, Fase 2) de cargarCatalogo() (orquestación,
   se queda en app.js).
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Pide la posición actual del usuario. Envuelve
 * navigator.geolocation.getCurrentPosition() (callback-based) en una
 * Promise — mismas opciones y mismo shape de resultado que usaba
 * activarCercaDeMi() antes de este paso.
 *
 * @param {number} timeoutMs
 * @param {number} maxAgeMs
 * @returns {Promise<{lat: number, lng: number}>}
 */
export function solicitarUbicacion(timeoutMs, maxAgeMs) {
  return new Promise(function (resolve, reject) {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation no disponible en este navegador'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude
        });
      },
      function (err) {
        reject(err);
      },
      {
        enableHighAccuracy: false,
        timeout: timeoutMs,
        maximumAge: maxAgeMs
      }
    );
  });
}

/**
 * Disponibilidad de la API en el navegador actual — mismo chequeo que
 * ya hacían inicializarGeolocation() y el guard de arriba, expuesto
 * para que app.js no repita `!navigator.geolocation` a mano.
 * @returns {boolean}
 */
export function geolocationDisponible() {
  return !!navigator.geolocation;
}

