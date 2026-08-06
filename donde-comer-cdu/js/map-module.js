/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — map-module.js

   FASE 6 del Plan Maestro de Modularización (2026-08-06). Extraído de
   app.js §16 (Mapa y Visualización Espacial): inicializarMotorMapa(),
   actualizarMapaHerramienta(), actualizarMapaTextura() y
   resaltarTarjeta() — las cuatro funciones que hoy cablean
   motor-mapa.js (window.URU_MOTOR_MAPA_RENDER, el motor Canvas
   externo, sin tocar) con el DOM/estado del resto de la app. Mismo
   criterio ya usado por render-engine.js/dom-painter.js/listeners.js
   (ADR-003 del plan): dependencias explícitas por parámetro, nada de
   `DOM`/`uiState`/`MAPA` asumidos como globales dentro del módulo.

   NO migra acá (queda intacto en app.js): motor-mapa.js en sí (motor
   Canvas externo, ya es su propio módulo desde antes del Plan
   Maestro), ni la textura ambiental de fondo (mapa-textura.css/
   proyeccion.js). Este archivo es solo la capa de orquestación que
   antes vivía suelta en app.js.

   `motorMapa` (instancia lazy del motor Canvas) pasa a vivir DENTRO
   de este módulo, no en app.js — antes se leía desde listeners.js vía
   `getMotorMapa()` (un getter de app.js sobre una `var motorMapa`
   local). Ese mismo contrato se preserva: este módulo expone su
   propio `getMotorMapa()`, y app.js lo pasa a Listeners exactamente
   como pasaba el suyo (ver wiring en app.js, sección de construcción
   de `Listeners`). Nada cambia para listeners.js — no requirió tocar
   ese archivo.

   Dependencias inyectadas explícitamente:
     - DOM: objeto real de app.js (mapaHerramienta, mapaContainer,
       mapaInfo, mapaLeyenda, mapaTextura, panelDescubrimiento) — se
       pasa por referencia, no por valor: sus props se completan en
       validarDOM(), después de que este módulo ya fue construido.
     - getMAPA: función, no valor — MAPA (window.URU_MAPA) recién se
       resuelve en validarModulos(), después de construir este módulo
       (mismo motivo que getPLANO/getEstado en app.js/render-engine.js).
     - uiState: instancia real (cercaTuyoActivo, ubicacionUsuario).
     - obtenerRegistro: de catalog.js, mismo criterio que
       render-engine.js/dom-painter.js.
     - leerFavoritos: wrapper local de app.js sobre favorites.js.
     - DomPainter: instancia real, para pintarLeyenda() (Fase 4b).
     - cssEscape/slug: se pasan como `window.AppFormato.cssEscape`/
       `.slug` directamente (no como alias local `var cssEscape`/`var
       slug` de app.js) — este módulo se construye en el mismo punto
       del archivo que DomPainter, ANTES del bloque que asigna esos
       alias locales (ver nota idéntica en la cabecera de
       dom-painter.js).
     - MAPA_PADDING_GUIA_PX/MAPA_PADDING_EXPLORACION_PX: constantes,
       se pasan por valor (nunca se reasignan).

   Globales que el módulo sigue leyendo directo de `window` (mismo
   criterio que el código original en app.js — no es un descuido,
   varias de estas ya se leían así aun estando "dentro" de app.js):
   window.URU_MOTOR_MAPA_RENDER, window.AmbienteHalos,
   window.AmbienteCoordenadas, window.URU_RUBROS_META,
   window.URU_RUBROS_COLOR_RESUELTO, window.URU_CONFIG.

   AUDITORÍA (hallazgo, sin corregir — fuera de alcance de esta
   extracción): `actualizarTextura()` depende de `DOM.mapaTextura`,
   pero 'mapaTextura' nunca aparece ni en REQUIRED_DOM_IDS ni en
   OPTIONAL_DOM_IDS (ver app.js §"DOM references") — `DOM.mapaTextura`
   es siempre `undefined`, así que la función retorna en su primera
   línea en cada llamada real. Comportamiento preservado tal cual
   estaba en app.js (bug preexistente a este refactor, no introducido
   por él); documentado acá para quien quiera resolverlo en una pasada
   aparte.
   ═══════════════════════════════════════════════════════════════════ */

export function crearMapaModulo(deps) {
  var DOM = deps.DOM;
  var getMAPA = deps.getMAPA;
  var uiState = deps.uiState;
  var obtenerRegistro = deps.obtenerRegistro;
  var leerFavoritos = deps.leerFavoritos;
  var DomPainter = deps.DomPainter;
  var cssEscape = deps.cssEscape;
  var slug = deps.slug;
  var MAPA_PADDING_GUIA_PX = deps.MAPA_PADDING_GUIA_PX;
  var MAPA_PADDING_EXPLORACION_PX = deps.MAPA_PADDING_EXPLORACION_PX;

  // Motor de mapa (inicializado perezosamente) — antes vivía en app.js
  // como `var motorMapa`, ahora es estado interno de este módulo.
  var motorMapa = null;

  function getMotorMapa() { return motorMapa; }

  /**
   * Resalta una tarjeta visualmente.
   */
  function resaltarTarjeta(id, activo) {
    var previa = DOM.panelDescubrimiento.querySelector('.tarjeta--resaltada');
    if (previa) previa.classList.remove('tarjeta--resaltada');
    if (activo && id) {
      var el = DOM.panelDescubrimiento.querySelector('[data-lugar-id="' + cssEscape(id) + '"]');
      if (el) el.classList.add('tarjeta--resaltada');
    }
  }

  /**
   * Inicializa el motor de mapa (lazy init).
   */
  function inicializarMotorMapa() {
    if (motorMapa || !DOM.mapaHerramienta || !window.URU_MOTOR_MAPA_RENDER) return;

    try {
      motorMapa = window.URU_MOTOR_MAPA_RENDER.crear(DOM.mapaHerramienta, {
        lat: -32.4833,
        lng: -58.2333,
        zoom: 14,
        ariaLabel: 'Mapa de los resultados de tu búsqueda'
      });

      motorMapa.on('hover', function (punto) {
        resaltarTarjeta(punto.id, true);
        // Ambient Engine — familia Halos de posición (Cap. 6.1 del
        // documento de Lenguaje de Assets: reactividad "Sí, directo"
        // a hover/click). Mismo límite ya documentado para
        // Coordenadas: sin proyección real de lat/lng expuesta por
        // motor-mapa.js, se ancla al centro óptico del plano P3.
        if (window.AmbienteHalos) window.AmbienteHalos.mostrarEn(50, 50);
      });

      motorMapa.on('hoverOut', function () {
        resaltarTarjeta(null, false);
        if (window.AmbienteHalos) window.AmbienteHalos.ocultar();
      });

      motorMapa.on('click', function (punto) {
        var el = DOM.panelDescubrimiento.querySelector('[data-lugar-id="' + cssEscape(punto.id) + '"]');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        // Ambient Engine — familia Coordenadas (Cap. 6.1 del documento
        // de Lenguaje de Assets: "se activan cerca del punto elegido").
        // Este es el único evento real de "hay un punto seleccionado"
        // que el resto de la app expone hoy (motor-mapa.js no publica
        // lat/lng de pantalla ni un evento de deselección/cierre de
        // popup), así que se ancla al centro óptico del asset (Cap.
        // 3.1) en vez de a una posición geográfica real — mostrar el
        // marcador en el punto exacto de un mapa embebido en otra
        // sección de la página, sobre una capa de fondo a viewport
        // completo, no tendría correspondencia espacial real. Cablear
        // una posición geográfica real, si se decide que vale la pena,
        // requiere exponer esa proyección desde motor-mapa.js primero
        // (fuera del alcance del Ambient Engine, Cap. 3.12).
        if (window.AmbienteCoordenadas) window.AmbienteCoordenadas.mostrarEn(50, 50);
        if (window.AmbienteHalos) window.AmbienteHalos.mostrarEn(50, 50);
      });
    } catch (e) {
      console.error('Error al inicializar motor de mapa:', e);
      motorMapa = null;
    }
  }

  /**
   * Actualiza la herramienta del mapa según la rama y la lista.
   */
  function actualizarHerramienta(nombreRegion, lista) {
    if (!DOM.mapaHerramienta) return;

    var MAPA = getMAPA();

    // Fase 4 — MUST HAVE #4 (Fase 3A §2, Fase 3D §7): `nombreRegion`
    // ya llegaba como parámetro pero solo se usaba para decidir SI el
    // mapa aparece (MAPA.debeMostrarHerramienta), nunca CÓMO se ve —
    // Guía y Exploración eran visualmente idénticas salvo por la
    // cantidad de puntos, tal como documentaba la auditoría. Se
    // expone como data-attribute para que css/mapa.css decida el
    // tratamiento visual (protagonismo en Exploración) sin que este
    // archivo tenga que conocer esos detalles de estilo.
    if (DOM.mapaContainer) DOM.mapaContainer.dataset.region = nombreRegion || '';

    var debeMostrar = MAPA.debeMostrarHerramienta(nombreRegion, lista);

    if (!debeMostrar) {
      DOM.mapaHerramienta.hidden = true;
      if (DOM.mapaInfo) DOM.mapaInfo.hidden = true;
      if (DOM.mapaLeyenda) DOM.mapaLeyenda.hidden = true;
      if (DOM.mapaContainer) DOM.mapaContainer.hidden = true;
      return;
    }

    if (DOM.mapaContainer) DOM.mapaContainer.hidden = false;
    DOM.mapaHerramienta.hidden = false;
    if (DOM.mapaInfo) DOM.mapaInfo.hidden = false;

    inicializarMotorMapa();
    if (!motorMapa) return;

    var conCoordenadas = lista.filter(function (l) {
      return typeof l.lat === 'number' && typeof l.lng === 'number';
    });

    var recorte = MAPA.puntosHerramienta(conCoordenadas);
    // TIER 3.2 (Perf/UX, 2026-08-02): mismo leerFavoritos() cacheado
    // que ya usa pintarTarjetas() para la misma región — una sola
    // lectura de localStorage por render, no una por punto.
    var favoritosActivos = leerFavoritos();
    var puntos = recorte.map(function (l) {
      var meta = window.URU_RUBROS_META && window.URU_RUBROS_META[l.grupo];
      var slugL = slug(l);
      return {
        id: l.id,
        lat: l.lat,
        lng: l.lng,
        nombre: l.nombre,
        direccion: l.direccion,
        href: slugL ? 'locales/' + slugL + '/' : null,
        esFavorito: !!favoritosActivos[l.id],
        // Este punto viaja a motorMapa (Canvas): necesita el hex ya
        // resuelto, no el nombre del token (colorSeguro() en
        // motor-render.js valida contra un regex de hex — un
        // 'var(...)' ahí adentro cae en silencio al color por
        // defecto para TODOS los pines). window.URU_RUBROS_COLOR_RESUELTO
        // (rubros-meta.js) resuelve una sola vez por rubro y cachea.
        color: l.grupo && window.URU_RUBROS_COLOR_RESUELTO
          ? window.URU_RUBROS_COLOR_RESUELTO(l.grupo, '#C97A83')
          : '#C97A83',
        rubroNombre: meta ? meta[0] : l.categoria,
        rubroKey: l.grupo,
        rubroIcono: meta ? meta[3] : null
      };
    });

    motorMapa.establecerPuntos(puntos);
    motorMapa.encuadrarTodos(nombreRegion === 'exploracion' ? MAPA_PADDING_EXPLORACION_PX : MAPA_PADDING_GUIA_PX);
    // TIER 3.3 (Perf/UX, 2026-08-02): el marcador de "acá estás vos" no
    // depende de la región ni del recorte — solo de si el usuario
    // activó "cerca de mí" y compartió su ubicación. establecerPuntos()
    // ya no lo confunde con un resultado (ver motor-render.js): se
    // actualiza acá, en el mismo punto donde ya se actualiza el resto
    // del mapa en cada render().
    if (uiState.cercaTuyoActivo && uiState.ubicacionUsuario) {
      motorMapa.establecerMarcadorUsuario(uiState.ubicacionUsuario);
    } else {
      motorMapa.quitarMarcadorUsuario();
    }
    DomPainter.pintarLeyenda(puntos);

    if (DOM.mapaInfo) {
      DOM.mapaInfo.textContent = recorte.length < conCoordenadas.length
        ? 'Mostrando ' + recorte.length + ' de ' + conCoordenadas.length + ' lugares con ubicación en el mapa.'
        : recorte.length + ' lugar' + (recorte.length === 1 ? '' : 'es') + ' en el mapa.';
    }
  }

  /**
   * Actualiza la textura ambiental del mapa de fondo.
   */
  function actualizarTextura() {
    var MAPA = getMAPA();
    if (!DOM.mapaTextura || !obtenerRegistro().length) return;
    if (!window.URU_CONFIG.mapa.texturaSiempreVisible) return;
    if (DOM.mapaTextura.dataset.pintado === '1') return;

    var puntos = MAPA.puntosTextura(obtenerRegistro());
    var meta = window.URU_RUBROS_META || {};
    var frag = document.createDocumentFragment();
    var i = 0;

    puntos.forEach(function (l) {
      if (typeof l.lat !== 'number' || typeof l.lng !== 'number') return;
      var p = document.createElement('div');
      p.className = 'punto-textura';
      p.style.left = (Math.random() * 100) + '%';
      p.style.top = (Math.random() * 100) + '%';
      p.style.setProperty('--i', i);
      var colorRubro = meta[l.grupo] && meta[l.grupo][2];
      if (colorRubro) p.style.setProperty('--dot-color', colorRubro);
      i++;
      frag.appendChild(p);
    });

    DOM.mapaTextura.appendChild(frag);
    DOM.mapaTextura.dataset.pintado = '1';
  }

  return {
    actualizarHerramienta: actualizarHerramienta,
    actualizarTextura: actualizarTextura,
    getMotorMapa: getMotorMapa
  };
}
