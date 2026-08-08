/* Fase 4 — registro de Service Worker (URUSPOT-PENDIENTES §7: "no existe
   Service Worker", PWA "solo de nombre"). Scope '/' cubre todo el sitio;
   basta con registrarlo desde una página para que controle las demás en
   visitas siguientes.

   Externalizado desde un <script> inline en index.html (auditoría CSP,
   2026-08-08): la CSP del documento es `script-src 'self'` sin
   'unsafe-inline'/nonce/hash, así que un bloque inline nunca llegaba a
   ejecutarse — el registro del Service Worker fallaba en silencio para
   todo el tráfico real. Un <script src="..."> del propio origen sí está
   permitido por 'self', sin tocar la CSP. */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function (err) {
      console.warn('URU SPOT: no se pudo registrar el service worker.', err);
    });
  });
}
