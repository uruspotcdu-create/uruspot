/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — proyeccion.js
   Matemática pura de proyección Web Mercator. Sin DOM, sin efectos
   secundarios, sin dependencias. Es la única fuente de verdad para
   convertir lat/lng ⇄ pixeles de mundo en cualquier zoom (entero o
   fraccionario). Todo lo demás del motor del mapa se apoya en esto,
   nunca reimplementa la conversión por su cuenta.

   ───────────────────────────────────────────────────────────────────
   AUDITORÍA (motivo de cada cambio no trivial, para que el diff se
   entienda sin tener que reconstruirlo):

   BUGS REALES corregidos
   • `encuadrar()` no validaba los puntos de entrada: un solo lugar con
     lat/lng corrupto (NaN, string, fuera de rango) envenenaba
     silenciosamente el Math.min/Math.max de todo el lote — el mapa
     terminaba centrado en NaN,NaN sin ningún error visible. Ahora se
     filtran los puntos inválidos antes de calcular el encuadre, y si
     no queda ninguno válido se devuelve `null` (mismo contrato que ya
     existía para lista vacía — los llamadores, ver motor-render.js
     línea ~1906, ya hacen `if (!enc) return;`).
   • Puntos duplicados en la MISMA coordenada exacta (2+ lugares en el
     mismo edificio, caso real y frecuente) hacían que el bbox tuviera
     ancho/alto cero y el bucle de zoom terminara siempre en
     `zoomMax` — un zoom mucho más cercano del que tiene sentido para
     "encuadrar todo" cuando en la práctica es un único punto en
     pantalla. Ahora ese caso degenerado se trata igual que el de un
     solo punto (mismo tope de zoom "de acercamiento razonable", no
     zoomMax a ciegas).
   • El límite de latitud usado para evitar `log(0)` en la proyección
     era un valor arbitrario (`sin(lat)` clampeado a ±0.9999, ≈89.19°)
     sin relación con ningún estándar. Se reemplaza por el límite real
     de Web Mercator (±85.05112878°, el mismo que usan Google Maps,
     Bing Maps y Leaflet) aplicado sobre la LATITUD antes de proyectar
     — más principista, más fácil de razonar cerca de los polos, y
     consistente con cualquier tile provider estándar si el día de
     mañana se integra uno.
   • `encuadrar()` no validaba `ancho`/`alto`/`zoomMax`: un contenedor
     todavía sin medir (0×0, típico durante el primer frame tras un
     `hidden → visible`) o un `zoomMax` no numérico podían dejar el
     bucle de bajada de zoom en un estado indefinido. Ahora hay
     defaults y guardas explícitas.

   CAPACIDADES NUEVAS (aditivas — nadie que ya use `proyectar`,
   `desproyectar`, `puntoAPantalla`, `pantallaAPunto`, `encuadrar` o
   `clamp` ve cambiado su contrato para entradas válidas)
   • `esNumeroFinito` / `esCoordenadaValida`: validación geográfica
     centralizada (finito, rango real de lat/lng). Es la definición
     canónica de "coordenada válida" para todo lo que dependa de
     proyeccion.js.
   • `distanciaMetros`: distancia entre dos puntos lat/lng en metros
     (fórmula de Haversine). Vive acá porque es matemática geográfica
     pura, sin DOM ni estado — el mismo criterio que ya rige el resto
     del archivo. NO reemplaza la función equivalente ya existente en
     motor-exposicion.js/app.js: motor-exposicion.js se carga ANTES
     que proyeccion.js (ver index.html, sección 5, orden de <script>),
     así que no puede depender de este archivo sin invertir ese orden
     — un cambio de alcance mucho mayor que estos dos archivos y
     fuera de lo autorizado en esta pasada. Queda documentado acá para
     que un futuro consumidor que sí cargue después de proyeccion.js
     (o una futura reordenación deliberada de los <script>) no tenga
     que reimplementarla una tercera vez.

   Todo lo demás es exactamente la misma matemática que ya existía.
   No se agregó manejo de antimeridiano: URU SPOT es un catálogo de
   una sola ciudad (Concepción del Uruguay, todo el registro real
   dentro de un radio de pocos kilómetros) — construir esa lógica acá
   sería exactamente el tipo de complejidad sin sustento real que el
   resto de este repo (ver motor-config.js, sección mapa, y el
   historial de motor-render.js) deliberadamente evita. Si el catálogo
   alguna vez cruza esa frontera geográfica, es una decisión de
   producto que merece su propia pasada, no una rama defensiva muerta
   agregada "por las dudas".
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var TAM_TILE = 256;

  // Límite real de latitud de Web Mercator: más allá de esto la
  // proyección tiende a infinito. Es el mismo valor que usan Google
  // Maps, Bing Maps y Leaflet — no un número inventado para esta app.
  var LAT_MAXIMA_MERCATOR = 85.05112878;

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function esNumeroFinito(v) {
    return typeof v === 'number' && isFinite(v);
  }

  // Definición canónica de "coordenada geográfica válida" para todo
  // el motor del mapa: números finitos dentro del rango real de
  // lat/lng. `NaN` pasa un chequeo ingenuo de `typeof === 'number'`
  // (typeof NaN es 'number'), por eso ese chequeo no alcanza en
  // ningún punto del sistema que decida qué se dibuja.
  function esCoordenadaValida(lat, lng) {
    return esNumeroFinito(lat) && esNumeroFinito(lng) &&
      lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  }

  // lat/lng → pixeles de mundo en el zoom dado (puede ser fraccionario).
  // Contrato: lat/lng/zoom deben ser números finitos — este es el
  // kernel matemático de mayor frecuencia de llamada de todo el motor
  // (una vez por marcador, por frame, en motor-render.js), así que no
  // valida ni lanza en cada llamada; la validación de datos de origen
  // es responsabilidad de quien decide qué puntos llegan hasta acá
  // (motor-mapa.js). Sí protege el único caso que puede reventar la
  // matemática por sí solo: latitudes más allá del límite de Mercator.
  function proyectar(lat, lng, zoom) {
    var latSegura = clamp(lat, -LAT_MAXIMA_MERCATOR, LAT_MAXIMA_MERCATOR);
    var escala = TAM_TILE * Math.pow(2, zoom);
    var seno = Math.sin(latSegura * Math.PI / 180);
    var x = escala * (0.5 + lng / 360);
    var y = escala * (0.5 - Math.log((1 + seno) / (1 - seno)) / (4 * Math.PI));
    return { x: x, y: y };
  }

  // pixeles de mundo → lat/lng en el zoom dado
  function desproyectar(x, y, zoom) {
    var escala = TAM_TILE * Math.pow(2, zoom);
    var lng = (x / escala - 0.5) * 360;
    var n = Math.PI - 2 * Math.PI * (y / escala);
    var lat = 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    return { lat: lat, lng: lng };
  }

  // Pixel de PANTALLA (relativo al contenedor) para un punto dado, según
  // el estado actual del viewport (centro + zoom + tamaño del contenedor)
  function puntoAPantalla(lat, lng, viewport) {
    var centro = proyectar(viewport.lat, viewport.lng, viewport.zoom);
    var p = proyectar(lat, lng, viewport.zoom);
    return {
      x: p.x - centro.x + viewport.ancho / 2,
      y: p.y - centro.y + viewport.alto / 2
    };
  }

  // Inversa: pixel de pantalla → lat/lng, dado el viewport actual
  function pantallaAPunto(x, y, viewport) {
    var centro = proyectar(viewport.lat, viewport.lng, viewport.zoom);
    return desproyectar(
      centro.x + (x - viewport.ancho / 2),
      centro.y + (y - viewport.alto / 2),
      viewport.zoom
    );
  }

  // Distancia entre dos puntos lat/lng en metros (fórmula de
  // Haversine, radio terrestre medio 6.371.000 m — misma constante que
  // ya usa el resto del sistema). Devuelve `null` ante coordenadas
  // inválidas en vez de `NaN` o lanzar: el mismo contrato de "señal
  // ausente, no señal en cero" que ya usa motor-exposicion.js para
  // proximidad, para que un futuro consumidor no tenga que reinventar
  // ese criterio.
  function distanciaMetros(lat1, lng1, lat2, lng2) {
    if (!esCoordenadaValida(lat1, lng1) || !esCoordenadaValida(lat2, lng2)) return null;
    var R = 6371000;
    var toRad = Math.PI / 180;
    var dLat = (lat2 - lat1) * toRad;
    var dLng = (lng2 - lng1) * toRad;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // Tope de zoom "de acercamiento razonable" para un único punto (o un
  // grupo de puntos que ocupan el mismo lugar en el mundo): ir más allá
  // no aporta contexto real y en cambio deja al usuario sin ninguna
  // referencia de calle/entorno. Compartido entre el caso de un solo
  // punto y el caso degenerado de bbox con área cero.
  var ZOOM_ACERCAMIENTO_UN_PUNTO = 16;

  // Calcula centro + zoom entero que encuadran un conjunto de puntos
  // con un margen (padding) en pixeles, sin superar zoomMax.
  function encuadrar(puntos, ancho, alto, padding, zoomMax) {
    if (!puntos || !puntos.length) return null;

    var zMax = esNumeroFinito(zoomMax) ? zoomMax : 18;
    var pad = esNumeroFinito(padding) ? padding : 48;
    var anchoOk = esNumeroFinito(ancho) && ancho > 0 ? ancho : 0;
    var altoOk = esNumeroFinito(alto) && alto > 0 ? alto : 0;
    if (anchoOk === 0 || altoOk === 0) return null;

    // Filtra lugares con coordenadas corruptas ANTES de tocar
    // Math.min/max — un solo NaN en el lote alcanzaba, antes de esta
    // pasada, para envenenar el encuadre completo en silencio.
    var validos = puntos.filter(function (p) {
      return p && esCoordenadaValida(p.lat, p.lng);
    });
    if (!validos.length) return null;

    if (validos.length === 1) {
      return { lat: validos[0].lat, lng: validos[0].lng, zoom: Math.min(ZOOM_ACERCAMIENTO_UN_PUNTO, zMax) };
    }

    var minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    validos.forEach(function (p) {
      minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
      minLng = Math.min(minLng, p.lng); maxLng = Math.max(maxLng, p.lng);
    });
    var centroLat = (minLat + maxLat) / 2, centroLng = (minLng + maxLng) / 2;

    // Bbox de área cero: todos los puntos válidos comparten exactamente
    // la misma coordenada (2+ lugares en el mismo edificio es un caso
    // real, no hipotético). Sin esto el bucle de abajo nunca encuentra
    // un `w`/`h` que exceda el contenedor y termina siempre en zMax —
    // un acercamiento mucho mayor del que tiene sentido para "esto es,
    // en la práctica, un solo punto en pantalla".
    if (minLat === maxLat && minLng === maxLng) {
      return { lat: centroLat, lng: centroLng, zoom: Math.min(ZOOM_ACERCAMIENTO_UN_PUNTO, zMax) };
    }

    var zoom;
    for (zoom = zMax; zoom > 2; zoom--) {
      var pMin = proyectar(maxLat, minLng, zoom);
      var pMax = proyectar(minLat, maxLng, zoom);
      var w = Math.abs(pMax.x - pMin.x), h = Math.abs(pMax.y - pMin.y);
      if (w <= anchoOk - pad * 2 && h <= altoOk - pad * 2) break;
    }
    return { lat: centroLat, lng: centroLng, zoom: zoom };
  }

  var API = {
    TAM_TILE: TAM_TILE,
    LAT_MAXIMA_MERCATOR: LAT_MAXIMA_MERCATOR,
    clamp: clamp,
    esNumeroFinito: esNumeroFinito,
    esCoordenadaValida: esCoordenadaValida,
    proyectar: proyectar,
    desproyectar: desproyectar,
    puntoAPantalla: puntoAPantalla,
    pantallaAPunto: pantallaAPunto,
    distanciaMetros: distanciaMetros,
    encuadrar: encuadrar
  };

  global.URU_PROYECCION = API;
})(typeof window !== 'undefined' ? window : global);
if (typeof module !== 'undefined' && module.exports) {
  module.exports = (typeof window !== 'undefined' ? window.URU_PROYECCION : global.URU_PROYECCION);
}
