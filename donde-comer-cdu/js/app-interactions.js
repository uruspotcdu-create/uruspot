/**
 * URU SPOT — bootstrap de interacción de la landing "Dónde comer".
 *
 * Este script corre ANTES de core-engine.js/content.js (ver orden de
 * <script> en el documento) y expone, como contrato hacia el resto del
 * bundle, exactamente estos cuatro nombres — el mismo contrato que ya
 * consumía el archivo aditivo del sitio:
 *
 *   - GRUPOS         → taxonomía real de los 13 rubros
 *   - alMotorListo() → callback cuando window.uruSpotMotor.map existe
 *   - getFavs()      → ids de lugares guardados como favoritos
 *   - ALL_FAVABLE    → mapa id → { name, cat, color } de todo lugar
 *                      guardable (curado + resuelto en vivo por el motor)
 *
 * Se publican explícitamente en `window` al final de este archivo, para
 * que ese contrato sea real sin importar cómo se empaquete el resto del
 * sitio, en vez de depender de que dos IIFEs distintas compartan por
 * accidente el mismo scope de variables `var`.
 *
 * Arquitectura interna:
 *
 *   Config     → constantes de tiempo, thresholds y claves de storage.
 *   Data       → dataset curado (GRUPOS, HERO_FICHAS, DIA, FICHAS_DESTACADAS).
 *   Format     → helpers puros de texto/SVG/slug, sin estado.
 *   MotorGateway → único poller compartido para "esperar a que el motor
 *                  del mapa esté listo" (antes había uno por feature).
 *   Favorites  → servicio de favoritos sobre localStorage.
 *   FavorablePlaces → registro id → metadata de todo lo guardable.
 *   SavedFichas → render de "Fichas guardadas", reutilizado por varios módulos.
 *   Modules    → registro de features de UI, cada una encendida una sola
 *                vez y aislada de las demás por el bootstrap.
 */
(function (window, document) {
  'use strict';

  /* ================================================================
   * CONFIG — constantes de tiempo, thresholds y claves de storage.
   * Ningún módulo hardcodea un número mágico propio: todos leen de acá.
   * ================================================================ */
  const Config = Object.freeze({
    reduceMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    totalLugares: 862,
    dataCuradaEl: '2026-07-13',
    staleDataThresholdMs: 1000 * 60 * 60 * 24 * 182, // ~6 meses
    favStorageKey: 'uruspot_favoritos',
    motor: {
      pollIntervalMs: 500,
      maxAttempts: 60 // ~30s máximo (60 × 500ms)
    },
    intro: {
      safetyTimeoutMs: 1800, // cota máxima absoluta: nunca debe quedar bloqueado el scroll
      revealDelayMs: 900,    // duración real de la animación del sello (.8s) + colchón visual
      removeDelayMs: 650,    // tiempo de la transición de salida antes de sacar el nodo del DOM
      focusReleaseDelayMs: 3100,   // salvaguarda de foco, independiente del ciclo visual de arriba
      focusPostLoadDelayMs: 1550   // segunda salvaguarda, atada al evento 'load'
    },
    heroCarousel: { intervalMs: 4200 },
    fonts: { fallbackTimeoutMs: 3000 },
    mapaPreconnect: { rootMargin: '600px 0px' },
    reveal: { threshold: 0.12 }
  });

  /* ================================================================
   * DATA — dataset curado, extraído de lugares-core.json (862 fichas)
   * el 13/07/2026. Se hardcodea acá para que esta sección funcione
   * siempre, sin depender de un fetch en runtime.
   *
   * MANTENIMIENTO: esta es una copia curada, no generada automática-
   * mente desde lugares-core.json. Si el padrón real se actualiza y
   * pasa mucho tiempo sin tocar esta copia, los datos de arriba (hero,
   * breakdown, fichas destacadas) quedan desincronizados — de ahí el
   * aviso de consola de `Diagnostics.warnIfStale()`, más abajo.
   *
   * `textColor` es una variante más clara de `color`, solo para texto
   * sobre fondo oscuro (verificada ≥4.5:1 de contraste, WCAG 1.4.3);
   * `color` se conserva intacto porque también se usa como FONDO con
   * texto blanco encima en .ficha-cat/.fcard-tag, donde sí cumple.
   * ================================================================ */
  const Data = Object.freeze({
    GRUPOS: [
      { key: 'compras', label: 'Compras', icon: '🛒', color: '#657915', count: 232, desc: 'Supermercados, ferreterías, indumentaria y comercios de todo tipo.',
        items: [
          ['Supermercados DIA', 'Supermercado', 3.8, 2273],
          ['Supermercado Gran Rex', 'Supermercado', 4.1, 1179],
          ['Supermercado DAR Supremo', 'Supermercado', 3.8, 1075],
          ['Kairós Ind', 'Indumentaria', 4.9, 466]
        ] },
      { key: 'gastronomia', label: 'Gastronomía', icon: '🍽️', color: '#AD1E1E', textColor: '#E04C4C', count: 166, desc: 'Restaurantes, parrillas, bares, cafeterías, panaderías, heladerías y pizzerías.',
        items: [
          ['Bartolo Bar', 'Bar', 4.1, 3102, 'bartolo-bar'],
          ['Bella Vista', 'Restaurante', 4.4, 2826, 'bella-vista'],
          ['Heladería Italia', 'Heladería', 4.7, 2368, 'italia'],
          ['El Danubio Azul', 'Restaurante', 4.2, 2131, 'el-danubio-azul']
        ] },
      { key: 'salud', label: 'Salud', icon: '🏥', color: '#168282', count: 112, desc: 'Farmacias, clínicas, laboratorios y profesionales de la salud.',
        items: [
          ['Hospital Justo José de Urquiza', 'Hospital', 4.3, 174],
          ['Instituto de Psicología y Psicoanálisis del Litoral', 'Psicología', 4.9, 40],
          ['Centro de Kinesiología y Pilates', 'Kinesiología', 5.0, 39],
          ['Dr. Parra Fernando — Diagnóstico por Imágenes', 'Diagnóstico por imágenes', 3.8, 25]
        ] },
      { key: 'finanzas', label: 'Finanzas', icon: '🏦', color: '#3B1EAD', textColor: '#836AE5', count: 66, desc: 'Bancos, seguros, abogados, escribanías e inmobiliarias.',
        items: [
          ['Río Uruguay Cooperativa de Seguros', 'Seguros', 3.7, 79],
          ['BANIEL BADO — Río Uruguay Seguros', 'Seguros', 5.0, 48],
          ['Banco Galicia', 'Banco', 3.2, 46],
          ['Banco Santander', 'Banco', 3.4, 45]
        ] },
      { key: 'transporte', label: 'Transporte', icon: '🚖', color: '#AD1E74', textColor: '#DD3B9C', count: 65, desc: 'Remiserías, talleres, estaciones de servicio y agencias de viaje.',
        items: [
          ['Terminal de Ómnibus CdU', 'Transporte', 3.7, 4839],
          ['YPF (Gral. Galarza)', 'Estación de servicio', 4.4, 2222],
          ['YPF (Ugarteche)', 'Estación de servicio', 4.3, 865],
          ['Gulf (RP39)', 'Estación de servicio', 4.4, 550]
        ] },
      { key: 'deporte', label: 'Deporte', icon: '💪', color: '#901EAD', textColor: '#C048DF', count: 46, desc: 'Gimnasios, clubes deportivos y espacios de entrenamiento.',
        items: [
          ['Gimnasio Muscle', 'Gimnasio', 4.6, 147, 'muscle-gimnasio'],
          ['Gym Lucianos', 'Gimnasio', 4.8, 49, 'lucianos-gimnasio'],
          ['Gimnasio 538', 'Gimnasio', 4.7, 34, 'gimnasio-538'],
          ['Power Gym', 'Gimnasio', 4.8, 13, 'power-gimnasio']
        ] },
      { key: 'patrimonio', label: 'Patrimonio', icon: '🏛️', color: '#9C681B', count: 38, desc: 'Museos, plazas, iglesias, centros culturales y edificios históricos.',
        items: [
          ['Palacio San José (Museo Nac. Justo J. de Urquiza)', 'Patrimonio histórico', 4.6, 12068],
          ['Plaza General Francisco Ramírez', 'Plaza', 4.6, 6892],
          ['Cine San Martín', 'Patrimonio histórico', 4.5, 2284],
          ['La Peatonal Rocamora', 'Patrimonio histórico', 4.3, 1195]
        ] },
      { key: 'educacion', label: 'Educación', icon: '🎓', color: '#178269', count: 34, desc: 'Universidades, institutos, escuelas y jardines de infantes.',
        items: [
          ['UTN Facultad Regional CdU', 'Universidad', 4.8, 167],
          ['Universidad de Concepción del Uruguay', 'Universidad', 4.0, 97],
          ['Escuela Técnica N.º2 Francisco Ramírez', 'Escuela técnica', 4.4, 84],
          ['UNER Sede CdU', 'Universidad', 4.3, 76]
        ] },
      { key: 'belleza', label: 'Belleza', icon: '💇', color: '#4C1782', textColor: '#9E62DA', count: 28, desc: 'Peluquerías, barberías y centros de estética.',
        items: [
          ['Peluquería Viviana Carolina', 'Peluquería', null, null],
          ['Dieciocho Salón de Profesionales', 'Barbería', null, null],
          ['Salón Parodi', 'Peluquería', null, null],
          ['Mr Anderson Barber Team', 'Barbería', null, null]
        ] },
      { key: 'alojamiento', label: 'Alojamiento', icon: '🏨', color: '#1E57AD', textColor: '#3F7EDE', count: 25, desc: 'Hoteles, hosterías, cabañas, hostels y apart hoteles.',
        items: [
          ['Bungalows México', 'Hostería / Cabañas', 4.4, 805, 'bungalows-mexico'],
          ['Hotel Gran Litoral', 'Hotel', 4.1, 749],
          ['Aires del Campo Cabañas y Hotel', 'Cabañas', 4.2, 657],
          ['Antigua Fonda', 'Hostería', 4.4, 625, 'antigua-fonda']
        ] },
      { key: 'servicios_publicos', label: 'Servicios públicos', icon: '🏢', color: '#823717', count: 22, desc: 'Municipalidad, policía, correo, Registro Civil y más.',
        items: [
          ['Municipalidad de Concepción del Uruguay', 'Municipalidad', 3.4, 316],
          ['Correo Argentino', 'Correo', 2.8, 80],
          ['Juzgado Federal de CdU N.º1', 'Juzgado Federal', 4.2, 69],
          ['Defensoría Pública Oficial', 'Defensoría Pública', 4.3, 15]
        ] },
      { key: 'mascotas', label: 'Mascotas', icon: '🐾', color: '#168241', count: 16, desc: 'Veterinarias y pet shops para el cuidado de tus compañeros.',
        items: [
          ['Veterinaria FISIOVET', 'Veterinaria', 4.8, 260],
          ['Clínica Veterinaria Dr. Guillermo Artusi', 'Veterinaria', 4.6, 229],
          ['Dog Center Pet Shop', 'Veterinaria / Pet Shop', 4.7, 167],
          ['Clínica Veterinaria Dr. Vet', 'Veterinaria', 4.5, 130]
        ] },
      { key: 'naturaleza', label: 'Naturaleza', icon: '🌊', color: '#2C8316', count: 12, desc: 'Balnearios, islas, parques y la costanera del río Uruguay.',
        items: [
          ['Plaza Constitución', 'Plaza', 4.4, 2542],
          ['Camping Paso Vera', 'Naturaleza / Playa', 4.5, 1892],
          ['Plaza San Martín', 'Plaza', 4.4, 1533],
          ['Balneario Itapé', 'Naturaleza / Playa', 4.1, 931]
        ] }
    ],

    HERO_FICHAS: [
      { id: '0002', cat: 'patrimonio', name: 'Basílica Menor Inmaculada Concepción', sub: 'Patrimonio histórico · Centro', rating: 4.7, count: '1.155 reseñas' },
      { id: '0512', cat: 'gastronomia', name: 'Bella Vista', sub: 'Restaurante · Costanera', rating: 4.4, count: '2.826 reseñas' },
      { id: '0637', cat: 'alojamiento', name: 'Hostería Antigua Fonda', sub: 'Alojamiento · Centro', rating: 4.4, count: '625 reseñas' },
      { id: '0741', cat: 'deporte', name: 'Gym Lucianos', sub: 'Gimnasio · Trato personalizado', rating: 4.8, count: '49 reseñas' },
      { id: '0089', cat: 'naturaleza', name: 'Costanera y Plaza Constitución', sub: 'Naturaleza · Río Uruguay', rating: 4.4, count: '2.542 reseñas' }
    ],

    DIA: [
      { time: '8:00', text: 'Arrancás el día con un café de verdad, no de sobre.', href: '../las-mejores-cafeterias-cdu/', color: '#AD1E1E' },
      { time: '9:30', text: 'El desayuno pide algo dulce recién horneado.', href: '../las-mejores-panaderias-cdu/', color: '#AD1E1E' },
      { time: '13:00', text: 'Al mediodía, algo serio para comer con el equipo.', href: '../los-mejores-restaurantes-cdu/', color: '#AD1E1E' },
      { time: '17:00', text: 'La tarde se estira con 30 grados y ganas de algo frío.', href: '../las-mejores-heladerias-cdu/', color: '#AD1E1E' },
      { time: '19:00', text: 'Antes de que se haga tarde, una hora de entrenamiento.', href: '../los-mejores-gimnasios-cdu/', color: '#901EAD' },
      { time: '21:30', text: 'A la noche, una birra artesanal con amigos.', href: '../los-mejores-bares-cdu/', color: '#AD1E1E' },
      { time: 'Sábado', text: 'Alguien viene de visita y necesita dónde quedarse.', href: '../las-mejores-hosterias-cdu/', color: '#1E57AD' },
      { time: 'Domingo', text: 'Tu mascota necesita un chequeo antes de fin de mes.', href: '../mejores-veterinarias-cdu/', color: '#168241' }
    ],

    FICHAS_DESTACADAS: [
      { name: 'Heladería Italia', cat: 'Gastronomía', color: '#AD1E1E', rating: 4.7, count: 2368, slug: 'italia' },
      { name: 'Hotel Boutique Los Aguaribay', cat: 'Alojamiento', color: '#1E57AD', rating: 4.8, count: 302, slug: 'los-aguaribay' },
      { name: 'Power Gym', cat: 'Deporte', color: '#901EAD', rating: 4.8, count: 13, slug: 'power-gimnasio' },
      { name: 'Bella Vista', cat: 'Gastronomía', color: '#AD1E1E', rating: 4.4, count: 2826, slug: 'bella-vista' },
      { name: 'Casa del Árbol Hostel', cat: 'Alojamiento', color: '#1E57AD', rating: 4.5, count: 164, slug: 'casa-del-arbol' },
      { name: 'Bartolo Bar', cat: 'Gastronomía', color: '#AD1E1E', rating: 4.1, count: 3102, slug: 'bartolo-bar' },
      { name: '7 Colinas Craft Brewery', cat: 'Gastronomía', color: '#AD1E1E', rating: 4.4, count: 1930, slug: '7-colinas' },
      { name: 'Posta Torreón', cat: 'Alojamiento', color: '#1E57AD', rating: 4.4, count: 582, slug: 'posta-torreon' }
    ]
  });

  // Lookup O(1) por key, en vez del `GRUPOS.filter(g => g.key === x)[0]`
  // que el archivo original repetía sin memoizar en al menos tres
  // lugares distintos (hero, favoritos curados, favoritos en vivo).
  const GruposPorKey = new Map(Data.GRUPOS.map((g) => [g.key, g]));

  // Los tres bloques del manifiesto (explorador, breakdown y barras)
  // ordenaban `GRUPOS` de mayor a menor cada uno por su cuenta; se
  // ordena una sola vez y se reutiliza el mismo array inmutable.
  const GruposPorPopularidad = Object.freeze(Data.GRUPOS.slice().sort((a, b) => b.count - a.count));

  /* ================================================================
   * FORMAT — helpers puros de texto/SVG/slug. Sin estado, sin DOM.
   * ================================================================ */
  const Format = Object.freeze({
    slugify(value) {
      return String(value)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
    },
    heartIcon(filled) {
      return `<svg viewBox="0 0 20 20" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.6"><path d="M10 17s-6.5-4-6.5-9A3.8 3.8 0 0110 5.3 3.8 3.8 0 0116.5 8c0 5-6.5 9-6.5 9z"/></svg>`;
    },
    arrowIcon() {
      return '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 8h10M9 4l4 4-4 4"/></svg>';
    },
    escapeHtml(value) {
      const holder = document.createElement('div');
      holder.textContent = value == null ? '' : String(value);
      return holder.innerHTML;
    },
    percent(part, total) {
      return total > 0 ? (part / total) * 100 : 0;
    },
    smoothOrAuto() {
      return Config.reduceMotion ? 'auto' : 'smooth';
    }
  });

  function scrollToId(id) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: Format.smoothOrAuto(), block: 'start' });
  }

  /* ================================================================
   * MOTOR GATEWAY — único poller compartido para "esperar a que
   * window.uruSpotMotor.map exista". Antes, dos features (recorrido y
   * comparador, en el archivo aditivo) abrían cada una su propio
   * setInterval(…, 500) preguntando exactamente lo mismo; ahora hay UN
   * solo timer, y cualquier suscriptor nuevo se cuelga de él en vez de
   * levantar uno propio. Mismo comportamiento observable: mismo tope
   * de ~30s, mismo intervalo de 500ms, mismo callback recibiendo el
   * motor ya listo.
   * ================================================================ */
  const MotorGateway = (() => {
    const pending = new Set();
    let timer = null;
    let attempts = 0;

    function isReady() {
      return !!(window.uruSpotMotor && window.uruSpotMotor.map);
    }

    function flush() {
      clearInterval(timer);
      timer = null;
      const motor = window.uruSpotMotor;
      const callbacks = [...pending];
      pending.clear();
      callbacks.forEach((cb) => { try { cb(motor); } catch { /* aislado: un suscriptor no debe tumbar al resto */ } });
    }

    function tick() {
      attempts++;
      if (isReady()) { flush(); return; }
      if (attempts > Config.motor.maxAttempts) { clearInterval(timer); timer = null; pending.clear(); }
    }

    function alMotorListo(callback) {
      if (isReady()) { callback(window.uruSpotMotor); return; }
      pending.add(callback);
      if (!timer) timer = setInterval(tick, Config.motor.pollIntervalMs);
    }

    return Object.freeze({ alMotorListo, isReady });
  })();

  /* ================================================================
   * FAVORITES — servicio de favoritos sobre localStorage. Misma clave
   * que usa core-engine.js: 'uruspot_favoritos'.
   * ================================================================ */
  const Favorites = (() => {
    const badge = document.getElementById('favCount');

    function list() {
      try { return JSON.parse(localStorage.getItem(Config.favStorageKey) || '[]'); }
      catch { return []; }
    }
    function persist(ids) {
      try { localStorage.setItem(Config.favStorageKey, JSON.stringify(ids)); }
      catch { /* localStorage no disponible (privado/cuota): se ignora en silencio */ }
    }
    function has(id) { return list().includes(id); }
    function toggle(id) {
      const ids = list();
      const i = ids.indexOf(id);
      if (i === -1) ids.push(id); else ids.splice(i, 1);
      persist(ids);
      refreshBadge();
      return i === -1;
    }
    function refreshBadge() {
      if (badge) badge.textContent = list().length;
    }

    return Object.freeze({ list, has, toggle, refreshBadge });
  })();

  /* ================================================================
   * FAVORABLE PLACES — registro id → { name, cat, color } de todo
   * lugar guardable: arranca con la vista curada (rubros + fichas
   * destacadas) y se completa en vivo apenas core-engine.js resuelve
   * los 862 lugares reales de lugares-core.json. Es el mismo objeto
   * que se expone como `window.ALL_FAVABLE` al final del archivo —
   * las mutaciones posteriores siguen siendo visibles ahí.
   * ================================================================ */
  const FavorablePlaces = (() => {
    const registry = Object.create(null);

    Data.GRUPOS.forEach((grupo) => {
      grupo.items.forEach(([name, , , , slug], idx) => {
        if (!slug) registry[`g-${grupo.key}-${idx}`] = { name, cat: grupo.label, color: grupo.color };
      });
    });
    Data.FICHAS_DESTACADAS.forEach((ficha, idx) => {
      registry[`destacada-${idx}`] = { name: ficha.name, cat: ficha.cat, color: ficha.color };
    });

    function absorbLiveDataset(motor) {
      if (!motor?.todosLosMarkers) return;
      motor.todosLosMarkers.forEach((entry) => {
        const lugar = entry.lugar;
        if (!lugar) return;
        const grupo = GruposPorKey.get(entry.grupo);
        registry[lugar.id] = {
          name: lugar.nombre,
          cat: grupo ? grupo.label : entry.categoria,
          color: grupo ? grupo.color : '#9C6B2E'
        };
      });
    }

    function get(id) { return registry[id]; }

    return Object.freeze({ registry, get, absorbLiveDataset });
  })();

  /* ================================================================
   * SAVED FICHAS — render de "Fichas guardadas". Se reutiliza desde
   * varios módulos (fichas destacadas, botón de nav, evento de datos
   * listos), así que vive como servicio propio en vez de una función
   * suelta a la que todos le apuntan por nombre.
   * ================================================================ */
  const SavedFichas = (() => {
    function orphanRow(id) {
      return (
        '<div class="reg-row"><span class="reg-rank">♥</span><div class="reg-main">' +
        '<p class="saved-orphan">Ficha no disponible todavía</p>' +
        '<span>Puede aparecer cuando el mapa termine de cargar</span></div>' +
        `<button class="reg-heart on" data-favid="${id}" aria-label="Quitar de guardados">${Format.heartIcon(true)}</button></div>`
      );
    }
    function knownRow(id, place) {
      return (
        '<div class="reg-row"><span class="reg-rank">♥</span><div class="reg-main">' +
        `<p>${Format.escapeHtml(place.name)}</p><span>${Format.escapeHtml(place.cat)}</span></div>` +
        `<button class="reg-heart on" data-favid="${id}" aria-label="Quitar ${Format.escapeHtml(place.name)}">${Format.heartIcon(true)}</button></div>`
      );
    }

    function render() {
      const wrap = document.getElementById('savedContent');
      if (!wrap) return;
      const favs = Favorites.list();
      if (favs.length === 0) {
        wrap.innerHTML = '<div class="saved-empty">Todavía no guardaste ninguna ficha. Tocá el corazón junto a cualquier lugar del padrón para guardarlo acá.</div>';
        return;
      }
      // Fix (auditoría, hallazgo "favoritos huérfanos"): si un id
      // guardado no aparece todavía en el registro (por ejemplo, un id
      // real que el motor aún no resolvió), se muestra un placeholder
      // explícito con opción de quitarlo, en vez de desaparecer sin aviso.
      const rows = favs.map((id) => {
        const place = FavorablePlaces.get(id);
        return place ? knownRow(id, place) : orphanRow(id);
      }).join('');
      wrap.innerHTML = `<div class="saved-list">${rows}</div>`;
      wrap.querySelectorAll('.reg-heart').forEach((btn) => {
        btn.addEventListener('click', () => {
          Favorites.toggle(btn.getAttribute('data-favid'));
          render();
        });
      });
    }

    return Object.freeze({ render });
  })();

  window.addEventListener('uruspot:datos-listos', () => {
    FavorablePlaces.absorbLiveDataset(window.uruSpotMotor);
    SavedFichas.render();
  });

  /* ================================================================
   * MODULES — registro de features de UI. Cada una se declara una
   * sola vez y el bootstrap la enciende de forma aislada: un error en
   * una no debe impedir que las siguientes se inicialicen (antes,
   * solo los bloques "build*" tenían try/catch propio; el resto
   * corría a cielo abierto).
   * ================================================================ */
  const Modules = new Map();
  const define = (name, factory) => Modules.set(name, factory);

  /* ---- Intro: sello de bienvenida ----
     Fix (Hallazgo C): si el evento 'load' no disparara o `intro`
     dejara de existir, la clase 'locked' quedaba pegada para siempre.
     Ahora hay un timeout de seguridad independiente que fuerza el
     desbloqueo pase lo que pase.
     Fix (Hallazgo 13/11.5): el desbloqueo se ancla a la duración real
     de la animación del sello (.8s), no al evento 'load' (que espera a
     TODA la página — imágenes, iframes, fuentes — una cota sin techo
     real y ajena a la propia animación). */
  define('introOverlay', () => {
    const intro = document.getElementById('intro');
    const htmlEl = document.documentElement;
    if (!intro) return { intro: null };
    if (Config.reduceMotion) { intro.remove(); return { intro: null }; }

    let unlocked = false;
    function forceUnlock() {
      if (unlocked) return;
      unlocked = true;
      htmlEl.classList.remove('locked');
      intro.remove();
    }

    try {
      htmlEl.classList.add('locked');
      intro.classList.add('stamping');
      setTimeout(forceUnlock, Config.intro.safetyTimeoutMs);
      setTimeout(() => {
        try {
          intro.classList.add('hide');
          htmlEl.classList.remove('locked');
          unlocked = true;
          setTimeout(() => intro.remove(), Config.intro.removeDelayMs);
        } catch {
          forceUnlock();
        }
      }, Config.intro.revealDelayMs);
    } catch {
      forceUnlock();
    }

    return { intro };
  });

  /* ---- Barra de progreso de scroll + solidificado del nav ----
     Throttleado con requestAnimationFrame: el cálculo y la escritura
     de estilo ocurren como máximo una vez por frame pintado, no una
     vez por cada evento nativo de scroll. */
  define('scrollProgress', () => {
    const progress = document.getElementById('progress');
    const navEl = document.getElementById('nav');
    if (!progress || !navEl) return;

    let ticking = false;
    function paint() {
      const root = document.documentElement;
      const max = root.scrollHeight - root.clientHeight;
      progress.style.width = `${Format.percent(root.scrollTop, max)}%`;
      navEl.classList.toggle('solid', root.scrollTop > 40);
      ticking = false;
    }
    window.addEventListener('scroll', () => {
      if (!ticking) { ticking = true; requestAnimationFrame(paint); }
    }, { passive: true });
  });

  /* ---- Reveal al hacer scroll ---- */
  define('revealOnScroll', () => {
    const items = document.querySelectorAll('.reveal');
    if (!items.length) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) { entry.target.classList.add('in'); io.unobserve(entry.target); }
      });
    }, { threshold: Config.reveal.threshold });
    items.forEach((item) => io.observe(item));
  });

  /* ---- Smooth-scroll para anclas internas ----
     Fix (Hallazgo alto "selector genérico choca con #mapa-reset"):
     a[href^="#"] también matchea <a id="mapa-reset" href="#">. Para
     hrefs vacíos ("#") se llama preventDefault() igual (bloquea solo
     el salto nativo) sin hacer scrollIntoView, sin afectar otros
     listeners que core-engine.js pueda tener sobre el mismo elemento.
     Se ata directamente a cada ancla presente EN ESTE MOMENTO (no por
     delegación): los chips de rubro que buildRubroExplorer agrega más
     tarde dependen a propósito solo del scroll-behavior:smooth nativo
     de CSS, no de este listener — usar delegación acá los capturaría
     también y cambiaría ese comportamiento ya documentado. */
  define('anchorSmoothScroll', () => {
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
      anchor.addEventListener('click', (e) => {
        const href = anchor.getAttribute('href');
        if (href.length <= 1) { e.preventDefault(); return; }
        const target = document.querySelector(href);
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: Format.smoothOrAuto(), block: 'start' });
        }
      });
    });
  });

  /* ---- Acordeón de FAQ ----
     Los ítems de FAQ ya existen en el HTML estático al momento en que
     este módulo corre y nunca se agregan más en runtime, así que un
     único listener delegado en el contenedor reemplaza sin riesgo a
     los N listeners individuales que había antes. */
  define('faqAccordion', () => {
    const buttons = document.querySelectorAll('.faq-q');
    if (!buttons.length) return;
    const host = buttons[0].closest('.faq') || document;

    host.addEventListener('click', (e) => {
      const btn = e.target.closest ? e.target.closest('.faq-q') : null;
      if (!btn) return;
      const item = btn.parentElement;
      const wasOpen = item.classList.contains('open');
      item.parentElement.querySelectorAll('.faq-item').forEach((sibling) => {
        sibling.classList.remove('open');
        const q = sibling.querySelector('.faq-q');
        if (q) q.setAttribute('aria-expanded', 'false');
      });
      if (!wasOpen) { item.classList.add('open'); btn.setAttribute('aria-expanded', 'true'); }
    });
  });

  /* ---- Aviso en consola si el dataset curado envejeció ----
     Recordatorio visible en devtools si nadie actualiza esta copia en
     +6 meses; no reemplaza un pipeline real de build. */
  define('staleDataWarning', () => {
    try {
      const curada = new Date(`${Config.dataCuradaEl}T00:00:00`);
      if (Date.now() - curada.getTime() > Config.staleDataThresholdMs) {
        console.warn(
          `[URU SPOT] Los datos curados hardcodeados en index.html (GRUPOS, HERO_FICHAS, FICHAS_DESTACADAS, DIA) tienen más de 6 meses (curados el ${Config.dataCuradaEl}). Verificá que sigan sincronizados con lugares-core.json antes de confiar en estos números.`
        );
      }
    } catch { /* fecha inválida u otro entorno restringido: se ignora */ }
  });

  /* ---- Hero: fichas rotativas ---- */
  define('heroCarousel', () => {
    const stage = document.getElementById('fichaStage');
    const dots = document.getElementById('fichaDots');
    if (!stage || !dots) return;

    Data.HERO_FICHAS.forEach((ficha, i) => {
      const grupo = GruposPorKey.get(ficha.cat);
      const color = grupo ? grupo.color : '#9C6B2E';
      const label = grupo ? grupo.label : ficha.cat;

      const el = document.createElement('div');
      el.className = `ficha${i === 0 ? ' on' : ''}`;
      el.innerHTML =
        `<div class="ficha-top"><span class="ficha-id">FICHA N.º ${ficha.id} · de ${Config.totalLugares}</span>` +
        `<span class="ficha-cat" style="background:${color}">${label}</span></div>` +
        `<p class="ficha-name">${ficha.name}</p>` +
        `<p class="ficha-sub">${ficha.sub}</p>` +
        `<div class="ficha-foot"><div class="ficha-rating"><b>★ ${ficha.rating.toFixed(1)}</b><span>${ficha.count}</span></div>` +
        '<div class="ficha-seal"><svg viewBox="0 0 20 20" fill="none"><path d="M4 10.2L8 14.2L16 5.2" stroke="#6E4A1D" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>VERIFICADO</div></div>';
      stage.appendChild(el);

      // Fix (Hallazgo crítico "foco atrapado en elemento oculto para
      // lectores de pantalla"): #fichaStage es aria-hidden porque el
      // carrusel es decorativo, pero aria-hidden solo no siempre saca
      // del tabulado a estos botones. tabindex="-1" (no `inert` en el
      // contenedor) porque los dots deben seguir siendo clicleables
      // con mouse.
      const dot = document.createElement('button');
      dot.className = i === 0 ? 'on' : '';
      dot.setAttribute('aria-label', `Ver ficha ${i + 1}`);
      dot.tabIndex = -1;
      dots.appendChild(dot);
    });

    const fichaEls = stage.querySelectorAll('.ficha');
    const dotEls = dots.querySelectorAll('button');
    let current = 0;
    let timer = null;

    function show(next) {
      fichaEls[current].classList.remove('on');
      dotEls[current].classList.remove('on');
      current = next;
      fichaEls[current].classList.add('on');
      dotEls[current].classList.add('on');
    }
    function restart() {
      clearInterval(timer);
      if (Config.reduceMotion) return;
      timer = setInterval(() => show((current + 1) % fichaEls.length), Config.heroCarousel.intervalMs);
    }

    dotEls.forEach((dot, i) => dot.addEventListener('click', () => { show(i); restart(); }));
    restart();

    // Pausa al pasar el mouse o enfocar por teclado: deja leer una
    // ficha completa sin que el carrusel la cambie a mitad de lectura.
    const column = stage.parentElement;
    if (column) {
      column.addEventListener('mouseenter', () => clearInterval(timer));
      column.addEventListener('mouseleave', restart);
      column.addEventListener('focusin', () => clearInterval(timer));
      column.addEventListener('focusout', restart);
    }
  });

  /* ---- Hero: explorador por rubro ----
     Cada chip lleva href="#padron" y data-filtro="<rubro>". Este
     script corre antes de que UruSpotCore.init().initShell() llame a
     bindFiltroLinks(document), así que cuando eso pase, estos chips
     ya existen y quedan filtrando el mapa real como cualquier otro
     [data-filtro] del sitio. */
  define('rubroExplorer', () => {
    const cont = document.getElementById('rubroExplorer');
    if (!cont) return;
    cont.innerHTML = GruposPorPopularidad.map((g) =>
      `<a class="rubro-chip" href="#padron" data-filtro="${g.key}" style="--rc:${g.color}" aria-label="Ver ${g.label} en el mapa (${g.count} lugares)">` +
      '<span class="rc-dot" aria-hidden="true"></span>' +
      `<span aria-hidden="true">${g.icon}</span>${g.label} ` +
      `<span class="rc-count">${g.count}</span></a>`
    ).join('');
  });

  /* ---- Manifiesto: desglose numérico ---- */
  define('manifestBreakdown', () => {
    const el = document.getElementById('breakdown');
    if (!el) return;
    el.innerHTML = ''; // reemplaza el HTML estático (SEO) por el generado dinámicamente
    const fragment = document.createDocumentFragment();
    GruposPorPopularidad.forEach((g) => {
      const item = document.createElement('div');
      item.className = 'bd-item';
      item.innerHTML = `<div class="bd-num" style="color:${g.textColor || g.color}">${g.count}</div><div class="bd-label">${g.label}</div>`;
      fragment.appendChild(item);
    });
    el.appendChild(fragment);
  });

  /* ---- Manifiesto: barra apilada "los mismos 862, en una sola barra" ----
     Reutiliza Data.GRUPOS y Config.totalLugares: ningún número nuevo,
     ninguna llamada a red, ningún recálculo distinto al que ya hace
     manifestBreakdown con los mismos datos. */
  define('manifestBars', () => {
    const track = document.getElementById('mbTrack');
    if (!track) return;
    const curioso = document.getElementById('mbCurioso');

    const fragment = document.createDocumentFragment();
    GruposPorPopularidad.forEach((g) => {
      const pct = Format.percent(g.count, Config.totalLugares);
      const seg = document.createElement('div');
      seg.className = 'mb-seg';
      seg.style.width = `${pct}%`;
      seg.style.background = g.textColor || g.color;
      seg.setAttribute('data-tip', `${g.label} — ${g.count} fichas (${pct.toFixed(1).replace('.', ',')}%)`);
      fragment.appendChild(seg);
    });
    track.appendChild(fragment);

    // Dato curioso, calculado sobre los mismos 13 números de arriba:
    // si el padrón crece o algún rubro cambia de tamaño relativo, este
    // texto se recalcula solo.
    if (curioso) {
      const mayor = GruposPorPopularidad[0];
      const menor = GruposPorPopularidad[GruposPorPopularidad.length - 1];
      const veces = Math.round(mayor.count / menor.count);
      const pctMayor = Format.percent(mayor.count, Config.totalLugares).toFixed(1).replace('.', ',');
      curioso.innerHTML =
        `<b>${mayor.label}</b> es el rubro más grande del padrón (${pctMayor}% de las ${Config.totalLugares} fichas) — ` +
        `${veces} veces más que <b>${menor.label}</b>, el más chico, con apenas ${menor.count}.`;
    }
  });

  /* ---- "Un día cualquiera" ---- */
  define('dayGrid', () => {
    const el = document.getElementById('dayGrid');
    if (!el) return;
    el.innerHTML = ''; // reemplaza el HTML estático (SEO) por el generado dinámicamente
    const fragment = document.createDocumentFragment();
    Data.DIA.forEach((slot) => {
      const a = document.createElement('a');
      a.className = 'day-card';
      a.href = slot.href;
      a.innerHTML =
        `<span class="day-tag" style="background:${slot.color}"></span>` +
        `<span class="day-time">${slot.time}</span><p class="scn">${slot.text}</p>` +
        `<span class="day-cta">Ver la guía ${Format.arrowIcon()}</span>`;
      fragment.appendChild(a);
    });
    el.appendChild(fragment);
  });

  /* ---- Fichas destacadas ---- */
  define('featuredCards', () => {
    const el = document.getElementById('fichasGrid');
    if (!el) return;
    el.innerHTML = ''; // reemplaza el HTML estático (SEO) por el generado dinámicamente (incluye estado real de favoritos)
    const fragment = document.createDocumentFragment();

    Data.FICHAS_DESTACADAS.forEach((ficha, idx) => {
      const id = `destacada-${idx}`;
      const favored = Favorites.has(id);
      const card = document.createElement('div');
      card.className = 'fcard';
      card.innerHTML =
        `<div class="fcard-top"><span class="fcard-tag" style="background:${ficha.color}">${ficha.cat}</span></div>` +
        `<h3>${ficha.name}</h3>` +
        `<p class="fc-meta">${ficha.count.toLocaleString('es-AR')} reseñas verificadas</p>` +
        `<div class="fcard-foot"><span class="fcard-rating">★ ${ficha.rating.toFixed(1)}</span>` +
        '<div class="fcard-actions">' +
        `<button class="reg-heart fcard-link${favored ? ' on' : ''}" data-favid="${id}" aria-label="Guardar ${ficha.name}">${Format.heartIcon(favored)}</button>` +
        `<a class="fcard-link" href="locales/${ficha.slug}/" aria-label="Ver ficha de ${ficha.name}">${Format.arrowIcon()}</a>` +
        '</div></div>';
      fragment.appendChild(card);
    });
    el.appendChild(fragment);

    el.querySelectorAll('.reg-heart').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-favid');
        const isNowFavored = Favorites.toggle(id);
        btn.classList.toggle('on', isNowFavored);
        btn.innerHTML = Format.heartIcon(isNowFavored);
        // Reinicio forzado de la animación de "bump": remover la clase,
        // forzar un reflow leyendo offsetWidth, y volver a agregarla.
        btn.classList.remove('bump');
        void btn.offsetWidth;
        btn.classList.add('bump');
        SavedFichas.render();
      });
    });
  });

  /* ---- Panel "Fichas guardadas" ---- */
  define('savedFichasPanel', () => {
    const favNavBtn = document.getElementById('favNavBtn');
    if (favNavBtn) {
      favNavBtn.addEventListener('click', () => {
        const section = document.getElementById('guardadas');
        section.classList.add('show');
        SavedFichas.render();
        section.scrollIntoView({ behavior: Format.smoothOrAuto(), block: 'start' });
      });
    }
    Favorites.refreshBadge();
    SavedFichas.render();
  });

  /* ---- CTAs del hero/nav hacia el padrón ---- */
  define('heroCtas', () => {
    ['heroBtn', 'heroBtnNav'].forEach((id) => {
      const btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', () => scrollToId('padron'));
    });
  });

  /* ---- Google Fonts: reclasificación media="print" → "all" ----
     Fix (Hallazgo A): antes iba como atributo HTML inline
     (onload="this.media='all'"). Si en el futuro se activa una CSP sin
     'unsafe-inline' (CSP Level 3, práctica estándar contra XSS), ese
     atributo se bloquea en silencio. Un listener JS externo no
     depende de 'unsafe-inline' y es CSP-safe. */
  define('googleFontsUpgrade', () => {
    const link = document.getElementById('gfontsLink');
    if (!link || link.media === 'all') return; // ya cargó (navegador rápido o caché)

    let applied = false;
    function applyFont() {
      if (applied) return;
      applied = true;
      link.media = 'all';
    }
    link.addEventListener('load', applyFont);
    // Salvaguarda: si 'load' no dispara (algunos navegadores viejos con
    // media='print' no lo emiten de forma confiable), se fuerza igual
    // tras un tiempo prudencial para no perder la tipografía nunca.
    setTimeout(applyFont, Config.fonts.fallbackTimeoutMs);
  });

  /* ---- Preconnect diferido al mapa ----
     Los preconnect a cdnjs.cloudflare.com y a los 4 subdominios de
     tiles (a/b/c/d.basemaps.cartocdn.com) no van en el <head>: una
     conexión preconectada ahí puede cerrarse por inactividad (~10s
     típico en Chrome) antes de que el usuario llegue a #mapa. Este
     módulo abre esas conexiones cuando #mapa-wrap está a 600px de
     entrar en viewport.
     Fix (Hallazgo D): los 4 subdominios de tiles reciben el mismo
     tratamiento — antes solo a.basemaps.cartocdn.com se sumaba al
     preconnect diferido junto con cdnjs, mientras b/c/d solo recibían
     dns-prefetch inmediato en el <head>; si CartoDB reparte los tiles
     en round-robin entre los 4, no hay razón para tratarlos distinto. */
  define('mapaPreconnect', () => {
    const HOSTS = [
      'https://cdnjs.cloudflare.com',
      'https://a.basemaps.cartocdn.com',
      'https://b.basemaps.cartocdn.com',
      'https://c.basemaps.cartocdn.com',
      'https://d.basemaps.cartocdn.com'
    ];
    let done = false;
    function connect() {
      if (done) return;
      done = true;
      const fragment = document.createDocumentFragment();
      HOSTS.forEach((href) => {
        const link = document.createElement('link');
        link.rel = 'preconnect';
        link.href = href;
        link.crossOrigin = '';
        fragment.appendChild(link);
      });
      document.head.appendChild(fragment);
    }

    const mapaWrap = document.getElementById('mapa-wrap');
    if (!mapaWrap || !('IntersectionObserver' in window)) { connect(); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => { if (entry.isIntersecting) { connect(); io.disconnect(); } });
    }, { rootMargin: Config.mapaPreconnect.rootMargin });
    io.observe(mapaWrap);
  });

  /* ---- Foco atrapado durante el intro ----
     #intro cubre toda la pantalla durante ~1.5s pero, sin esto, un
     usuario de teclado o lector de pantalla podía tabular hacia los
     enlaces del nav o el botón de favoritos, visualmente debajo del
     overlay pero seguían en el árbol de accesibilidad y en el orden de
     tabulación (viola WCAG 2.4.3). `inert` saca de la navegación por
     teclado y del árbol de accesibilidad a todo el contenido detrás
     del overlay mientras esté activo. */
  define('introFocusTrap', (context) => {
    const intro = context?.introOverlay?.intro;
    if (!intro) return; // reduceMotion ya removió el intro, o no existe

    const supportsInert = 'inert' in HTMLElement.prototype || 'inert' in document.createElement('div');
    if (!supportsInert) return;

    const mainContent = document.querySelectorAll('body > :not(#intro):not(#progress)');
    function setInert(state) {
      mainContent.forEach((el) => {
        if ('inert' in el) el.inert = state;
        else if (state) el.setAttribute('aria-hidden', 'true');
        else el.removeAttribute('aria-hidden');
      });
    }

    setInert(true);
    const release = () => setInert(false);
    // Se libera junto con el mismo ciclo de vida del intro: al terminar
    // la animación de salida o por el timeout de seguridad, lo que
    // ocurra primero.
    setTimeout(release, Config.intro.focusReleaseDelayMs);
    window.addEventListener('load', () => setTimeout(release, Config.intro.focusPostLoadDelayMs));
  });

  /* ================================================================
   * BOOTSTRAP — enciende los módulos en el mismo orden en que corrían
   * originalmente (el orden importa: p. ej. anchorSmoothScroll debe
   * tomar su snapshot de anclas antes de que rubroExplorer agregue
   * sus chips). Un fallo en un módulo se aísla y no interrumpe a los
   * siguientes — antes solo los bloques "build*" tenían ese resguardo.
   * ================================================================ */
  const results = Object.create(null);
  Modules.forEach((factory, name) => {
    try {
      results[name] = factory(results) || null;
    } catch (err) {
      if (window.console?.error) console.error(`[URU SPOT] Error en "${name}":`, err);
    }
  });

  /* ================================================================
   * CONTRATO EXTERNO — estos cuatro nombres son consumidos por el
   * resto del bundle (features aditivas del sitio). Se publican
   * explícitamente en window para que ese contrato sea real, en vez
   * de depender de que dos scripts compartan por accidente el mismo
   * scope de variables `var`.
   * ================================================================ */
  window.GRUPOS = Data.GRUPOS;
  window.alMotorListo = MotorGateway.alMotorListo;
  window.getFavs = Favorites.list;
  window.ALL_FAVABLE = FavorablePlaces.registry;
})(window, document);