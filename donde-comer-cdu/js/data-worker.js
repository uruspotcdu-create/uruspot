/* ═══════════════════════════════════════════════════════════════════════
 * URU SPOT — WORKER DE DATOS
 * [ARQUITECTURA — auditoría de escalabilidad "Dónde Comer"] Hasta esta
 * pasada, fetch(lugares-core.json)/fetch(lugares-detalles.json) corrían en
 * el hilo principal: la promesa se resuelve ahí, y CRUCIALMENTE
 * Response.json() (parseo del JSON) también corre en el hilo principal,
 * de forma síncrona dentro de ese microtask. Con 862 lugares eso es
 * imperceptible (el archivo pesa ~116KB). El objetivo explícito de esta
 * auditoría es sostener la misma sensación de fluidez a 10.000/50.000/
 * 100.000 lugares — y a esa escala, tanto el JSON.parse de un archivo
 * varias veces más pesado como la normalización de texto de cada nombre/
 * categoría (NFD + regex + lowercase, por cada lugar, para que la
 * búsqueda encuentre "heladeria" en "Heladería") sí se sienten: son
 * trabajo de CPU puro, bloqueante, justo en la ventana en la que el mapa
 * intenta volverse interactivo.
 *
 * Este worker no toca Leaflet ni el DOM (no puede: un Worker no tiene
 * acceso a `window`/`document`), así que se limita exactamente al
 * trabajo que SÍ es 100% portable fuera del hilo principal:
 *   1) fetch() de ambos JSON (I/O — ya era async, sin cambios ahí),
 *   2) el JSON.parse en sí (vía response.json()),
 *   3) normalizarTexto() de nombre/categoria por cada lugar del core
 *      (idéntica implementación a utils.normalizarTexto en
 *      core-engine.js — MISMO resultado, ver esa función para el
 *      razonamiento de por qué NFD+regex+lowercase y no otra cosa).
 *
 * Lo que este worker NO hace, a propósito: no mezcla core+detalles antes
 * de responder, y responde el core apenas está listo, sin esperar a que
 * termine el fetch de detalles. Esto preserva el comportamiento ya
 * validado en cargarConExtra()/mergeDetalles() (core-engine.js): el mapa
 * se vuelve interactivo con el dataset mínimo (id/nombre/categoria/grupo/
 * lat/lng/rating) apenas llega, y direccion/descripcion/telefono/
 * place_id se aplican por separado, en segundo plano, sin retrasar un
 * solo milisegundo esa primera interactividad. Combinar ambos acá y
 * responder recién cuando los dos terminaran habría reintroducido esa
 * espera por la puerta de atrás.
 * ═══════════════════════════════════════════════════════════════════════ */
'use strict';

var DIACRITICS_REGEX = /[\u0300-\u036f]/g;

// Debe producir EXACTAMENTE el mismo resultado que utils.normalizarTexto
// en core-engine.js — es la misma función, duplicada a propósito (un
// Worker no puede hacer `importScripts` de un archivo pensado para correr
// contra `window`, y core-engine.js sí depende de `window`/Leaflet en
// otras partes). Si se toca una, hay que tocar la otra.
function normalizarTexto(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(DIACRITICS_REGEX, '')
    .toLowerCase();
}

self.onmessage = function (e) {
  var msg = e.data || {};
  if (msg.tipo !== 'cargar') return;

  // ── Core: id/nombre/categoria/grupo/lat/lng/rating — bloquea la
  // interactividad del mapa, así que se responde en cuanto está listo. ──
  fetch(msg.coreUrl)
    .then(function (r) { return r.ok ? r.json() : []; })
    .catch(function () { return null; })
    .then(function (core) {
      core = Array.isArray(core) ? core : [];
      var total = core.length;
      // Loop plano de índice numérico (no .map/.forEach): a la escala que
      // este archivo está pensado para sostener (decenas de miles de
      // filas), evitar el overhead de callback por elemento es una
      // optimización real, no cosmética — mismo criterio que ya usa
      // core-engine.js en sus propios loops calientes.
      for (var i = 0; i < total; i++) {
        var l = core[i];
        l._nombreNorm = normalizarTexto(l.nombre);
        l._categoriaNorm = normalizarTexto(l.categoria || '');
      }
      self.postMessage({ tipo: 'core', lugares: core });
    });

  // ── Detalles: direccion/descripcion/telefono/place_id — solo se ven
  // dentro de un popup ya abierto. Se pide en paralelo con el core (no
  // encadenado), pero se responde por separado apenas está listo. ──
  if (msg.detailsUrl) {
    fetch(msg.detailsUrl)
      .then(function (r) { return r.ok ? r.json() : []; })
      .catch(function () { return []; })
      .then(function (detalles) {
        self.postMessage({ tipo: 'detalles', detalles: Array.isArray(detalles) ? detalles : [] });
      });
  } else {
    self.postMessage({ tipo: 'detalles', detalles: [] });
  }
};
