/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — render-engine.js

   FASE 4a del Plan Maestro de Modularización (2026-08-06). Extraído
   de app.js §14 (Renderizado Principal): la mitad DECISORIA de
   render() — qué rama corresponde, qué lista mostrar, con qué opts,
   y si hubo cambio real respecto del render anterior. La mitad de
   PINTADO (actualizarCabecera, pintarTarjetas, actualizarMapaHerramienta,
   etc.) sigue en app.js — esa es la Fase 4 (dom-painter), todavía
   pendiente.

   RECUPERACIÓN (2026-08-06): el commit que dejó este import cableado
   en app.js ("Update app.js") nunca llegó a agregar este archivo —
   quedó un `import { crearRenderEngine } from './render-engine.js'`
   apuntando a un módulo inexistente, invisible en producción solo
   porque el sitio real corre app.min.js (bundle viejo, de antes de
   ese commit — ver P0-1 de ROADMAP.md) y no app.js fuente. Este
   archivo se reconstruyó a partir del diff exacto de ese commit (la
   lógica que se borró de adentro de render()), no es un rediseño:
   mismas 3 ramas, mismos bugfixes documentados inline, mismo
   contrato que app.js ya esperaba.

   Dependencias inyectadas explícitamente (ADR-003 del plan, mismo
   patrón que error-recovery.js/favorites.js) en vez de asumidas como
   globales de app.js:
     - obtenerEstado/obtenerPLANO/obtenerEXPO viajan como funciones,
       no por valor: `estado` se reasigna en cada acción del usuario
       (ver PLANO.guardarEstado en app.js), y PLANO/EXPO recién se
       resuelven en validarModulos(), después de que este RenderEngine
       ya fue construido — un valor capturado acá quedaría congelado
       en null o en la primera sesión.
     - uiState/ClimateContext: instancias reales (mismo criterio que
       el resto de los módulos ya extraídos), para que las lecturas/
       escrituras (uiState.tandaRecorte, uiState.pedirMasRecorte, etc.)
       actúen sobre el mismo objeto que usa el resto de app.js.
     - ramaActual/listaPorAccionExplicita/ordenarPorCercania/
       ramaDistinta: function declarations de app.js que no se
       migraron (dependen de DOM/estado interno más amplio) — se
       pasan por valor, son hoisted.

   Estado privado: la cache de renderizado anterior (antes
   `lastRenderCache` en app.js) vive acá adentro, expuesta solo vía
   obtenerCache() (lectura) y reiniciarCache() (reset, llamado desde
   limpiar() en app.js). obtenerCache() devuelve la MISMA referencia
   mutable en cada llamada (no una copia) — los 3 consumidores en
   app.js (cargarDetallesEnSegundoPlano, tickPermanencia,
   AppTelemetria, y la comparación de región en el manejador de
   PLANO) leen el valor más reciente sin necesitar un getter por
   campo.

   NOTA (paridad de comportamiento): reiniciarCache() solo resetea
   {lista, favoritos, region, rama, html} — no `paginaTarjetas`. Esto
   reproduce tal cual el reset original de limpiar() en app.js (que
   tampoco lo incluía), no es una omisión nueva. No se "corrige" acá
   porque el objetivo de esta fase es extracción con cero cambios de
   comportamiento — cualquier fix de ese detalle es una decisión
   aparte, fuera del alcance de Fase 4a.

   `html` se mantiene declarado pero sin escritor real, igual que en
   el objeto original (ver ARQUITECTURA_MAESTRO_APP.md §2.1-C:
   infraestructura de render diferencial nunca terminó de cablearse).

   @param {Object} deps
   @param {function():Array} deps.obtenerRegistro
   @param {function(Array):Object} deps.razonesPorLugarId
   @param {function(Array,Array):boolean} deps.hayCambioEnLista
   @param {*} deps.RAMA_CURADURIA
   @param {*} deps.RAMA_BUSCADOR
   @param {function():Object} deps.obtenerEstado
   @param {function():Object} deps.obtenerPLANO
   @param {function():Object} deps.obtenerEXPO
   @param {Object} deps.uiState - instancia real de uiState (ui-state.js)
   @param {Object} deps.ClimateContext - instancia real (climate-context.js)
   @param {function(Object):*} deps.ramaActual
   @param {function():Array} deps.listaPorAccionExplicita
   @param {function(Array):Array} deps.ordenarPorCercania
   @param {function(*):boolean} deps.ramaDistinta
   @param {function(...*):void} deps.debugLog
   ═══════════════════════════════════════════════════════════════════ */

export function crearRenderEngine(deps) {
  var obtenerRegistro = deps.obtenerRegistro;
  var razonesPorLugarId = deps.razonesPorLugarId;
  var hayCambioEnLista = deps.hayCambioEnLista;
  var RAMA_CURADURIA = deps.RAMA_CURADURIA;
  var RAMA_BUSCADOR = deps.RAMA_BUSCADOR;
  var obtenerEstado = deps.obtenerEstado;
  var obtenerPLANO = deps.obtenerPLANO;
  var obtenerEXPO = deps.obtenerEXPO;
  var uiState = deps.uiState;
  var ClimateContext = deps.ClimateContext;
  var ramaActual = deps.ramaActual;
  var listaPorAccionExplicita = deps.listaPorAccionExplicita;
  var ordenarPorCercania = deps.ordenarPorCercania;
  var ramaDistinta = deps.ramaDistinta;
  var debugLog = deps.debugLog;

  // Cache de renderizado anterior — antes `lastRenderCache` en app.js.
  var cache = {
    lista: null,
    favoritos: null,
    region: null,
    rama: null,
    html: null,
    // BUGFIX (auditoría performance, 2026-07-30): sin este campo,
    // "Cargar más" no repinta nunca (paginaTarjetas nunca formaba
    // parte de la detección de cambios).
    paginaTarjetas: null
  };

  return {
    /**
     * Calcula qué mostrar (rama/lista/opts) para el render actual, y
     * detecta si hubo cambio real respecto del anterior. Devuelve
     * `null` exactamente en el mismo caso en que el render() original
     * hacía `return` temprano por "sin cambios" — el llamador
     * (app.js/render()) debe tratar `null` como "no hay nada que
     * pintar".
     */
    calcular: function (favoritos) {
      var estado = obtenerEstado();
      var PLANO = obtenerPLANO();
      var EXPO = obtenerEXPO();

      var reg = PLANO.region(estado);
      var rama = ramaActual(reg);
      var lista;
      var opts;

      // Determinar qué lista mostrar según la rama
      if (rama === RAMA_CURADURIA) {
        var idsGuardados = Object.keys(favoritos).filter(function (id) {
          return favoritos[id];
        });
        lista = EXPO.coleccionCurada(obtenerRegistro(), idsGuardados);
        lista = ordenarPorCercania(lista);
        opts = {
          origen: 'accion_explicita',
          narrativa: false,
          vacioTexto: 'Todavía no guardaste nada. Guardá un lugar y aparece acá.',
          // Comparador inline (Fase 4, evolutivo A→C, ver motor-comparacion.js):
          // Curaduría es "tu lista" — el lugar natural donde alguien
          // compara 2-3 cosas que ya eligió guardar, antes de decidir
          // cuál visitar. Se activa solo dentro de este rango de tamaño
          // (2-4, ver URU_COMPARACION.MAX_PARA_COMPARAR) — con más
          // guardados vuelve a ser una lista normal, comparar 8 cosas
          // a la vez no es comparar, es abrumar.
          comparacion: (window.URU_COMPARACION && window.URU_COMPARACION.esComparable(lista))
            ? window.URU_COMPARACION.comparar(lista, { ubicacion: uiState.ubicacionUsuario })
            : null
        };
      } else if (rama === RAMA_BUSCADOR) {
        lista = listaPorAccionExplicita();
        lista = ordenarPorCercania(lista);
        opts = { origen: 'accion_explicita', narrativa: false };
      } else {
        // Recorte por iniciativa propia (Guía/Exploración).
        // Fase 4 — MUST HAVE (Fase 3A §4/§10, Fase 3B §2, Fase 3D §7):
        // se usa la versión "explicada" en vez de recortePorIniciativaPropia()
        // — misma selección (mismo motor, mismos candidatos/score), pero
        // trae además la razón legible por lugar (razonesDesdeSeñales).
        // Una sola llamada al algoritmo de selección: se deriva la lista
        // Y el mapa de razones del mismo resultado, para no invocar
        // calcularRecorte() dos veces con el mismo estado.
        //
        // Fase 4 — conexión real de contexto.ubicacion/contexto.clima
        // (Fase 3D §4): antes se llamaba sin 4° parámetro, así que el
        // motor nunca recibía señal real de proximidad ni de clima —
        // aunque ya sabía puntuarlas. ubicacion sale de la geolocalización
        // que el usuario ya activó explícitamente ("Cerca de mí" —
        // uiState.ubicacionUsuario es null hasta que la otorga); clima
        // sale de climaContextoCache (ver actualizarClimaContexto()),
        // que puede seguir siendo null si el fetch a /weather todavía no
        // resolvió o falló — el motor ya trata null como "sin señal" en
        // ambos casos, así que esto es estrictamente aditivo.
        var contextoRecorte = {
          ubicacion: uiState.ubicacionUsuario || null,
          clima: ClimateContext.obtener()
        };

        // Fase 4 — filtro de rubro DENTRO del recorte curado (hallazgo
        // "el filtro de rubro abandona el recorte curado", ver
        // hayBusquedaTexto()/ramaActual() en app.js): el chip de rubro
        // ya no saca al usuario de Guía/Exploración hacia Acción
        // Directa — acota el universo que el motor evalúa, pero sigue
        // siendo una selección por iniciativa propia (con su score,
        // diversidad y razones, no un barrido crudo del catálogo).
        if (uiState.filtroRubroActivo) {
          contextoRecorte.rubro = uiState.filtroRubroActivo;
        }

        // Fase 4 — "Sorprendeme" (hallazgo "serendipia sin control
        // explícito"): pedido explícito del usuario, independiente de
        // qué región o rubro esté activo — ver manejarClickSugerencias
        // en app.js.
        if (uiState.sorprendemeActivo) {
          contextoRecorte.sorprendeme = true;
          contextoRecorte.sorpresaSeed = uiState.sorpresaSeed;
        }

        // Fase 4 — "Mostrar más" como nueva tanda real (hallazgo
        // "sigue siendo paginación simple, no una nueva tanda con
        // exclusión de lo ya visto"): una tanda queda identificada por
        // región + rubro + sorpresa — cambiar cualquiera de los tres
        // invalida lo acumulado (no tiene sentido excluir en
        // Exploración lo que se mostró en Guía, o excluir lo mostrado
        // sin rubro una vez que hay un rubro activo). `pedirMasRecorte`
        // (ver manejarClickPanel en app.js) es el único disparador real
        // de un fetch nuevo con exclusión; cualquier otro render() de
        // la misma tanda (guardar un favorito, tick de permanencia,
        // llegada del clima en segundo plano) reutiliza lo ya
        // calculado tal cual, sin pegarle otra tanda encima.
        var claveTanda = reg.nombre + '|' + (uiState.filtroRubroActivo || '') +
          '|' + (uiState.sorprendemeActivo ? 's' : '');
        var tandaVigente = (uiState.tandaRecorte && uiState.tandaRecorte.clave === claveTanda)
          ? uiState.tandaRecorte
          : null;
        var necesitaTandaNueva = !tandaVigente || uiState.pedirMasRecorte;

        if (necesitaTandaNueva) {
          if (uiState.pedirMasRecorte && tandaVigente) {
            contextoRecorte.excluirIds = tandaVigente.lista.map(function (l) { return l.id; });
          }
          var explicado = EXPO.recortePorIniciativaPropiaExplicado(obtenerRegistro(), estado, reg.nombre, contextoRecorte);
          var nuevaTanda = explicado.lugares.map(function (x) { return x.lugar; });
          var razonesNuevas = razonesPorLugarId(explicado.lugares);
          var listaBase = tandaVigente ? tandaVigente.lista : [];
          var razonesAcumuladas = {};
          if (tandaVigente) {
            Object.keys(tandaVigente.razones).forEach(function (id) { razonesAcumuladas[id] = tandaVigente.razones[id]; });
          }
          Object.keys(razonesNuevas).forEach(function (id) { razonesAcumuladas[id] = razonesNuevas[id]; });
          uiState.tandaRecorte = {
            clave: claveTanda,
            lista: listaBase.concat(nuevaTanda),
            razones: razonesAcumuladas,
            // El motor evalúa el universo YA acotado por rubro/exclusión
            // (candidatosEvaluados, ver motor-exposicion.js); si evaluó
            // más candidatos que los que entregó en esta tanda, hay
            // margen real para pedir otra — nunca se ofrece "más" sin
            // esa confirmación.
            hayMasCandidatos: explicado.candidatosEvaluados > nuevaTanda.length
          };
        }
        uiState.pedirMasRecorte = false;

        var tandaFinal = uiState.tandaRecorte;
        lista = ordenarPorCercania(tandaFinal.lista);
        opts = {
          origen: 'iniciativa_propia',
          narrativa: false,
          razones: tandaFinal.razones,
          hayMasSugerencias: !!tandaFinal.hayMasCandidatos
        };
      }

      // Verificar si hubo cambio real
      // BUGFIX (auditoría performance, 2026-07-30): esta condición solo miraba
      // la identidad de la RAMA y de la LISTA CANDIDATA COMPLETA (sin paginar).
      // "Cargar más" (uiState.paginaTarjetas++; render();) no cambia ni la
      // rama ni la lista candidata — solo cuántos ítems de esa misma lista
      // se muestran, un slice que ocurre adentro de pintarTarjetas().
      // Resultado sin este fix: hayoCambio daba `false`, entraba al
      // `return` de abajo, y pintarTarjetas() JAMÁS se ejecutaba — el botón
      // "Cargar más" no tenía ningún efecto visible.
      // PERF (auditoría performance, 2026-08-04, hallazgo 1.1): hayCambioEnLista()
      // es O(n) y se llamaba dos veces con exactamente los mismos
      // argumentos (cache.lista, lista) — una vez para hayoCambio, otra
      // para soloAvanzoPagina. Se calcula una sola vez y se reutiliza el
      // resultado en ambas condiciones.
      var listaHaCambiado = hayCambioEnLista(cache.lista, lista);
      var hayoCambio = ramaDistinta(rama) ||
        listaHaCambiado ||
        uiState.paginaTarjetas !== cache.paginaTarjetas;

      if (!hayoCambio && uiState.ultimaRamaRenderizada === rama) {
        debugLog('[Render] Sin cambios, saltando');
        return null;
      }

      // PERF (auditoría performance, 2026-08-03, hallazgo 1.2 — confirmado
      // con trace real: long task de 58.8ms causada por reconstruir TODO
      // el listado en cada "Cargar más", con hasta 33 animationend
      // disparándose en el mismo frame): si la ÚNICA razón de hayoCambio
      // es que avanzó la página (misma rama, misma lista candidata —
      // mismos ids en el mismo orden —, mismos favoritos), pintarTarjetas
      // puede agregar solo las tarjetas nuevas en vez de tirar y
      // reconstruir las que ya estaban pintadas. Se compara CONTRA el
      // estado previo (antes de pisarlo abajo), igual que ramaDistinta()
      // y hayCambioEnLista() un par de líneas más arriba.
      //
      // favoritos por referencia (no por valor): leerFavoritos() cachea
      // el mismo objeto entre llamadas (favoritosCache) y solo lo
      // reemplaza cuando algo realmente cambió (guardarFavoritos() o el
      // evento 'storage' entre pestañas) — comparar por === es
      // suficiente y evita una segunda pasada de diffing sobre el mapa
      // de favoritos completo en cada render.
      var soloAvanzoPagina = !ramaDistinta(rama) &&
        !listaHaCambiado &&
        favoritos === cache.favoritos &&
        cache.paginaTarjetas !== null &&
        uiState.paginaTarjetas > cache.paginaTarjetas;
      opts.soloAgregarNuevas = soloAvanzoPagina;

      // Fase 4 — MUST HAVE #3 (Fase 3C §3, Fase 3D §7): cache.region ya
      // se guardaba en cada render() pero nada lo comparaba contra el
      // valor anterior — era un dato escrito sin consumidor. Se captura
      // acá, ANTES de pisarlo un par de líneas más abajo, para poder
      // detectar un cambio real de región (guia ⇄ exploracion ⇄
      // accionDirecta ⇄ curaduria) y disparar una microseñal perceptible.
      // 'curaduria'/'buscador' no son nombres de región (son ramas
      // derivadas — ver ramaActual() en app.js), así que la comparación
      // es siempre región-contra-región, nunca región-contra-rama.
      var regionAnterior = cache.region;
      var huboCambioDeRegion = !!regionAnterior && regionAnterior !== reg.nombre;

      // BUGFIX (auditoría): capturar la rama del render ANTERIOR antes de
      // pisarla. uiState.ultimaRamaRenderizada se sobreescribe dos líneas
      // más abajo con el valor de `rama` del render ACTUAL — cualquier
      // comparación `rama === uiState.ultimaRamaRenderizada` hecha después
      // de esa asignación es una tautología (siempre true), sin importar
      // si la rama realmente cambió. `ramaAnterior` es el único consumidor
      // real de este valor previo, devuelto acá para que app.js/render()
      // restaure el scroll solo cuando corresponde.
      var ramaAnterior = uiState.ultimaRamaRenderizada;

      // Actualizar cache
      cache.lista = lista;
      cache.rama = rama;
      cache.favoritos = favoritos;
      cache.region = reg.nombre;
      cache.paginaTarjetas = uiState.paginaTarjetas;
      uiState.ultimaRamaRenderizada = rama;

      return {
        reg: reg,
        rama: rama,
        lista: lista,
        opts: opts,
        huboCambioDeRegion: huboCambioDeRegion,
        ramaAnterior: ramaAnterior
      };
    },

    /**
     * Expone la cache de renderizado anterior — reemplazo directo de
     * `lastRenderCache` para sus 3 consumidores externos en app.js
     * (cargarDetallesEnSegundoPlano, tickPermanencia/AppTelemetria vía
     * obtenerCacheRender, y la comparación de región nueva en el
     * manejador de PLANO). Devuelve la MISMA referencia mutable, no
     * una copia — mismo comportamiento que leer `lastRenderCache`
     * directo tenía antes de esta extracción.
     */
    obtenerCache: function () {
      return cache;
    },

    /**
     * Resetea la cache — llamado desde limpiar() en app.js. Ver nota
     * de cabecera: no incluye `paginaTarjetas`, a propósito, para
     * mantener paridad exacta con el reset original.
     */
    reiniciarCache: function () {
      cache.lista = null;
      cache.favoritos = null;
      cache.region = null;
      cache.rama = null;
      cache.html = null;
    }
  };
}

