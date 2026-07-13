/* ═══════════════════════════════════════════════════════════════════════
 * URU SPOT — MÓDULO B (CONTENIDO) · content.js
 * Datos de la ciudad (GRUPOS), metadatos SEO/JSON-LD e inicialización del
 * motor. No contiene lógica de mapa/filtros/favoritos: eso vive en
 * core-engine.js (MÓDULO A).
 *
 * [ARQUITECTURA — auditoría hero/footer estático] El hero y el footer
 * dejaron de construirse acá: son copy 100% estática (sin ninguna
 * dependencia del dataset de lugares) y ahora viven directamente en
 * index.html, presentes desde el primer byte del documento en vez de
 * esperar a que termine de ejecutar toda la cadena de <script defer>
 * (Leaflet → MarkerCluster → core-engine → content). Los IDs dinámicos
 * que necesitaban (#hero-total-lugares, #stat-total-lugares,
 * #stat-total-categorias, #cats-container, y los [data-filtro] del
 * footer) siguen siendo completados/enganchados por core-engine.js
 * exactamente igual que antes — ese archivo ya los trataba como
 * opcionales y los busca por id/atributo en el momento de init(), sin
 * importar si el nodo lo creó el parser HTML o un script. Ningún cambio
 * fue necesario en core-engine.js.
 *
 * Fuente de los datos: extraídos de index.backup y lugares-mapa.json
 * (versión anterior funcional de esta misma sección), no inventados.
 * ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────
  // GRUPOS — taxonomía de categorías (13), tal como vivía en index.backup.
  // Paleta verificada con contraste AA (ver nota de auditoría en core.css).
  // ─────────────────────────────────────────────────────────────────────
  var GRUPOS = {
    gastronomia: { color: '#AD1E1E', label: 'Gastronomía', icon: '🍽️', desc: 'Restaurantes, parrillas, bares, cafeterías, panaderías, heladerías y pizzerías.' },
    patrimonio:  { color: '#9C681B', label: 'Patrimonio',  icon: '🏛️', desc: 'Museos, plazas, iglesias, centros culturales y edificios históricos.' },
    naturaleza:  { color: '#3A8216', label: 'Naturaleza',  icon: '🌊', desc: 'Balnearios, islas, parques y la costanera del río Uruguay.' },
    alojamiento: { color: '#1E57AD', label: 'Alojamiento', icon: '🏨', desc: 'Hoteles, hosterías, cabañas, hostels y apart hotels.' },
    mascotas:    { color: '#168241', label: 'Mascotas',    icon: '🐾', desc: 'Veterinarias y pet shops para el cuidado de tus compañeros.' },
    salud:       { color: '#168282', label: 'Salud',       icon: '🏥', desc: 'Farmacias, clínicas, laboratorios y profesionales de la salud.' },
    finanzas:    { color: '#3B1EAD', label: 'Finanzas',    icon: '🏦', desc: 'Bancos, seguros, abogados, escribanías e inmobiliarias.' },
    compras:     { color: '#657915', label: 'Compras',     icon: '🛒', desc: 'Supermercados, ferreterías, indumentaria y comercios de todo tipo.' },
    deporte:     { color: '#901EAD', label: 'Deporte',     icon: '💪', desc: 'Gimnasios, clubes deportivos y espacios de entrenamiento.' },
    transporte:  { color: '#AD1E74', label: 'Transporte',  icon: '🚖', desc: 'Remiserías, talleres, estaciones de servicio y agencias de viaje.' },
    belleza:     { color: '#7A1EAD', label: 'Belleza',     icon: '💇', desc: 'Peluquerías, barberías y centros de estética.' },
    servicios_publicos: { color: '#AD5E1E', label: 'Servicios públicos', icon: '🏢', desc: 'Municipalidad, policía, correo, Registro Civil y más.' },
    educacion:   { color: '#1EAD8C', label: 'Educación',   icon: '🎓', desc: 'Universidades, institutos, escuelas y jardines de infantes.' }
  };

  // ─────────────────────────────────────────────────────────────────────
  // Metadatos de la página. Corrige dos problemas detectados en
  // index.backup: (1) la URL canónica apuntaba a una ruta vieja
  // ("/guia-concepcion-del-uruguay/") que no coincide con sitemap.xml
  // (la real es "/donde-comer-cdu/"); (2) el conteo de lugares en el
  // título/descripción estaba desactualizado (653 → 862 reales).
  // Si el dataset crece de forma significativa, actualizar el número acá.
  // ─────────────────────────────────────────────────────────────────────
  var CANONICAL_URL = 'https://uruspotcdu-create.github.io/uruspot/donde-comer-cdu/';
  var OG_IMAGE = 'https://uruspot.pages.dev/img/logof.webp';
  var TOTAL_LUGARES_APROX = 862;

  var PAGE_TITLE = `Guía completa de Concepción del Uruguay · ${TOTAL_LUGARES_APROX}+ lugares · URU SPOT`;
  var PAGE_DESCRIPTION = 'La guía urbana completa de Concepción del Uruguay: 13 categorías, cientos de lugares verificados contra Google Places, en un mapa interactivo con filtros por rubro y subcategoría.';

  function setMeta(id, attr, value) {
    var el = document.getElementById(id);
    if (!el) return;
    if (attr === 'text') el.textContent = value;
    else el.setAttribute(attr, value);
  }

  setMeta('doc-title', 'text', PAGE_TITLE);
  setMeta('doc-description', 'content', PAGE_DESCRIPTION);
  setMeta('doc-canonical', 'href', CANONICAL_URL);
  setMeta('og-title', 'content', PAGE_TITLE);
  setMeta('og-description', 'content', PAGE_DESCRIPTION);
  setMeta('og-image', 'content', OG_IMAGE);
  setMeta('twitter-title', 'content', PAGE_TITLE);
  setMeta('twitter-description', 'content', PAGE_DESCRIPTION);
  setMeta('twitter-image', 'content', OG_IMAGE);

  var ldJsonEl = document.getElementById('ld-json');
  if (ldJsonEl) {
    ldJsonEl.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: 'Guía de Concepción del Uruguay',
      description: PAGE_DESCRIPTION,
      url: CANONICAL_URL,
      inLanguage: 'es-AR',
      about: {
        '@type': 'City',
        name: 'Concepción del Uruguay',
        addressRegion: 'Entre Ríos',
        addressCountry: 'AR'
      }
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // HERO y FOOTER: ya NO se construyen acá. Su markup (misma copy, mismas
  // clases/IDs que antes) vive directamente en index.html — ver la nota
  // de arquitectura al inicio de este archivo. core-engine.js completa
  // los valores dinámicos (#hero-total-lugares, #stat-total-lugares,
  // #stat-total-categorias, #cats-container) y engancha los links
  // [data-filtro] del footer exactamente igual que cuando estos nodos
  // los creaba este script.
  // ─────────────────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────────────────
  // INIT — arranca el motor. "lugares" queda vacío a propósito: se usan
  // extraDataUrl/detailsDataUrl para que el propio Core haga fetch de los
  // datasets y los mezcle (ver cargarConExtra() en core-engine.js), en vez
  // de incrustar acá un array de 862 objetos a mano.
  //
  // [ARQUITECTURA — carga core/detalles] "lugares-mapa.json" (862 lugares,
  // 13 campos c/u) dejó de descargarse en el arranque. Se reemplaza por
  // dos archivos generados a partir de él con split_dataset.py:
  //   - extraDataUrl (lugares-core.json): id/nombre/categoria/grupo/lat/lng
  //     /rating — lo mínimo para pintar pines, contar filtros y que
  //     funcione la búsqueda. Es el único fetch que bloquea la interacción.
  //   - detailsDataUrl (lugares-detalles.json): direccion/descripcion/
  //     telefono/place_id — solo se usan dentro de un popup ya abierto, así
  //     que se piden en paralelo pero se aplican en segundo plano, sin
  //     retrasar un solo milisegundo el momento en que el mapa ya es
  //     interactivo. Si se edita lugares-mapa.json, correr
  //     "python3 split_dataset.py" antes de deployar para regenerar ambos.
  //
  // mapCenter/mapZoom/tileUrl/tileAttribution: mismos valores reales que
  // usaba el mapa Leaflet en index.backup (línea ~1726).
  // ─────────────────────────────────────────────────────────────────────
  if (window.UruSpotCore) {
    // [ARQUITECTURA — pasada "conectar el motor", 13/07/2026] Se guarda la
    // instancia devuelta por init() en window.uruSpotMotor: index.html trae
    // su propia sección "Fichas guardadas", que hasta ahora solo conocía
    // los ids de su vista previa curada (4 lugares por rubro) y no los 862
    // ids reales que el mapa recién habilita. Exponer el motor acá evita
    // que index.html necesite reimplementar getLugarPorId/todosLosMarkers
    // por su cuenta — reutiliza exactamente la misma fuente de datos.
    window.uruSpotMotor = window.UruSpotCore.init({
      grupos: GRUPOS,
      lugares: [],
      extraDataUrl: 'lugares-core.json',
      detailsDataUrl: 'lugares-detalles.json',
      mapCenter: [-32.4836, -58.2335],
      mapZoom: 13,
      tileUrl: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      tileAttribution: '&copy; OpenStreetMap &copy; CARTO',
      // [ARQUITECTURA — pasada "conectar el motor", 13/07/2026] index.html
      // ya trae su propio reveal-on-scroll y su propio scroll suave para
      // anclas internas en su <script> inline (intro/progreso/FAQ) — ver
      // la nota junto a este flag en core-engine.js/UruSpotCore.init().
      // Sin esto, el motor agregaría una segunda implementación de ambas
      // cosas, funcionalmente redundante.
      paginaConScrollPropio: true
    });
  }

})();
