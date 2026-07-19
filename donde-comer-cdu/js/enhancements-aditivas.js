/**
 * URU SPOT — capa aditiva de la página "Dónde comer".
 *
 * Este archivo no dibuja el mapa ni administra el padrón: eso es
 * responsabilidad exclusiva de core-engine.js. Todo lo que hay acá son
 * mejoras de experiencia que se apoyan en la API pública del motor
 * (`window.uruSpotMotor`) y en tres contratos externos que ya existen
 * en el resto de la página, con estos nombres exactos:
 *
 *   - GRUPOS         → taxonomía de los 13 rubros (key/label/icon/desc/color)
 *   - alMotorListo() → se dispara cuando `window.uruSpotMotor` ya existe
 *   - getFavs()      → ids de lugares guardados como favoritos
 *   - ALL_FAVABLE    → mapa id → { name, cat } de todo lugar guardable
 *
 * Ninguno de esos cuatro se declara acá: son provistos por el resto del
 * bundle y este archivo los consume tal cual, igual que antes.
 *
 * Arquitectura interna (de abajo hacia arriba):
 *
 *   Kit        → funciones puras reutilizadas por todos los módulos
 *                (escapado, normalización, distancia de edición,
 *                debounce, sessionStorage seguro, scroll al mapa, poll).
 *   Motor      → único punto de contacto con window.uruSpotMotor: un
 *                solo listener 'popupopen' compartido en vez de uno
 *                por módulo, y una espera de dataset reutilizable.
 *   DomWatch   → un único MutationObserver nativo con múltiples
 *                objetivos (`.observe()` admite más de un target por
 *                instancia), en vez de un observer nuevo por módulo.
 *   Modules    → registro de features; cada una se declara una vez y
 *                se enciende sola si sus nodos existen en el DOM.
 *   bootstrap  → enciende el registro completo, aislando fallos.
 */
(function (window, document) {
  'use strict';

  /* ================================================================
   * KIT — utilidades puras. Sin estado propio, sin efectos ocultos.
   * ================================================================ */
  const Kit = Object.freeze({
    escapeHtml(value) {
      const holder = document.createElement('div');
      holder.textContent = value == null ? '' : String(value);
      return holder.innerHTML;
    },

    normalize(value) {
      return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
    },

    // Distancia de Levenshtein clásica, sin dependencias. Suficiente
    // para nombres de lugares aunque se recorran varios cientos.
    levenshtein(a, b) {
      const m = a.length;
      const n = b.length;
      if (!m) return n;
      if (!n) return m;
      const row = new Array(n + 1);
      for (let j = 0; j <= n; j++) row[j] = j;
      for (let i = 1; i <= m; i++) {
        let diagonal = row[0];
        row[0] = i;
        for (let j = 1; j <= n; j++) {
          const temp = row[j];
          row[j] = Math.min(
            row[j] + 1,
            row[j - 1] + 1,
            diagonal + (a[i - 1] === b[j - 1] ? 0 : 1)
          );
          diagonal = temp;
        }
      }
      return row[n];
    },

    debounce(fn, waitMs) {
      let handle;
      return function debounced(...args) {
        clearTimeout(handle);
        handle = setTimeout(() => fn.apply(this, args), waitMs);
      };
    },

    // sessionStorage tolerante a modo privado / cuotas agotadas.
    storage: {
      read(key, fallback) {
        try {
          const raw = sessionStorage.getItem(key);
          return raw ? JSON.parse(raw) : fallback;
        } catch {
          return fallback;
        }
      },
      write(key, value) {
        try {
          sessionStorage.setItem(key, JSON.stringify(value));
        } catch {
          /* cuota agotada o storage deshabilitado: se ignora en silencio */
        }
      }
    },

    scrollToMapa() {
      const destino = document.getElementById('mapa-wrap');
      if (destino) destino.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },

    // Reintenta `predicate` cada `interval` ms hasta que sea verdadera
    // o se agote `timeout`. Reemplaza los setInterval/contador manual
    // que antes se repetían en cada módulo con espera propia.
    poll(predicate, { interval = 500, timeout = 20000 } = {}) {
      return new Promise((resolve) => {
        const start = Date.now();
        (function tick() {
          if (predicate()) { resolve(true); return; }
          if (Date.now() - start >= timeout) { resolve(false); return; }
          setTimeout(tick, interval);
        })();
      });
    }
  });

  /* ================================================================
   * MOTOR — único canal hacia window.uruSpotMotor.
   * ================================================================ */
  const Motor = (() => {
    const popupSubscribers = new Set();
    let popupWired = false;

    function get() {
      return window.uruSpotMotor || null;
    }

    function wirePopupOnce(motor) {
      if (popupWired || !motor || !motor.map) return;
      popupWired = true;
      // Un solo listener 'popupopen' para todos los módulos interesados,
      // en vez de uno por módulo. Un fallo de un suscriptor no debe
      // impedir que el resto reciba el evento.
      motor.map.on('popupopen', (event) => {
        popupSubscribers.forEach((handler) => {
          try { handler(event, motor); } catch { /* aislado */ }
        });
      });
    }

    function onPopupOpen(handler) {
      popupSubscribers.add(handler);
      if (typeof alMotorListo === 'function') {
        alMotorListo((motor) => wirePopupOnce(motor));
      }
    }

    function whenReady(handler) {
      if (typeof alMotorListo === 'function') alMotorListo(handler);
    }

    function whenDatasetReady(opts) {
      return Kit.poll(() => {
        const motor = get();
        return !!(motor && motor.todosLosMarkers && motor.todosLosMarkers.length);
      }, opts);
    }

    return Object.freeze({ get, onPopupOpen, whenReady, whenDatasetReady });
  })();

  /* ================================================================
   * DOM WATCH — un único MutationObserver, múltiples objetivos.
   * MutationObserver admite varias llamadas a `.observe()` sobre la
   * misma instancia, cada una con su propia config; el navegador
   * entrega todas las mutaciones al mismo callback en un solo batch.
   * Eso reemplaza los 4 observers independientes que había antes por
   * uno solo, sin cambiar qué dispara a quién.
   * ================================================================ */
  const DomWatch = (() => {
    const watchers = [];
    let observer = null;

    function dispatch(records) {
      const firedHandlers = new Set();
      for (const record of records) {
        for (const watcher of watchers) {
          if (firedHandlers.has(watcher.handler)) continue;
          if (watcher.el === record.target || watcher.el.contains(record.target)) {
            firedHandlers.add(watcher.handler);
          }
        }
      }
      firedHandlers.forEach((handler) => handler());
    }

    function watch(el, options, handler) {
      if (!el) return;
      if (!observer) observer = new MutationObserver(dispatch);
      observer.observe(el, options);
      watchers.push({ el, handler });
    }

    return Object.freeze({ watch });
  })();

  /* ================================================================
   * MODULES — registro de features. Cada una se define una vez y se
   * enciende sola si sus nodos existen; si no, no hace nada.
   * ================================================================ */
  const Modules = new Map();
  function define(name, factory) { Modules.set(name, factory); }

  /* ---- Tips rotativos del panel "¿Sabías que…?" ---- */
  define('tipRotator', function tipRotator() {
    const TIPS = [
      'podés tocar "/" en cualquier parte de la página para saltar directo al buscador del mapa, sin usar el mouse.',
      'el botón "Uno al azar" elige un lugar al azar del padrón — ideal si no sabés qué buscar todavía.',
      'los pines dorados marcan lugares destacados dentro de su rubro, no publicidad paga.',
      'podés guardar un lugar tocando el corazón y después filtrar el mapa con "Solo favoritos", sin crear ninguna cuenta.',
      'la vista "Lista" ordena los mismos resultados del mapa por cercanía o por calificación, sin perder el filtro que tenías puesto.',
      'cada ficha muestra la cantidad real de reseñas junto a la calificación — nunca una sin la otra.',
      'el panel "Un rubro a la vez", más arriba, recorre las 13 categorías con su cantidad real de fichas — tocá "Ver en el mapa" para saltar directo a esa categoría.',
      'la franja "El padrón, en cifras vivas" no la escribió nadie a mano: se calcula en tu navegador sobre las fichas reales apenas terminan de cargar.',
      'tocá "?" en cualquier momento (o el botón redondo abajo a la izquierda, en pantallas grandes) para ver todos los atajos de teclado del sitio en un solo panel.',
      'en pantallas grandes, los puntos de la derecha marcan en qué sección de la página estás — pasá el mouse por uno para ver su nombre sin tener que hacer scroll.',
      'la barra apilada del manifiesto (más arriba, en la sección oscura) es el mismo desglose de 13 rubros que el bloque de números — pasá el mouse por cada segmento para ver el porcentaje exacto.'
    ];

    const texto = document.getElementById('mapaTipTexto');
    const boton = document.getElementById('mapaTipSwap');
    if (!texto || !boton) return;

    let i = 0;
    boton.addEventListener('click', () => {
      i = (i + 1) % TIPS.length;
      texto.style.transition = 'opacity .18s ease';
      texto.style.opacity = '0';
      setTimeout(() => {
        texto.textContent = TIPS[i];
        texto.style.opacity = '1';
      }, 180);
    });
  });

  /* ---- Barra de progreso viva del contador del mapa ----
     Observa los nodos de texto de #mapa-count / #mapa-total (que
     core-engine.js ya actualiza como parte de su propia lógica de
     render) y solo pinta el ancho de #mapa-contador-fill en función
     de esos dos números. No lee ni escribe ningún otro estado. */
  define('progressBar', function progressBar() {
    const elCount = document.getElementById('mapa-count');
    const elTotal = document.getElementById('mapa-total');
    const elFill = document.getElementById('mapa-contador-fill');
    if (!elCount || !elTotal || !elFill || !('MutationObserver' in window)) return;

    function pintar() {
      const c = parseInt(elCount.textContent, 10) || 0;
      const t = parseInt(elTotal.textContent, 10) || 0;
      const pct = t > 0 ? Math.min(100, Math.round((c / t) * 100)) : 0;
      elFill.style.width = pct + '%';
    }

    const cfg = { childList: true, characterData: true, subtree: true };
    DomWatch.watch(elCount, cfg, pintar);
    DomWatch.watch(elTotal, cfg, pintar);
    pintar();
  });

  /* ---- "Un rubro a la vez" — carrusel de las 13 categorías ----
     [FIX — AUDITORIA_URUSPOT_INDEX1.md, hallazgo 8: doble fuente de
     verdad GRUPOS/GRUPOS_UI] La lista que usa el carrusel ya no vive
     copiada a mano acá: se deriva de `GRUPOS` (la taxonomía real,
     externa a este archivo) en el orden en que este carrusel siempre
     mostró los rubros, usando un Map para lookup O(1) en vez de un
     recorrido lineal por cada key. */
  define('rubroSpotlight', function rubroSpotlight() {
    const cont = document.getElementById('rubroSpotlight');
    if (!cont) return;

    const ORDEN = ['gastronomia', 'compras', 'salud', 'finanzas', 'transporte', 'deporte',
      'patrimonio', 'educacion', 'belleza', 'alojamiento', 'servicios_publicos', 'mascotas', 'naturaleza'];
    const porKey = new Map(GRUPOS.map((g) => [g.key, g]));
    const grupos = ORDEN.map((key) => porKey.get(key)).filter(Boolean);

    const body = document.getElementById('rsBody');
    const elIco = document.getElementById('rsIco');
    const elLabel = document.getElementById('rsLabel');
    const elDesc = document.getElementById('rsDesc');
    const elCount = document.getElementById('rsCount');
    const elCta = document.getElementById('rsCta');
    const elDots = document.getElementById('rsDots');
    const prevBtn = document.getElementById('rsPrev');
    const nextBtn = document.getElementById('rsNext');
    if (!body || !elIco || !elLabel || !elDesc || !elCount || !elCta || !elDots || !prevBtn || !nextBtn) return;

    elDots.innerHTML = grupos.map((g, i) =>
      `<button type="button" class="rs-dot${i === 0 ? ' activo' : ''}" data-i="${i}" aria-label="Ver ${g.label}"></button>`
    ).join('');
    const dotEls = elDots.querySelectorAll('.rs-dot');

    let idx = 0;
    let timer = null;
    let conteos = null; // memoizado apenas el motor entregue datos reales

    function contarFichas(key) {
      if (conteos) return conteos[key] || 0;
      const motor = Motor.get();
      if (motor && typeof motor.contarPorGrupo === 'function') {
        try {
          const c = motor.contarPorGrupo();
          if (c && Object.keys(c).length) { conteos = c; return conteos[key] || 0; }
        } catch { /* el motor todavía no puede contar: se reintenta después */ }
      }
      return null;
    }

    function pintar() {
      const g = grupos[idx];
      body.classList.add('rs-cycling');
      setTimeout(() => body.classList.remove('rs-cycling'), 300);
      elIco.textContent = g.icon;
      elLabel.textContent = g.label;
      elDesc.textContent = g.desc;
      elCta.setAttribute('data-grupo', g.key);
      const n = contarFichas(g.key);
      elCount.textContent = n === null ? '…' : n;
      dotEls.forEach((dot, i) => dot.classList.toggle('activo', i === idx));
    }

    function ir(nuevoIdx) {
      idx = (nuevoIdx + grupos.length) % grupos.length;
      pintar();
    }

    function reiniciarAuto() {
      if (timer) clearInterval(timer);
      timer = setInterval(() => ir(idx + 1), 6500);
    }

    prevBtn.addEventListener('click', () => { ir(idx - 1); reiniciarAuto(); });
    nextBtn.addEventListener('click', () => { ir(idx + 1); reiniciarAuto(); });
    dotEls.forEach((dot) => {
      dot.addEventListener('click', () => { ir(parseInt(dot.getAttribute('data-i'), 10)); reiniciarAuto(); });
    });
    elCta.addEventListener('click', function () {
      const grupo = this.getAttribute('data-grupo');
      const motor = Motor.get();
      if (motor && typeof motor.setFiltro === 'function') {
        motor.setFiltro(grupo, { limpiarBusqueda: true });
      }
      Kit.scrollToMapa();
    });
    cont.addEventListener('mouseenter', () => { if (timer) clearInterval(timer); });
    cont.addEventListener('mouseleave', reiniciarAuto);

    pintar();
    reiniciarAuto();
  });

  /* ---- "El padrón, en cifras vivas" — insights calculados en vivo ----
     Espera (sin bloquear nada) a que motor.todosLosMarkers tenga datos
     y calcula, sobre ese mismo array real, cuatro hechos: la ficha
     mejor calificada, la más reseñada, el rubro con mejor promedio y
     el rubro con más subcategorías distintas. Ningún número es
     inventado ni redactado a mano; si el dataset tarda o no llega a
     cargar, el panel simplemente deja de intentarlo tras 20s. */
  define('padronInsights', function padronInsights() {
    const grid = document.getElementById('piGrid');
    if (!grid) return;
    const cardTop = grid.querySelector('[data-pi="top-rating"]');
    const cardReviews = grid.querySelector('[data-pi="top-reviews"]');
    const cardRubro = grid.querySelector('[data-pi="top-rubro"]');
    const cardDiverso = grid.querySelector('[data-pi="top-diverso"]');
    if (!cardTop || !cardReviews || !cardRubro || !cardDiverso) return;

    const RUBRO_LABELS = {
      gastronomia: 'Gastronomía', compras: 'Compras', salud: 'Salud', finanzas: 'Finanzas',
      transporte: 'Transporte', deporte: 'Deporte', patrimonio: 'Patrimonio', educacion: 'Educación',
      belleza: 'Belleza', alojamiento: 'Alojamiento', servicios_publicos: 'Servicios públicos',
      mascotas: 'Mascotas', naturaleza: 'Naturaleza'
    };

    function hacerClickeable(card, onClick) {
      card.classList.add('pi-clickable');
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.addEventListener('click', onClick);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); }
      });
    }

    function calcularStats(entries) {
      const stats = {
        mejorRating: null,
        masResenas: null,
        sumaPorRubro: {},
        cantPorRubro: {},
        subcatsPorRubro: {}
      };
      for (const entry of entries) {
        const l = entry.lugar;
        if (!l) continue;
        if (typeof l.rating === 'number') {
          const actual = stats.mejorRating;
          if (!actual || l.rating > actual.rating ||
            (l.rating === actual.rating && (l.rating_count || 0) > (actual.rating_count || 0))) {
            stats.mejorRating = l;
          }
          if (l.grupo) {
            stats.sumaPorRubro[l.grupo] = (stats.sumaPorRubro[l.grupo] || 0) + l.rating;
            stats.cantPorRubro[l.grupo] = (stats.cantPorRubro[l.grupo] || 0) + 1;
          }
        }
        if (typeof l.rating_count === 'number' &&
          (!stats.masResenas || l.rating_count > stats.masResenas.rating_count)) {
          stats.masResenas = l;
        }
        if (l.grupo && l.categoria) {
          (stats.subcatsPorRubro[l.grupo] ??= {})[l.categoria] = true;
        }
      }
      return stats;
    }

    function mejorPromedio(sumaPorRubro, cantPorRubro) {
      let mejor = null, prom = -1;
      for (const g of Object.keys(sumaPorRubro)) {
        const p = sumaPorRubro[g] / cantPorRubro[g];
        if (p > prom) { prom = p; mejor = g; }
      }
      return { grupo: mejor, promedio: prom };
    }

    function masDiverso(subcatsPorRubro) {
      let mejor = null, max = -1;
      for (const g of Object.keys(subcatsPorRubro)) {
        const n = Object.keys(subcatsPorRubro[g]).length;
        if (n > max) { max = n; mejor = g; }
      }
      return { grupo: mejor, cantidad: max };
    }

    function pintar() {
      const motor = Motor.get();
      const entries = motor && motor.todosLosMarkers;
      if (!entries || !entries.length) return;

      const stats = calcularStats(entries);

      if (stats.mejorRating) {
        const lugar = stats.mejorRating;
        cardTop.querySelector('.pi-label').textContent = 'Mejor calificado del padrón';
        cardTop.querySelector('.pi-value').innerHTML =
          `${Kit.escapeHtml(lugar.nombre)} — <b>★ ${lugar.rating.toFixed(1)}</b>`;
        hacerClickeable(cardTop, () => { if (motor.irALugar) motor.irALugar(lugar.id); Kit.scrollToMapa(); });
      }
      if (stats.masResenas) {
        const lugar = stats.masResenas;
        cardReviews.querySelector('.pi-label').textContent = 'La ficha con más reseñas';
        cardReviews.querySelector('.pi-value').innerHTML =
          `${Kit.escapeHtml(lugar.nombre)} — <b>${lugar.rating_count.toLocaleString('es-AR')}</b>`;
        hacerClickeable(cardReviews, () => { if (motor.irALugar) motor.irALugar(lugar.id); Kit.scrollToMapa(); });
      }
      const top = mejorPromedio(stats.sumaPorRubro, stats.cantPorRubro);
      if (top.grupo) {
        cardRubro.querySelector('.pi-label').textContent = 'Rubro mejor calificado en promedio';
        cardRubro.querySelector('.pi-value').innerHTML =
          `${RUBRO_LABELS[top.grupo] || top.grupo} — <b>★ ${top.promedio.toFixed(2)}</b>`;
        hacerClickeable(cardRubro, () => {
          if (motor.setFiltro) motor.setFiltro(top.grupo, { limpiarBusqueda: true });
          Kit.scrollToMapa();
        });
      }
      const diverso = masDiverso(stats.subcatsPorRubro);
      if (diverso.grupo) {
        cardDiverso.querySelector('.pi-label').textContent = 'El rubro con más variedad de subcategorías';
        cardDiverso.querySelector('.pi-value').innerHTML =
          `${RUBRO_LABELS[diverso.grupo] || diverso.grupo} — <b>${diverso.cantidad}</b> tipos distintos`;
        hacerClickeable(cardDiverso, () => {
          if (motor.setFiltro) motor.setFiltro(diverso.grupo, { limpiarBusqueda: true });
          Kit.scrollToMapa();
        });
      }
    }

    Motor.whenDatasetReady({ interval: 500, timeout: 20000 }).then((ok) => { if (ok) pintar(); });
  });

  /* ---- "Tu recorrido" — rastro de fichas vistas en esta sesión ----
     Se apoya en el evento 'popupopen' del propio mapa Leaflet
     (compartido vía Motor.onPopupOpen), disparado cada vez que se abre
     cualquier popup sobre ese mapa sin importar cómo. Lee el id desde
     el mismo atributo [data-fav-id] que ya trae el contenido del
     popup. Guarda hasta 6 lugares únicos en sessionStorage (se borra
     solo al cerrar la pestaña). */
  define('mapaTrail', function mapaTrail() {
    const wrap = document.getElementById('mapaTrail');
    const chipsEl = document.getElementById('mapaTrailChips');
    if (!wrap || !chipsEl) return;

    const KEY = 'us_trail_v1';
    const MAX = 6;

    function leer() { return Kit.storage.read(KEY, []); }
    function guardar(lista) { Kit.storage.write(KEY, lista); }

    function pintar() {
      const lista = leer();
      if (!lista.length) return;
      wrap.hidden = false;
      chipsEl.innerHTML = lista.map((item, i) =>
        `<button type="button" class="mapa-trail-chip" data-id="${item.id}" style="animation-delay:${i * 0.04}s">${Kit.escapeHtml(item.nombre)}</button>`
      ).join('');
    }

    function registrar(lugar) {
      if (!lugar || lugar.id == null) return;
      let lista = leer().filter((item) => item.id !== lugar.id);
      lista.unshift({ id: lugar.id, nombre: lugar.nombre });
      if (lista.length > MAX) lista = lista.slice(0, MAX);
      guardar(lista);
      pintar();
    }

    chipsEl.addEventListener('click', (e) => {
      const btn = e.target.closest ? e.target.closest('.mapa-trail-chip') : null;
      if (!btn) return;
      const motor = Motor.get();
      if (motor && typeof motor.irALugar === 'function') {
        motor.irALugar(parseInt(btn.getAttribute('data-id'), 10));
        Kit.scrollToMapa();
      }
    });

    pintar(); // por si ya en esta misma sesión había recorrido guardado

    Motor.onPopupOpen((event, motor) => {
      try {
        const el = event.popup.getElement();
        const btn = el && el.querySelector('[data-fav-id]');
        if (!btn) return;
        const id = parseInt(btn.getAttribute('data-fav-id'), 10);
        const lugar = motor.getLugarPorId ? motor.getLugarPorId(id) : null;
        if (lugar) registrar(lugar);
      } catch { /* popup sin la estructura esperada: se ignora */ }
    });
  });

  /* ---- Comparador de fichas — hasta 3 lugares, lado a lado ----
     Bandeja flotante + modal, construidos íntegramente por JS. Un
     botón "⚖" se inyecta en cada tarjeta de #mapa-lista (vía el
     observer compartido, porque core-engine.js reescribe esas
     tarjetas en cada filtro) y en cada popup del mapa (vía el mismo
     evento 'popupopen' compartido), sin tocar ninguno de los botones
     que ya viven ahí. La selección vive solo en memoria de esta
     pestaña. */
  define('comparador', function comparador() {
    const MAX = 3;
    const seleccion = [];
    const grupoPorKey = new Map(GRUPOS.map((g) => [g.key, g]));

    function botonHtml(id) {
      return `<button type="button" class="us-compare-add" data-compare-id="${id}" aria-label="Agregar a comparación" title="Agregar a comparación">⚖</button>`;
    }

    const tray = document.createElement('div');
    tray.className = 'us-compare-tray';
    tray.innerHTML =
      '<span class="us-compare-tray-label">Comparar:</span>' +
      '<div class="us-compare-chips"></div>' +
      '<button type="button" class="us-compare-cta">Ver comparación</button>';
    document.body.appendChild(tray);
    const trayChips = tray.querySelector('.us-compare-chips');
    const trayCta = tray.querySelector('.us-compare-cta');

    const overlay = document.createElement('div');
    overlay.className = 'us-compare-overlay';
    overlay.innerHTML =
      '<div class="us-compare-modal" role="dialog" aria-modal="true" aria-label="Comparación de fichas">' +
      '<div class="us-compare-modal-head"><div><h3>Comparación de fichas</h3><p>Datos reales del padrón, lado a lado — nada redactado a mano.</p></div>' +
      '<button type="button" class="us-compare-close" aria-label="Cerrar comparación">✕</button></div>' +
      '<div class="us-compare-grid"></div></div>';
    document.body.appendChild(overlay);
    const modalGrid = overlay.querySelector('.us-compare-grid');

    let trampaFoco = null;

    function pintarTray() {
      tray.classList.toggle('is-visible', seleccion.length > 0);
      const motor = Motor.get();
      trayChips.innerHTML = seleccion.map((id) => {
        const lugar = motor && motor.getLugarPorId ? motor.getLugarPorId(id) : null;
        const nombre = lugar ? lugar.nombre : `Ficha ${id}`;
        return `<span class="us-compare-chip"><span>${Kit.escapeHtml(nombre)}</span>` +
          `<button type="button" data-quitar="${id}" aria-label="Quitar ${Kit.escapeHtml(nombre)} de la comparación">✕</button></span>`;
      }).join('');
      const faltaUna = seleccion.length < 2;
      trayCta.style.opacity = faltaUna ? '.5' : '1';
      trayCta.style.pointerEvents = faltaUna ? 'none' : 'auto';
      trayCta.textContent = faltaUna ? 'Agregá una ficha más' : `Ver comparación (${seleccion.length})`;
      trayChips.querySelectorAll('[data-quitar]').forEach((btn) => {
        btn.addEventListener('click', () => quitar(parseInt(btn.getAttribute('data-quitar'), 10)));
      });
      actualizarBotonesFicha();
    }

    function actualizarBotonesFicha() {
      document.querySelectorAll('.us-compare-add').forEach((btn) => {
        const id = parseInt(btn.getAttribute('data-compare-id'), 10);
        btn.classList.toggle('is-on', seleccion.includes(id));
      });
    }

    function agregar(id) {
      if (seleccion.includes(id)) { quitar(id); return; }
      if (seleccion.length >= MAX) seleccion.shift();
      seleccion.push(id);
      pintarTray();
    }

    function quitar(id) {
      const i = seleccion.indexOf(id);
      if (i !== -1) seleccion.splice(i, 1);
      pintarTray();
      if (seleccion.length < 2) cerrarModal();
    }

    function abrirModal() {
      if (seleccion.length < 2) return;
      const motor = Motor.get();
      if (!motor || !motor.getLugarPorId) return;

      const html = seleccion.map((id) => {
        const lugar = motor.getLugarPorId(id);
        if (!lugar) return '';
        const g = grupoPorKey.get(lugar.grupo);
        const color = g ? g.color : '#9C6B2E';
        const label = g ? g.label : (lugar.grupo || '');
        return (
          '<div class="us-compare-card">' +
          `<span class="us-compare-card-cat" style="background:${color}">${Kit.escapeHtml(lugar.categoria || label)}</span>` +
          `<h4>${Kit.escapeHtml(lugar.nombre || '')}</h4>` +
          `<div class="us-compare-row"><span>Calificación</span><span>${lugar.rating ? '★ ' + parseFloat(lugar.rating).toFixed(1) : 'Sin datos'}</span></div>` +
          `<div class="us-compare-row"><span>Reseñas</span><span>${lugar.rating_count ? Number(lugar.rating_count).toLocaleString('es-AR') : '—'}</span></div>` +
          `<div class="us-compare-row"><span>Rubro</span><span>${Kit.escapeHtml(label)}</span></div>` +
          `<div class="us-compare-row"><span>Dirección</span><span>${lugar.direccion ? Kit.escapeHtml(lugar.direccion) : 'No cargada aún'}</span></div>` +
          `<button type="button" class="us-compare-card-cta" data-ir="${lugar.id}">Ver en el mapa</button>` +
          '</div>'
        );
      }).join('');

      modalGrid.innerHTML = html || '<p class="us-compare-empty-note">No pudimos cargar estas fichas todavía. Probá de nuevo en un instante.</p>';
      modalGrid.querySelectorAll('[data-ir]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = parseInt(btn.getAttribute('data-ir'), 10);
          cerrarModal();
          if (motor.irALugar) motor.irALugar(id);
          Kit.scrollToMapa();
        });
      });

      overlay.classList.add('is-visible');
      if (motor.crearTrampaFoco) {
        if (!trampaFoco) trampaFoco = motor.crearTrampaFoco(overlay);
        trampaFoco.activar();
        const cerrarBtn = overlay.querySelector('.us-compare-close');
        if (cerrarBtn) cerrarBtn.focus();
      }
    }

    function cerrarModal() {
      overlay.classList.remove('is-visible');
      if (trampaFoco) trampaFoco.desactivar();
    }

    trayCta.addEventListener('click', abrirModal);
    overlay.querySelector('.us-compare-close').addEventListener('click', cerrarModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cerrarModal(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.classList.contains('is-visible')) cerrarModal();
    });

    const lista = document.getElementById('mapa-lista');
    if (lista) {
      DomWatch.watch(lista, { childList: true, subtree: true }, () => {
        lista.querySelectorAll('.lista-card-actions').forEach((actions) => {
          if (actions.querySelector('.us-compare-add')) return;
          const card = actions.closest('.lista-card');
          if (!card) return;
          const id = parseInt(card.getAttribute('data-lugar-id'), 10);
          if (!id) return;
          const wrapper = document.createElement('div');
          wrapper.innerHTML = botonHtml(id);
          const btn = wrapper.firstChild;
          actions.insertBefore(btn, actions.firstChild);
          btn.classList.toggle('is-on', seleccion.includes(id));
          btn.addEventListener('click', (e) => { e.stopPropagation(); agregar(id); });
        });
      });
    }

    Motor.onPopupOpen((event) => {
      try {
        const el = event.popup.getElement();
        const actions = el && el.querySelector('.mapa-popup-actions');
        if (!actions || actions.querySelector('.us-compare-add')) return;
        const favBtn = actions.querySelector('[data-fav-id]');
        const id = favBtn ? parseInt(favBtn.getAttribute('data-fav-id'), 10) : null;
        if (!id) return;
        const wrapper = document.createElement('div');
        wrapper.innerHTML = botonHtml(id);
        const btn = wrapper.firstChild;
        actions.appendChild(btn);
        btn.classList.toggle('is-on', seleccion.includes(id));
        btn.addEventListener('click', () => agregar(id));
      } catch { /* popup sin la estructura esperada: se ignora */ }
    });
  });

  /* ---- Exportar "Mis favoritos" — copiar o mandar por WhatsApp ----
     Reutiliza getFavs()/ALL_FAVABLE (mismas fuentes de datos que ya
     arma renderSaved()) sin tocar esa función: observa #savedContent
     y reconstruye el texto exportable cada vez que esa función la
     vuelve a pintar. Nunca inventa un lugar: si ALL_FAVABLE todavía no
     resolvió algún id guardado, esa línea se omite. */
  define('exportFavoritos', function exportFavoritos() {
    const savedContent = document.getElementById('savedContent');
    const exportBox = document.getElementById('guardadasExport');
    const copyBtn = document.getElementById('exportCopyBtn');
    const waBtn = document.getElementById('exportWaBtn');
    if (!savedContent || !exportBox || !copyBtn || !waBtn) return;

    function construirTexto() {
      const favs = getFavs();
      if (!favs.length) return '';
      const lineas = favs
        .map((id) => (ALL_FAVABLE[id] ? `★ ${ALL_FAVABLE[id].name} — ${ALL_FAVABLE[id].cat}` : null))
        .filter(Boolean);
      if (!lineas.length) return '';
      return 'Mis lugares guardados en URU SPOT:\n\n' + lineas.join('\n') +
        '\n\nEl padrón completo: https://uruspot.pages.dev/donde-comer-cdu/';
    }

    function actualizar() {
      const texto = construirTexto();
      exportBox.hidden = !texto;
      if (!texto) return;
      waBtn.href = 'https://wa.me/?text=' + encodeURIComponent(texto);
    }

    // El motor debería existir siempre en este flujo (depende de
    // favoritos ya guardados), pero por las dudas se reintenta un rato
    // corto en vez de mantener un segundo sistema de toast paralelo.
    function avisar(msg) {
      Kit.poll(() => {
        const motor = Motor.get();
        return !!(motor && typeof motor.toast === 'function');
      }, { interval: 200, timeout: 3000 }).then((ok) => { if (ok) Motor.get().toast(msg); });
    }

    copyBtn.addEventListener('click', () => {
      const texto = construirTexto();
      if (!texto) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(texto)
          .then(() => avisar('Lista copiada — pegala donde quieras.'))
          .catch(() => avisar('No se pudo copiar. Probá seleccionando el texto a mano.'));
      } else {
        const ta = document.createElement('textarea');
        ta.value = texto;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand('copy');
          avisar('Lista copiada — pegala donde quieras.');
        } catch {
          avisar('No se pudo copiar automáticamente.');
        }
        ta.remove();
      }
    });

    DomWatch.watch(savedContent, { childList: true }, actualizar);
    actualizar();
  });

  /* ---- Sugerencias inteligentes cuando una búsqueda no da nada ----
     Vive en #mapaEmptySugerencias, hermano de #mapa-empty (que
     core-engine.js reescribe entero en cada render). Se activa
     observando el atributo style de #mapa-empty y compara el texto
     tipeado contra motor.todosLosMarkers con una distancia de edición
     liviana — nunca contra una lista escrita a mano. Si no hay ningún
     nombre realmente parecido, se queda oculto. */
  define('sugerenciasBusqueda', function sugerenciasBusqueda() {
    const emptyEl = document.getElementById('mapa-empty');
    const sugEl = document.getElementById('mapaEmptySugerencias');
    const searchInput = document.getElementById('mapa-search');
    if (!emptyEl || !sugEl || !searchInput) return;

    function ocultar() { sugEl.hidden = true; sugEl.innerHTML = ''; }

    function sugerir() {
      const motor = Motor.get();
      const q = Kit.normalize(searchInput.value);
      if (!motor || !motor.todosLosMarkers || !motor.todosLosMarkers.length || q.length < 3) {
        ocultar();
        return;
      }
      const entries = motor.todosLosMarkers;
      const prefijo = q.slice(0, Math.max(3, Math.floor(q.length * 0.6)));
      const umbral = Math.max(2, Math.round(q.length * 0.42));

      const candidatos = [];
      for (const entry of entries) {
        const l = entry.lugar;
        if (!l) continue;
        const nombreNorm = entry.nombreNorm || Kit.normalize(l.nombre);
        const coincideToken = nombreNorm.includes(prefijo);
        const dist = Kit.levenshtein(q, nombreNorm.slice(0, Math.max(q.length + 4, 10)));
        if (coincideToken || dist <= umbral) {
          candidatos.push({ lugar: l, score: coincideToken ? -1 : dist });
        }
      }
      if (!candidatos.length) { ocultar(); return; }

      candidatos.sort((a, b) => a.score - b.score);
      const top = candidatos.slice(0, 4);
      sugEl.innerHTML =
        '<p class="mapa-empty-sug-label">¿Quisiste decir…?</p><div class="mapa-empty-sug-list">' +
        top.map((c) =>
          `<button type="button" class="mapa-empty-sug-item" data-sug-id="${c.lugar.id}">` +
          `<b>${Kit.escapeHtml(c.lugar.nombre)}</b><span>${Kit.escapeHtml(c.lugar.categoria || '')}</span></button>`
        ).join('') + '</div>';
      sugEl.hidden = false;
      sugEl.querySelectorAll('[data-sug-id]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = parseInt(btn.getAttribute('data-sug-id'), 10);
          if (motor.setFiltro) motor.setFiltro('todos', { limpiarBusqueda: true });
          if (motor.irALugar) motor.irALugar(id);
        });
      });
    }

    DomWatch.watch(emptyEl, { attributes: true, attributeFilter: ['style'], childList: true }, () => {
      if (emptyEl.style.display === 'block') sugerir();
      else ocultar();
    });
  });

  /* ---- Resumen de tu sesión — búsquedas y rubros que explorás ----
     Distinto de "Tu recorrido" (que solo lista fichas vistas en el
     mapa, sessionStorage 'us_trail_v1'): este panel lee esa misma
     clave para "fichas abiertas" y suma dos conteos nuevos, ambos de
     datos 100% reales de esta visita: cuántos términos de búsqueda
     distintos escribiste y cuántos rubros distintos tocaste. Aparece
     recién con un mínimo de interacción real, nunca mostrando ceros
     vacíos. */
  define('sessionRecap', function sessionRecap() {
    const recap = document.getElementById('footSessionRecap');
    const elBusquedas = document.getElementById('fsrBusquedas');
    const elRubros = document.getElementById('fsrRubros');
    const elFichas = document.getElementById('fsrFichas');
    if (!recap || !elBusquedas || !elRubros || !elFichas) return;

    const KEY = 'us_session_recap_v1';
    const stored = Kit.storage.read(KEY, {});
    const data = { busquedas: stored.busquedas || [], rubros: stored.rubros || [] };

    function fichasVistas() {
      return Kit.storage.read('us_trail_v1', []).length;
    }

    function pintar() {
      const nBusq = data.busquedas.length;
      const nRub = data.rubros.length;
      const nFichas = fichasVistas();
      elBusquedas.textContent = nBusq;
      elRubros.textContent = nRub;
      elFichas.textContent = nFichas;
      recap.classList.toggle('is-visible', (nBusq + nRub + nFichas) >= 3);
    }

    const searchInput = document.getElementById('mapa-search');
    if (searchInput) {
      const registrarBusqueda = Kit.debounce(() => {
        const v = searchInput.value.trim().toLowerCase();
        if (v.length >= 2 && !data.busquedas.includes(v)) {
          data.busquedas.push(v);
          Kit.storage.write(KEY, data);
          pintar();
        }
      }, 900);
      searchInput.addEventListener('input', registrarBusqueda);
    }

    document.addEventListener('click', (e) => {
      const el = e.target && e.target.closest ? e.target.closest('[data-cat],[data-filtro]') : null;
      if (!el) return;
      const grupo = el.getAttribute('data-cat') || el.getAttribute('data-filtro');
      if (grupo && grupo !== 'todos' && !data.rubros.includes(grupo)) {
        data.rubros.push(grupo);
        Kit.storage.write(KEY, data);
        pintar();
      }
    });

    pintar();
    // "fichas abiertas" también crece por mapaTrail en otro ciclo del
    // motor; este intervalo solo relee sessionStorage (sin recorrer el
    // DOM), así que no compite por trabajo con nada del resto del sitio.
    setInterval(pintar, 4000);
  });

  /* ---- Vista previa de rubro al pasar el mouse por la leyenda ----
     La leyenda (#mapa-legend-list) ya es clickeable para FILTRAR (eso
     ya lo hace core-engine.js); este bloque no filtra nada ni llama a
     motor.setFiltro(): solo atenúa (clase .mapa-pin-atenuado, puramente
     visual) los pines de los demás rubros mientras el mouse o el foco
     de teclado están sobre un ítem de la leyenda, y los devuelve a su
     estado normal al salir — el mismo patrón que usa core-engine.js
     para resaltarMarcador() (togglear una clase CSS sobre
     marker._icon, sin crear objetos Leaflet nuevos). Se desactiva solo
     cuando ya hay un filtro de categoría activo o la vista es
     "lista". */
  define('legendPreview', function legendPreview() {
    const contLegend = document.getElementById('mapa-legend-list');
    if (!contLegend) return;
    let catActual = null;

    function puedeAtenuar() {
      const motor = Motor.get();
      if (!motor || !motor.todosLosMarkers) return false;
      if (motor.filtroActivo && motor.filtroActivo !== 'todos') return false;
      const canvas = document.getElementById('mapa-canvas');
      if (canvas && canvas.getAttribute('data-view') && canvas.getAttribute('data-view') !== 'mapa') return false;
      return true;
    }

    function pintarAtenuado(catActiva) {
      const motor = Motor.get();
      const lista = motor && motor.todosLosMarkers;
      if (!lista) return;
      for (const entry of lista) {
        if (!entry.marker || !entry.marker._icon) continue;
        const pin = entry.marker._icon.querySelector('.mapa-pin');
        if (!pin) continue;
        pin.classList.toggle('mapa-pin-atenuado', !!catActiva && entry.grupo !== catActiva);
      }
    }

    function catDe(el) {
      const item = el && el.closest ? el.closest('.mapa-legend-item') : null;
      return item ? item.getAttribute('data-cat') : null;
    }

    function activar(cat) {
      if (!cat || cat === catActual || !puedeAtenuar()) return;
      catActual = cat;
      pintarAtenuado(cat);
    }

    function desactivar() {
      if (!catActual) return;
      catActual = null;
      pintarAtenuado(null);
    }

    function salioDelItem(e) {
      const item = e.target && e.target.closest ? e.target.closest('.mapa-legend-item') : null;
      return !(item && e.relatedTarget && item.contains(e.relatedTarget));
    }

    contLegend.addEventListener('mouseover', (e) => activar(catDe(e.target)));
    contLegend.addEventListener('mouseout', (e) => { if (salioDelItem(e)) desactivar(); });
    contLegend.addEventListener('focusin', (e) => activar(catDe(e.target)));
    contLegend.addEventListener('focusout', (e) => { if (salioDelItem(e)) desactivar(); });
    // Un clic real en la leyenda dispara un filtro de verdad (vía
    // core-engine.js) — la previsualización deja de tener sentido y no
    // debe quedar una clase de atenuado pegada sobre pines que ya no
    // están en pantalla tras el re-render del mapa.
    contLegend.addEventListener('click', desactivar);
  });

  /* ---- Prefetch por intención de hover/toque — navegación interna ----
     El click en "Ver la guía", en una ficha destacada, en un link del
     footer a otro rubro, o en una tarjeta de #mapa-lista, paga el
     costo completo de red recién al soltar el clic. Esto agrega
     precarga por intención (hover con demora de 120ms, o toque, que ya
     es intención real) usando <link rel="prefetch">, la técnica
     estándar de Chrome/Firefox — un navegador que no la soporte
     simplemente ignora la etiqueta sin ningún error. */
  define('hoverPrefetch', function hoverPrefetch() {
    const conn = navigator.connection || navigator.webkitConnection || navigator.mozConnection;
    if (conn && (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || ''))) return;

    const LIMITE = 14;
    const hechos = new Set();

    function candidato(href) {
      if (!href) return null;
      if (href.charAt(0) === '#') return null;
      if (/^[a-z]+:/i.test(href) && !/^https?:\/\//i.test(href)) return null; // tel:, mailto:, javascript:, etc.
      if (/^https?:\/\//i.test(href) && href.indexOf(location.origin) !== 0) return null; // externo
      return href;
    }

    function prefetch(href) {
      if (hechos.size >= LIMITE || hechos.has(href)) return;
      hechos.add(href);
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = href;
      document.head.appendChild(link);
    }

    // WeakMap en vez de una propiedad `_prefetchT` colgada del elemento:
    // el temporizador pendiente de cada link vive fuera del DOM y no
    // deja residuos si el nodo se descarta antes de dispararse.
    const timers = new WeakMap();

    document.addEventListener('mouseover', (e) => {
      const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!a || timers.has(a)) return;
      const href = candidato(a.getAttribute('href'));
      if (!href) return;
      timers.set(a, setTimeout(() => prefetch(href), 120));
    });
    document.addEventListener('mouseout', (e) => {
      const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (a && timers.has(a)) { clearTimeout(timers.get(a)); timers.delete(a); }
    });
    document.addEventListener('touchstart', (e) => {
      const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!a) return;
      const href = candidato(a.getAttribute('href'));
      if (href) prefetch(href);
    }, { passive: true });
  });

  /* ================================================================
   * BOOTSTRAP — enciende todos los módulos registrados. Un fallo en
   * uno no debe apagar el resto (antes, una excepción sin capturar en
   * cualquiera de estos bloques secuenciales detenía la ejecución de
   * todos los que venían después).
   * ================================================================ */
  Modules.forEach((factory, name) => {
    try {
      factory();
    } catch (err) {
      if (window.console && console.error) console.error(`[uruspot-extras] "${name}" falló al iniciar:`, err);
    }
  });
})(window, document);