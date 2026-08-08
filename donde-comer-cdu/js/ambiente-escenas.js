/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-escenas.js
   Fase 2: Scene Manager (Arquitectura técnica, Cap. 3.3, 6.2)

   Subsistema del Grupo de Orquestación. Responsabilidad única: mantener
   el catálogo de escenas definidas (Cap. 6.1), gestionar su ciclo de vida
   completo (creación, carga, activación, mezcla, reemplazo y destrucción)
   y determinar, en conjunto con el State Manager, qué escena corresponde
   al contexto actual.

   Reglas de este documento que este módulo respeta explícitamente:
   - Cap. 3.3 — no contiene lógica de animación ni de renderizado. Una
     escena, para el Scene Manager, es exclusivamente una estructura de
     configuración.
   - Cap. 6.2 — carga en dos fases: (1) resolución (obtener definición
     de Config, verificar assets en Registry); (2) activación (entregar
     configuración resuelta al Motion Controller).
   - Cap. 6.2 — si la fase de resolución falla, mantiene la escena
     anterior y registra en Diagnostics, nunca activa parcialmente.
   - Cap. 3.3 — no decide qué escena corresponde al estado actual; eso es
     una relación gestionada en conjunto con State Manager a través del
     Ambient Engine.
   - Cap. 11.4 — este módulo NUNCA es importado desde fuera de la carpeta
     del Ambient Engine. Solo se comunica a través del Ambient Engine
     (raíz orquestadora).

   Debe cargarse después de ambiente-config.js, ambiente-assets.js y
   ambiente-movimiento.js, y antes de ambiente-orquestador.js.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  function config() { return global.AmbienteConfig || null; }
  function assets() { return global.AmbienteAssets || null; }
  function movimiento() { return global.AmbienteMovimiento || null; }
  function diagnostico() { return global.AmbienteDiagnostico || null; }

  var escenaActualId = null;
  var escenaPendienteId = null;

  // Cap. 6.2: Fase 1 — Resolución. Verifica que todos los assets
  // requeridos por una escena estén disponibles o puedan cargarse a tiempo.
  function validarDisponibilidadAssets(escena) {
    var a = assets();
    if (!a || !escena) return false;

    // Por ahora, todas las escenas son definidas en el catálogo (no hay
    // assets dinámicos). Esta función es un punto de extensión para
    // cuando existan assets por escena (por ejemplo, texturas específicas
    // de una escena estacional futura).
    // Cap. 8.1: si en el futuro hay assets diferidos, se verificarían acá.
    return true;
  }

  // Cap. 6.2: Fase 1 — Resolución completa. Obtiene escena de Config,
  // verifica assets, devuelve escena o falla con log en Diagnostics.
  function resolver(id) {
    var c = config();
    if (!c) return null;

    var escena = c.obtenerEscena(id) || c.obtenerEscena(c.ESCENA_INICIAL);
    if (!escena) {
      var d = diagnostico();
      if (d) d.registrar('escenas', 'resolver() falló: escena ' + id + ' no existe');
      return null;
    }

    if (!validarDisponibilidadAssets(escena)) {
      var d = diagnostico();
      if (d) d.registrar('escenas', 'resolver() falló: assets no disponibles para escena ' + id);
      return null;
    }

    return escena;
  }

  // Cap. 6.2: Fase 2 — Activación. Entrega configuración resuelta al
  // Motion Controller, que es quien la convierte en parámetros de
  // movimiento. Aquí es donde se cierra el ciclo de carga de una escena.
  function activar(id) {
    var escenaResuelta = resolver(id);
    if (!escenaResuelta) {
      // Mantener escena anterior (Cap. 6.2)
      return false;
    }

    escenaActualId = id;
    escenaPendienteId = null;

    var m = movimiento();
    if (m) m.setEscena(id);

    return true;
  }

  var api = {
    // Obtener la escena actualmente activa (ID únicamente)
    obtenerActual: function () { return escenaActualId; },

    // Obtener la escena que está en proceso de activación (si hay)
    obtenerPendiente: function () { return escenaPendienteId; },

    // Activar una escena nueva (Cap. 6.2: resolución + activación)
    // Solo el Ambient Engine debe llamar a esto.
    // Devuelve true si tuvo éxito, false si falló y se mantuvo la anterior.
    activar: function (id) {
      if (id === escenaActualId) return true; // idempotente
      if (id === escenaPendienteId) return true; // ya está en cola

      escenaPendienteId = id;
      return activar(id);
    },

    // Obtener la configuración completa de una escena por ID
    // (Cap. 3.3: el Scene Manager no "conoce" la lógica de animación,
    // pero sí expone la configuración que define una escena)
    obtenerConfiguracion: function (id) {
      var c = config();
      if (!c) return null;
      return c.obtenerEscena(id);
    },

    // Inicializar con la escena inicial
    iniciar: function () {
      var c = config();
      if (!c) return;
      escenaActualId = c.ESCENA_INICIAL;
      activar(escenaActualId);
    }
  };

  global.AmbienteEscenas = api;

})(window);

