/*
 * URU SPOT — Service Worker
 * -------------------------------------------------------------------
 * Cierra el hallazgo de URUSPOT-PENDIENTES-VERIFICADO §7/§9: "no existe
 * Service Worker" / "PWA solo de nombre".
 *
 * Estrategia (deliberadamente conservadora, nada de cachear a ciegas):
 *
 * 1) Navegación (HTML de cualquier página del sitio):
 *    network-first → si hay red, siempre se sirve la versión fresca (y
 *    se actualiza el cache); si no hay red, se sirve la última versión
 *    cacheada de ESA MISMA URL, y si tampoco existe, /offline.html.
 *
 * 2) Datos de negocio (lugares-core.json, lugares-detalles.json,
 *    lugares-estado.json, lugares-mapa.json):
 *    network-first, SIN fallback silencioso a un cache viejo cuando hay
 *    red. `lugares-estado.json` en particular refleja abierto/cerrado
 *    en tiempo real — nunca debe preferirse el cache si la red responde.
 *    El cache solo se usa como red de contención cuando el dispositivo
 *    está realmente offline.
 *
 * 3) Estáticos versionables (css, js, webp/png/jpg/svg, woff):
 *    cache-first — no cambian de contenido sin cambiar de nombre de
 *    archivo en este repo, así que servirlos desde cache es seguro y
 *    es lo que más beneficia performance/offline.
 *
 * 4) Todo lo que no sea del mismo origen (ej. unpkg.com/leaflet) se
 *    ignora por completo: no se intercepta ni se cachea CDN de terceros.
 */

'use strict';

var VERSION = 'v2';
var CACHE_PAGINAS = 'uruspot-paginas-' + VERSION;
var CACHE_DATOS = 'uruspot-datos-' + VERSION;
var CACHE_ESTATICOS = 'uruspot-estaticos-' + VERSION;
var CACHES_VIGENTES = [CACHE_PAGINAS, CACHE_DATOS, CACHE_ESTATICOS];

var OFFLINE_URL = '/offline.html';

// Precache mínimo: solo lo indispensable para que /offline.html pueda
// mostrarse (incluyendo su propio logo). Deliberadamente NO se precachea
// una lista larga de JS/CSS del app shell: con ~30 archivos ambiente-*.js
// por página, una lista estática se desactualiza sola y un solo 404 en
// el precache tira abajo la instalación entera. El cache-first de la
// regla 3 los va poblando solos en cuanto el usuario navega.
var PRECACHE_URLS = [
  '/',
  OFFLINE_URL,
  '/manifest.json',
  '/img/logof.webp'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_PAGINAS)
      .then(function (cache) { return cache.addAll(PRECACHE_URLS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (nombres) {
        return Promise.all(
          nombres
            .filter(function (nombre) {
              return nombre.indexOf('uruspot-') === 0 && CACHES_VIGENTES.indexOf(nombre) === -1;
            })
            .map(function (nombre) { return caches.delete(nombre); })
        );
      })
      .then(function () { return self.clients.claim(); })
  );
});

function esDatoDeNegocio(url) {
  return /\/lugares-(core|detalles|estado|mapa)\.json$/.test(url.pathname);
}

function esEstaticoVersionable(url) {
  return /\.(css|js|webp|png|jpe?g|svg|gif|woff2?|ico)$/.test(url.pathname);
}

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;

  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // no tocar CDNs externos (leaflet, etc.)

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstPagina(request));
    return;
  }
  if (esDatoDeNegocio(url)) {
    event.respondWith(networkFirstDato(request));
    return;
  }
  if (esEstaticoVersionable(url)) {
    event.respondWith(cacheFirstEstatico(request));
    return;
  }
  // Cualquier otro GET del propio origen (ej. JSON de configuración
  // suelto, fuentes sin extensión reconocida): red directa, sin cache.
});

function networkFirstPagina(request) {
  return caches.open(CACHE_PAGINAS).then(function (cache) {
    return fetch(request)
      .then(function (respuestaRed) {
        cache.put(request, respuestaRed.clone());
        return respuestaRed;
      })
      .catch(function () {
        return cache.match(request).then(function (enCache) {
          return enCache || cache.match(OFFLINE_URL);
        });
      });
  });
}

function networkFirstDato(request) {
  return caches.open(CACHE_DATOS).then(function (cache) {
    return fetch(request)
      .then(function (respuestaRed) {
        cache.put(request, respuestaRed.clone());
        return respuestaRed;
      })
      .catch(function () {
        return cache.match(request).then(function (enCache) {
          if (enCache) return enCache;
          throw new Error('Sin red y sin cache para ' + request.url);
        });
      });
  });
}

function cacheFirstEstatico(request) {
  return caches.open(CACHE_ESTATICOS).then(function (cache) {
    return cache.match(request).then(function (enCache) {
      if (enCache) return enCache;
      return fetch(request).then(function (respuestaRed) {
        cache.put(request, respuestaRed.clone());
        return respuestaRed;
      });
    });
  });
}
