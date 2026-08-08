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
 *    stale-while-revalidate (perf, 2026-07-31) — se sirve la versión
 *    cacheada al instante (misma latencia percibida que cache-first)
 *    y en paralelo se revalida contra la red; si el contenido cambió
 *    de verdad, se avisa a las pestañas abiertas (ver
 *    donde-comer-cdu/js/actualizacion-disponible.js). Antes era
 *    cache-first puro, que asumía que un archivo nunca cambia de
 *    contenido sin cambiar de nombre — supuesto falso en este repo,
 *    donde js/app.js y compañía se editan en el mismo nombre commit a
 *    commit, así que alguien que ya instaló la app nunca recibía un
 *    fix posterior.
 *
 * 4) Todo lo que no sea del mismo origen (ej. unpkg.com/leaflet) se
 *    ignora por completo: no se intercepta ni se cachea CDN de terceros.
 */

'use strict';

var VERSION = 'v5';
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
  '/img/logof.webp',
  // La sección que se promociona como "instalable" — que quede
  // disponible offline desde la instalación, no recién después de
  // la primera visita real.
  '/donde-comer-cdu/',
  '/donde-comer-cdu/manifest.json'
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
  // Tiles del mapa (datos/lugares-mapa-tiles/<tileKey>.json, ver
  // js/datos-virtualizador.js): antes no matcheaban esta regla ni la
  // de esEstaticoVersionable (no es ninguna de esas extensiones), así
  // que salían siempre directo a red sin cache ninguna — ni siquiera
  // como red de contención si el dispositivo está offline. Mismo
  // criterio network-first que el resto de los datos de negocio: son
  // muchos archivos chicos que cambian con cada `split_dataset.py`,
  // no versionables por nombre como css/js.
  return /\/lugares-(core|detalles|estado|mapa)\.json$/.test(url.pathname) ||
    /\/lugares-mapa-tiles\/[^/]+\.json$/.test(url.pathname);
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
    event.respondWith(staleWhileRevalidateEstatico(request, event));
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

/*
 * ESTÁTICOS (perf, 2026-07-31 — reemplaza al cache-first anterior):
 * el cache-first puro asumía que un archivo nunca cambia de contenido
 * sin cambiar de nombre — pero en este repo js/app.js, css/*.css, etc.
 * SÍ se editan en el mismo nombre de archivo commit a commit. Con
 * cache-first a secas, alguien que instaló la app un día nunca vuelve
 * a recibir un fix posterior: el Service Worker le sigue sirviendo la
 * versión vieja de esos archivos para siempre.
 *
 * stale-while-revalidate resuelve eso sin perder la velocidad de
 * cache-first: la respuesta cacheada se sirve al instante (misma
 * latencia percibida de siempre), y en paralelo se pide la red y se
 * actualiza el cache. Si el contenido efectivamente cambió, se avisa
 * a las pestañas abiertas — la decisión de cuándo recargar queda del
 * lado de la persona (ver actualizacion-disponible.js), nunca se
 * recarga sola una pestaña donde alguien puede estar a mitad de una
 * búsqueda o llenando algo.
 */
function staleWhileRevalidateEstatico(request, event) {
  return caches.open(CACHE_ESTATICOS).then(function (cache) {
    return cache.match(request).then(function (enCache) {
      if (enCache) {
        // No bloquea la respuesta: se sirve el cache ya mismo. La
        // revalidación sigue en segundo plano vía waitUntil, para que
        // el Service Worker no se suspenda a mitad de camino.
        var revalidacion = revalidarYNotificarSiCambio(cache, request, enCache);
        if (event && event.waitUntil) event.waitUntil(revalidacion);
        return enCache;
      }
      // Primera vez que se pide este recurso: no hay nada cacheado
      // que ofrecer ya mismo, así que sí esperamos la red acá.
      return fetch(request).then(function (respuestaRed) {
        if (respuestaRed && respuestaRed.ok) cache.put(request, respuestaRed.clone());
        return respuestaRed;
      });
    });
  });
}

function revalidarYNotificarSiCambio(cache, request, enCache) {
  return fetch(request)
    .then(function (respuestaRed) {
      if (!respuestaRed || !respuestaRed.ok) return;
      return Promise.all([enCache.clone().text(), respuestaRed.clone().text()])
        .then(function (textos) {
          var cambio = textos[0] !== textos[1];
          return cache.put(request, respuestaRed.clone()).then(function () {
            if (cambio) avisarActualizacionDisponible(request.url);
          });
        });
    })
    .catch(function () {
      // Sin red para revalidar: seguimos sirviendo lo que ya está en
      // cache sin problema, no es un error que rompa nada.
    });
}

function avisarActualizacionDisponible(url) {
  return self.clients.matchAll({ type: 'window' }).then(function (clientes) {
    clientes.forEach(function (cliente) {
      cliente.postMessage({ tipo: 'uru-spot-actualizacion-disponible', url: url });
    });
  });
}

