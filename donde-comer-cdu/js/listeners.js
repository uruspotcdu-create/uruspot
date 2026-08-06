/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — listeners.js

   FASE 5 del Plan Maestro de Modularización (2026-08-06). Extraído de
   app.js §19 (Inicialización de Listeners y Eventos): el orquestador
   inicializarListeners() y todos los manejadores de eventos de UI que
   cablea (búsqueda, panel de descubrimiento, rubros, guardados, FAQ,
   ripple, supresión de vidrio en scroll, permanencia).

   Mismo criterio ya usado por render-engine.js/dom-painter.js/
   error-recovery.js (ADR-003 del plan): dependencias explícitas por
   parámetro, nada de `window.X`/globales de app.js asumidas adentro
   del módulo — salvo los globals de terceros que YA estaban gateados
   con `if`/`typeof` en el código original (window.Coreografias,
   window.AmbienteScheduler, CicloVida): se conservan tal cual, mismo
   gateo, para no cambiar comportamiento observable.

   `estado` y `motorMapa` viajan como getter/setter, no por valor —
   mismo motivo ya documentado en render-engine.js: ambos se reasignan
   en tiempo de ejecución después de que este módulo se construye (el
   `var Listeners = crearListeners(...)` corre al parsear app.js, antes
   de validarModulos()/init()), así que capturar el valor de una vez
   congelaría `estado` en su valor inicial (null) y `motorMapa` en null
   para siempre.

   `manejarClickSugerencias`, `manejarClickFiltrosActivos` (Sección 14,
   Fase 4 ya cerrada) e `inicializarScrollReveal` (Sección 22, Fase 6
   pendiente) NO se migran acá — inicializarListeners() los cablea pero
   viven fuera de este módulo; se reciben por parámetro tal cual, sin
   tocar su implementación.
   ═══════════════════════════════════════════════════════════════════ */

/**
 * @param {Object} deps
 * @param {Object} deps.DOM - referencias DOM reales de app.js
 * @param {Object} deps.uiState - instancia real de ui-state.js
 * @param {Object} deps.activeOperations - timers/operaciones async de app.js
 * @param {function():void} deps.render
 * @param {function(string):Object} deps.obtenerPorId - catalog.js
 * @param {function(Object):string} deps.slug - AppFormato.slug
 * @param {function():boolean} deps.hayBusquedaOFiltro
 * @param {function():Object} deps.leerFavoritos
 * @param {function(Object):void} deps.guardarFavoritos
 * @param {function():void} deps.actualizarContadorGuardados
 * @param {Object} deps.DomPainter - crearDomPainter(), para pintarRubros
 * @param {function():Object|null} deps.getEstado - lectura de `estado`
 * @param {function(Object):void} deps.setEstado - escritura de `estado`
 * @param {Object} deps.getPLANO - lectura de `PLANO` (motor-plano.js, resuelto en validarModulos())
 * @param {function():Object|null} deps.getMotorMapa - lectura de `motorMapa`
 * @param {function(Element):void} deps.programarRenderTrasSalida - app.js §17
 * @param {function():Array<Element>} [deps._elementosNavegablesDelPanel] - no usado, ver función propia abajo
 * @param {function(string):void} deps.seleccionarRubro - no se inyecta, se define acá (ver más abajo)
 * @param {Object} deps.RenderEngine - render-engine.js, para tickPermanencia
 * @param {function():string} deps.estadoActual - state-manager.js
 * @param {Object} deps.STATE - constants.js
 * @param {number} deps.PERMANENCIA_TICK_MS
 * @param {number} deps.DEBOUNCE_BUSQUEDA_MS
 * @param {number} deps.DEBOUNCE_FILTRO_MS
 * @param {function(MouseEvent):void} deps.manejarClickSugerencias - Sección 14, no migrada
 * @param {function(MouseEvent):void} deps.manejarClickFiltrosActivos - Sección 14, no migrada
 * @param {function():void} deps.inicializarScrollReveal - Sección 22, Fase 6 pendiente
 * @param {function():boolean} deps.prefiereMovimientoReducido - AppFormato.prefiereMovimientoReducido
 */
export function crearListeners(deps) {
  var DOM = deps.DOM;
  var uiState = deps.uiState;
  var activeOperations = deps.activeOperations;
  var render = deps.render;
  var obtenerPorId = deps.obtenerPorId;
  var slug = deps.slug;
  var hayBusquedaOFiltro = deps.hayBusquedaOFiltro;
  var leerFavoritos = deps.leerFavoritos;
  var guardarFavoritos = deps.guardarFavoritos;
  var actualizarContadorGuardados = deps.actualizarContadorGuardados;
  var DomPainter = deps.DomPainter;
  var getEstado = deps.getEstado;
  var setEstado = deps.setEstado;
  var getPLANO = deps.getPLANO;
  var getMotorMapa = deps.getMotorMapa;
  var programarRenderTrasSalida = deps.programarRenderTrasSalida;
  var RenderEngine = deps.RenderEngine;
  var estadoActual = deps.estadoActual;
  var STATE = deps.STATE;
  var PERMANENCIA_TICK_MS = deps.PERMANENCIA_TICK_MS;
  var DEBOUNCE_BUSQUEDA_MS = deps.DEBOUNCE_BUSQUEDA_MS;
  var DEBOUNCE_FILTRO_MS = deps.DEBOUNCE_FILTRO_MS;
  var manejarClickSugerencias = deps.manejarClickSugerencias;
  var manejarClickFiltrosActivos = deps.manejarClickFiltrosActivos;
  var inicializarScrollReveal = deps.inicializarScrollReveal;
  var prefiereMovimientoReducido = deps.prefiereMovimientoReducido;

  // Estado privado del módulo — antes vivía como `var` sueltas a nivel
  // de la IIFE de app.js, entre inicializarListeners() y
  // manejarScrollParaSupresionVidrio(). Sin cambios de comportamiento:
  // solo cambia de "closure de app.js" a "closure de listeners.js".
  var _scrollRafPendiente = false;
  var _scrollFinTimeout = null;
  var _scrollPausoAmbiente = false;

  /**
   * Todos los controles focuseables "principales" de las tarjetas
   * visibles, en orden de aparición — para la navegación por teclado
   * entre resultados (flechas arriba/abajo desde el buscador o entre
   * tarjetas). Toma el primer link/botón de cada tarjeta en vez de
   * todos los suyos: moverse "a la tarjeta siguiente" con una sola
   * tecla, no a su quinto botón interno.
   */
  function elementosNavegablesDelPanel() {
    if (!DOM.panelDescubrimiento) return [];
    var tarjetas = Array.prototype.slice.call(DOM.panelDescubrimiento.querySelectorAll('.tarjeta'));
    var focos = [];
    tarjetas.forEach(function (t) {
      var primero = t.querySelector('a.tarjeta-btn, button.tarjeta-btn, a, button');
      if (primero) focos.push(primero);
    });
    return focos;
  }

  /**
   * Muestra/oculta el botón de limpiar y mantiene aria-expanded del
   * input sincronizado con si hay una búsqueda/filtro gobernando el
   * panel de resultados ahora mismo.
   */
  function actualizarBotonLimpiar() {
    if (DOM.btnLimpiarBusqueda) {
      DOM.btnLimpiarBusqueda.hidden = !uiState.consultaActual;
    }
    if (DOM.inputBuscar) {
      DOM.inputBuscar.setAttribute('aria-expanded', hayBusquedaOFiltro() ? 'true' : 'false');
    }
  }

  /**
   * Limpia la búsqueda actual. Única función para las tres formas de
   * disparar la misma acción (botón interno del campo, acción del
   * estado vacío, y en el futuro cualquier otra): antes cada una
   * repetía su propia versión de estas cinco líneas por separado.
   */
  function limpiarBusqueda() {
    uiState.consultaActual = '';
    uiState.paginaTarjetas = 1;
    if (DOM.inputBuscar) {
      DOM.inputBuscar.value = '';
      DOM.inputBuscar.focus();
    }
    actualizarBotonLimpiar();
    setEstado(getPLANO().aplicarAccion(getEstado(), 'despejarBusqueda'));
    getPLANO().guardarEstado(getEstado());
    clearTimeout(activeOperations.debounceBuscarId);
    render();
  }

  function manejarScrollParaSupresionVidrio() {
    if (_scrollRafPendiente) return;
    _scrollRafPendiente = true;
    requestAnimationFrame(function () {
      _scrollRafPendiente = false;
      document.documentElement.classList.add('u-suprimir-vidrio');
      if (window.AmbienteScheduler && !_scrollPausoAmbiente) {
        _scrollPausoAmbiente = true;
        window.AmbienteScheduler.pausar();
      }
      if (_scrollFinTimeout) clearTimeout(_scrollFinTimeout);
      _scrollFinTimeout = setTimeout(function () {
        document.documentElement.classList.remove('u-suprimir-vidrio');
        if (_scrollPausoAmbiente) {
          _scrollPausoAmbiente = false;
          if (window.AmbienteScheduler) window.AmbienteScheduler.reanudar();
        }
      }, 150);
    });
  }

  function manejarInputBusqueda(e) {
    uiState.consultaActual = e.target.value;
    uiState.paginaTarjetas = 1;
    actualizarBotonLimpiar();

    if (uiState.consultaActual.trim().length >= 2) {
      setEstado(getPLANO().aplicarAccion(getEstado(), 'nombrar', { consulta: uiState.consultaActual }));
    } else {
      setEstado(getPLANO().aplicarAccion(getEstado(), 'despejarBusqueda'));
    }

    clearTimeout(activeOperations.debounceBuscarId);
    if (!uiState.consultaActual) {
      // Vaciar el campo es, en la cabeza de quien lo hace, un "deshacer":
      // debe sentirse instantáneo. El debounce existe para no recalcular
      // en cada tecla mientras se escribe, no para demorar el momento en
      // que alguien decide arrancar de nuevo.
      render();
      getPLANO().guardarEstado(getEstado());
    } else {
      activeOperations.debounceBuscarId = setTimeout(function () {
        render();
        getPLANO().guardarEstado(getEstado());
      }, DEBOUNCE_BUSQUEDA_MS);
    }
  }

  /**
   * Teclado desde el input: flecha abajo salta al primer resultado
   * (evita tener que Tabular uno por uno para llegar), Escape limpia
   * si hay texto. El resto (Enter, Tab) queda con su comportamiento
   * nativo — no hay nada que interceptar ahí.
   */
  function manejarKeydownBuscar(e) {
    if (e.key === 'ArrowDown') {
      var focos = elementosNavegablesDelPanel();
      if (focos.length) {
        e.preventDefault();
        focos[0].focus();
      }
    } else if (e.key === 'Escape' && uiState.consultaActual) {
      e.preventDefault();
      limpiarBusqueda();
    }
  }

  /**
   * Teclado dentro del panel de resultados: flechas arriba/abajo
   * recorren tarjetas (sin tener que Tabular por cada botón interno de
   * cada una), Escape vuelve al buscador. Delegado en el panel para
   * no atar un listener por tarjeta — el panel se repinta seguido.
   */
  function manejarKeydownPanel(e) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Escape') return;
    if (!e.target.closest('.tarjeta')) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      if (DOM.inputBuscar) DOM.inputBuscar.focus();
      return;
    }

    var focos = elementosNavegablesDelPanel();
    var idx = focos.indexOf(e.target);
    if (idx === -1) return;
    e.preventDefault();

    if (e.key === 'ArrowDown' && focos[idx + 1]) {
      focos[idx + 1].focus();
    } else if (e.key === 'ArrowUp') {
      if (focos[idx - 1]) {
        focos[idx - 1].focus();
      } else if (DOM.inputBuscar) {
        DOM.inputBuscar.focus();
      }
    }
  }

  function manejarClickPanel(e) {
    var btnAceptar = e.target.closest('[data-accion="aceptar"]');
    var btnRechazar = e.target.closest('[data-accion="rechazar"]');
    var btnGuardar = e.target.closest('[data-accion="guardar"]');
    var btnCompartir = e.target.closest('[data-accion="compartir"]');
    var btnCargarMas = e.target.closest('[data-accion="cargar-mas"]');
    var btnMasSugerenciasRecorte = e.target.closest('[data-accion="mas-sugerencias-recorte"]');
    var btnLimpiarBusqueda = e.target.closest('[data-accion="limpiar-busqueda"]');
    var btnLimpiarFiltro = e.target.closest('[data-accion="limpiar-filtro-rubro"]');
    var carta = e.target.closest('[data-lugar-id]');

    if (btnLimpiarBusqueda) {
      limpiarBusqueda();
      return;
    }

    if (btnLimpiarFiltro) {
      uiState.filtroRubroActivo = null;
      DomPainter.pintarRubros();
      render();
      return;
    }

    if (btnCompartir) {
      var cartaC = btnCompartir.closest('[data-lugar-id]');
      var lugarC = obtenerPorId(cartaC.dataset.lugarId);
      var urlFicha = window.location.origin + window.location.pathname.replace(/[^/]*$/, '') + 'locales/' + slug(lugarC) + '/';
      var payload = { title: lugarC.nombre + ' — URU SPOT', text: lugarC.categoria || '', url: urlFicha };

      if (navigator.share) {
        navigator.share(payload).catch(function () {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(urlFicha).then(function () {
          var txtOriginal = btnCompartir.innerHTML;
          btnCompartir.innerHTML = '✓';
          setTimeout(function () { btnCompartir.innerHTML = txtOriginal; }, 1600);
        });
      }
      return;
    }

    if (btnCargarMas) {
      uiState.paginaTarjetas++;
      render();
      return;
    }

    if (btnMasSugerenciasRecorte) {
      // Fase 4 — "Mostrar más" como nueva tanda real: a diferencia de
      // btnCargarMas (que solo avanza paginaTarjetas sobre una lista
      // que el motor YA calculó), este botón le pide a render() una
      // tanda NUEVA excluyendo todo lo mostrado hasta ahora — ver el
      // bloque de uiState.tandaRecorte dentro de render(). Si además
      // "Sorprendeme" está activo, cada tanda nueva es también una
      // sorpresa distinta a la anterior (sorpresaSeed avanza).
      uiState.pedirMasRecorte = true;
      if (uiState.sorprendemeActivo) uiState.sorpresaSeed++;
      render();
      return;
    }

    if (btnAceptar) {
      var id1 = btnAceptar.closest('[data-lugar-id]').dataset.lugarId;
      var porIniciativa = btnAceptar.dataset.origen === 'iniciativa_propia';
      var grupo1 = obtenerPorId(id1) ? obtenerPorId(id1).grupo : undefined;
      setEstado(getPLANO().aplicarAccion(getEstado(), 'aceptar', {
        lugarId: id1,
        porIniciativaPropia: porIniciativa,
        grupo: grupo1
      }));
      getPLANO().guardarEstado(getEstado());
      // Fase 4 (Motion Direction Bible v2.0, G.4.1): nunca bloquea ni
      // hace preventDefault del <a href> real hacia la ficha — solo
      // adelanta la escena ambiental y la claveAccion por slug antes
      // de que el navegador siga la navegación cross-document.
      if (window.Coreografias && obtenerPorId(id1)) {
        window.Coreografias.aperturaFicha(slug(obtenerPorId(id1)));
      }
      return;
    }

    if (btnRechazar) {
      var id2 = btnRechazar.closest('[data-lugar-id]').dataset.lugarId;
      var grupo = obtenerPorId(id2) ? obtenerPorId(id2).grupo : 'sin_rubro';
      setEstado(getPLANO().aplicarAccion(getEstado(), 'rechazar', { grupo: grupo }));
      getPLANO().guardarEstado(getEstado());
      programarRenderTrasSalida(btnRechazar.closest('[data-lugar-id]'));
      return;
    }

    if (btnGuardar) {
      var cartaG = btnGuardar.closest('[data-lugar-id]');
      var id3 = cartaG.dataset.lugarId;
      var favoritos = leerFavoritos();
      favoritos[id3] = !favoritos[id3];
      guardarFavoritos(favoritos);

      var quedoGuardado = !!favoritos[id3];
      setEstado(getPLANO().aplicarAccion(getEstado(), 'guardar', { lugarId: id3, guardado: quedoGuardado }));
      getPLANO().guardarEstado(getEstado());

      btnGuardar.classList.toggle('activo', quedoGuardado);
      btnGuardar.setAttribute('aria-pressed', String(quedoGuardado));
      btnGuardar.setAttribute('aria-label', quedoGuardado ? 'Quitar de guardados' : 'Guardar');
      btnGuardar.textContent = quedoGuardado ? '★ guardado' : '☆ guardar';
      actualizarContadorGuardados();

      var estadoActualObj = getEstado();
      if (estadoActualObj.sesion.curaduriaActiva && !quedoGuardado) {
        programarRenderTrasSalida(cartaG);
      }
      return;
    }

    var motorMapa = getMotorMapa();
    if (carta && motorMapa) {
      motorMapa.enfocar(carta.dataset.lugarId);
    }
  }

  function manejarHoverPanel(e) {
    var carta = e.target.closest('[data-lugar-id]');
    var motorMapa = getMotorMapa();
    if (carta && motorMapa) motorMapa.resaltar(carta.dataset.lugarId);
  }

  function manejarHoverOutPanel(e) {
    var carta = e.target.closest('[data-lugar-id]');
    var motorMapa = getMotorMapa();
    if (carta && motorMapa) motorMapa.quitarResaltado();
  }

  // PERF (auditoría performance, 2026-08-02): contraparte de la marca
  // .tarjeta--entrando que pintarTarjetas() agrega en la creación.
  // Delegado en DOM.panelDescubrimiento en vez de un listener por
  // tarjeta — 'animationend' burbujea, así que un único listener
  // alcanza para las hasta 8 tarjetas que puede haber por render.
  // Filtra por animationName porque el mismo elemento podría, en
  // teoría, tener más de una animación nombrada en el futuro y este
  // handler solo debe reaccionar a la de entrada (uru-fade-up).
  function manejarFinEntradaTarjeta(e) {
    if (e.animationName !== 'uru-fade-up') return;
    if (e.target && e.target.classList) {
      e.target.classList.remove('tarjeta--entrando');
    }
  }

  /**
   * Cap. 6 "Cambio de filtros" (Motion Direction Bible v1.0, pasos
   * 19-21): "los resultados que ya no cumplen el filtro se desvanecen
   * ANTES de que los nuevos se acerquen — nunca se superponen en el
   * mismo instante". Delega en Coreografias.cambioFiltro() la
   * coreografía real (ver Fase 4, Motion Direction Bible v2.0, Parte
   * K.10); fail-open a render() directo si coreografias.js no llegó a
   * cargar.
   */
  function renderConTransicionDeFiltro() {
    var existentes = DOM.panelDescubrimiento
      ? DOM.panelDescubrimiento.querySelectorAll('.tarjeta')
      : [];

    if (window.Coreografias) {
      window.Coreografias.cambioFiltro(existentes, render);
      return;
    }

    render();
  }

  /**
   * Selecciona (o deselecciona si ya estaba activo) un rubro como filtro.
   * Único punto de esta lógica — compartido entre el índice de rubros
   * (manejarClickRubros) y los atajos de "Empezá por acá"
   * (manejarClickSugerencias, Sección 14, no migrada — se le pasa esta
   * función por parámetro desde app.js igual que antes).
   */
  function seleccionarRubro(rubro) {
    uiState.filtroRubroActivo = (uiState.filtroRubroActivo === rubro) ? null : rubro;
    uiState.paginaTarjetas = 1;
    setEstado(getPLANO().aplicarAccion(getEstado(), 'salirCuraduria'));
    getPLANO().guardarEstado(getEstado());

    // El resaltado del chip es feedback inmediato: no espera al debounce.
    DomPainter.pintarRubros();

    clearTimeout(activeOperations.debounceFiltroId);
    activeOperations.debounceFiltroId = setTimeout(
      renderConTransicionDeFiltro,
      DEBOUNCE_FILTRO_MS
    );

    if (DOM.tituloRegion) {
      DOM.tituloRegion.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function manejarClickRubros(e) {
    var chip = e.target.closest('[data-rubro]');
    if (!chip) return;
    seleccionarRubro(chip.dataset.rubro);
  }

  function manejarClickVerGuardados() {
    setEstado(getPLANO().aplicarAccion(getEstado(), 'entrarCuraduria'));
    getPLANO().guardarEstado(getEstado());
    uiState.paginaTarjetas = 1;
    render();
    if (DOM.tituloRegion) {
      DOM.tituloRegion.setAttribute('tabindex', '-1');
      DOM.tituloRegion.focus({ preventScroll: false });
    }
  }

  function manejarClickFAQ(e) {
    var pregunta = e.target.closest('.faq-pregunta');
    if (!pregunta) return;
    var item = pregunta.closest('.faq-item');
    var abierta = pregunta.getAttribute('aria-expanded') === 'true';
    pregunta.setAttribute('aria-expanded', String(!abierta));
    item.classList.toggle('faq-item--abierta', !abierta);
  }

  function manejarPointerDownParaRipple(e) {
    if (prefiereMovimientoReducido()) return;
    var btn = e.target.closest('.btn');
    if (!btn) return;
    var rect = btn.getBoundingClientRect();
    var span = document.createElement('span');
    var lado = Math.max(rect.width, rect.height);
    span.className = 'btn__ripple';
    span.style.width = span.style.height = lado + 'px';
    span.style.left = (e.clientX - rect.left - lado / 2) + 'px';
    span.style.top = (e.clientY - rect.top - lado / 2) + 'px';
    btn.appendChild(span);
    span.addEventListener('animationend', function () { span.remove(); });
  }

  /**
   * Programa una tarea periódica vía CicloVida.programarTareaPeriodica
   * (js/ciclo-vida.js) si está disponible — pausa/reanuda de verdad con
   * la visibilidad de la pestaña. Fallback defensivo a setInterval
   * desnudo si CicloVida no llegó a cargar (mismo criterio que
   * window.Coreografias/window.AmbienteScheduler en el resto de este
   * módulo): degrada la funcionalidad, no rompe la inicialización.
   */
  function programarPeriodica(fn, ms) {
    if (typeof CicloVida !== 'undefined' && CicloVida && typeof CicloVida.programarTareaPeriodica === 'function') {
      return CicloVida.programarTareaPeriodica(fn, ms);
    }
    return setInterval(fn, ms);
  }

  function tickPermanencia() {
    if (estadoActual() !== STATE.READY) return;

    setEstado(getPLANO().aplicarAccion(getEstado(), 'permanecer', { segundos: 5 }));
    getPLANO().guardarEstado(getEstado());

    var regionNueva = getPLANO().region(getEstado()).nombre;
    if (regionNueva !== RenderEngine.obtenerCache().region) {
      render();
    }
  }

  function inicializar() {
    // Input de búsqueda
    if (DOM.inputBuscar) {
      DOM.inputBuscar.addEventListener('input', manejarInputBusqueda);
      DOM.inputBuscar.addEventListener('keydown', manejarKeydownBuscar);
    }

    // Botón de limpiar interno del campo
    if (DOM.btnLimpiarBusqueda) {
      DOM.btnLimpiarBusqueda.addEventListener('click', limpiarBusqueda);
    }

    // Acciones en panel de descubrimiento
    if (DOM.panelDescubrimiento) {
      DOM.panelDescubrimiento.addEventListener('click', manejarClickPanel);
      DOM.panelDescubrimiento.addEventListener('mouseover', manejarHoverPanel);
      DOM.panelDescubrimiento.addEventListener('mouseout', manejarHoverOutPanel);
      DOM.panelDescubrimiento.addEventListener('keydown', manejarKeydownPanel);
      // PERF (auditoría performance, 2026-08-02): un único listener
      // delegado para todas las tarjetas en vez de uno por tarjeta
      // (hasta 8 nuevas por render) — saca .tarjeta--entrando (ver
      // pintarTarjetas) apenas termina la animación real de entrada
      // de esa tarjeta puntual, devolviéndole su backdrop-filter.
      DOM.panelDescubrimiento.addEventListener('animationend', manejarFinEntradaTarjeta);
    }

    // Chips de rubro
    if (DOM.listaRubros) {
      DOM.listaRubros.addEventListener('click', manejarClickRubros);
    }

    // Botón "ver guardados"
    if (DOM.btnVerGuardados) {
      DOM.btnVerGuardados.addEventListener('click', manejarClickVerGuardados);
    }

    // FAQ accordion
    if (DOM.faqLista) {
      DOM.faqLista.addEventListener('click', manejarClickFAQ);
    }

    // Sugerencias rápidas ("Empezá por acá" + "cerca tuyo") y resumen de
    // filtros activos (píldoras con ×).
    if (DOM.sugerenciasRapidas) {
      DOM.sugerenciasRapidas.addEventListener('click', manejarClickSugerencias);
    }
    if (DOM.filtrosActivos) {
      DOM.filtrosActivos.addEventListener('click', manejarClickFiltrosActivos);
    }

    // Permanencia y sesión
    activeOperations.permanenciaTimer = programarPeriodica(tickPermanencia, PERMANENCIA_TICK_MS);

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        setEstado(getPLANO().aplicarAccion(getEstado(), 'abandonar'));
        getPLANO().guardarEstado(getEstado());
      }
    });

    window.addEventListener('pagehide', function () {
      setEstado(getPLANO().aplicarAccion(getEstado(), 'abandonar'));
      getPLANO().guardarEstado(getEstado());
    });

    // Ripple sutil en botones
    document.addEventListener('pointerdown', manejarPointerDownParaRipple);

    // Progressive enhancement: scroll reveal
    inicializarScrollReveal();

    // PERF (auditoría performance, C1.3): suprimir backdrop-filter
    // mientras el usuario scrollea.
    window.addEventListener('scroll', manejarScrollParaSupresionVidrio, { passive: true });
  }

  return {
    inicializar: inicializar,
    seleccionarRubro: seleccionarRubro,
    limpiarBusqueda: limpiarBusqueda,
    actualizarBotonLimpiar: actualizarBotonLimpiar,
    elementosNavegablesDelPanel: elementosNavegablesDelPanel,
    // Fase 5, §7: climate-context.js reusa este mismo helper para su
    // propio timer periódico (antes ambos vivían juntos en app.js,
    // como programarPeriodica()/activeOperations.permanenciaTimer y
    // .climaContextoTimer respectivamente).
    programarPeriodica: programarPeriodica,
    // exponer handlers individuales para poder testearlos sin togglear
    // addEventListener real (mismo criterio que dom-painter-tests.js:
    // llamar la función directo con un evento fake, no simular el DOM
    // real).
    _handlers: {
      manejarClickPanel: manejarClickPanel,
      manejarInputBusqueda: manejarInputBusqueda,
      manejarKeydownBuscar: manejarKeydownBuscar,
      manejarKeydownPanel: manejarKeydownPanel,
      manejarClickRubros: manejarClickRubros,
      manejarClickVerGuardados: manejarClickVerGuardados,
      manejarClickFAQ: manejarClickFAQ,
      manejarHoverPanel: manejarHoverPanel,
      manejarHoverOutPanel: manejarHoverOutPanel,
      manejarFinEntradaTarjeta: manejarFinEntradaTarjeta,
      manejarPointerDownParaRipple: manejarPointerDownParaRipple,
      manejarScrollParaSupresionVidrio: manejarScrollParaSupresionVidrio,
      tickPermanencia: tickPermanencia
    }
  };
}
