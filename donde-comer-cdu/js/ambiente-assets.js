/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-assets.js
   Fase 2: Asset Registry (Arquitectura técnica, Cap. 3.13 / 8.1-8.3 / 8.6)

   Subsistema del Grupo de Infraestructura. Responsabilidad única:
   centralizar el acceso a los assets conceptuales del sistema (Cap.
   3.13) detrás de una caché de dos niveles (Cap. 8.3). No contiene
   lógica de comportamiento ni de decisión visual — es un catálogo
   consultable, no un motor de decisión.

   Reglas de este documento que este módulo respeta explícitamente:
   - Cap. 3.13 — "nunca debe conocer qué escena, estado o subsistema
     está solicitando un asset". obtener() no recibe ni examina
     contexto alguno, responde igual sin importar el llamador.
   - Cap. 8.1 — la propia definición de cada asset (a qué capa
     pertenece, si es de carga anticipada o diferida) vive en
     AmbienteConfig, no acá; este módulo solo la consulta.
   - Cap. 8.3 — caché de dos niveles: una caché "caliente" de acceso
     inmediato, y un nivel de origen (acá, el propio catálogo de
     AmbienteConfig) al que se recurre solo ante una falla de caché.
   - Cap. 8.6 — expulsión por antigüedad (LRU) en la caché caliente,
     con límite de tamaño ajustable por el Performance Manager, para
     evitar crecimiento indefinido en sesiones largas.
   - Cap. 11.3 — no importa ningún subsistema de Contenido Visual, de
     Gobierno ni de Orquestación; su única dependencia permitida es
     AmbienteConfig (otro subsistema del propio Grupo de
     Infraestructura, Cap. 2.3).

   Debe cargarse después de ambiente-config.js y antes de cualquier
   subsistema que solicite assets (todo el Grupo de Contenido Visual
   y el Scene Manager).
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  // Tamaño por defecto de la caché caliente. Ajustable en tiempo de
  // ejecución exclusivamente por el Performance Manager (Cap. 8.3:
  // "un parámetro gestionado por el Performance Manager, que puede
  // reducirlo bajo restricciones de memoria") — ningún otro
  // subsistema debería llamar a establecerTamanoCache().
  var TAMANO_CACHE_POR_DEFECTO = 24;
  var tamanoMaximoCache = TAMANO_CACHE_POR_DEFECTO;

  // Caché caliente: Map preserva orden de inserción, que reutilizamos
  // como orden de "uso más reciente" reinsertando la clave en cada
  // acceso — la primera clave del Map es siempre la candidata más
  // antigua a expulsar (Cap. 8.6: "los assets menos usados
  // recientemente se liberan primero").
  var cacheCaliente = new Map();

  function marcarComoUsadoRecientemente(id, valor) {
    if (cacheCaliente.has(id)) cacheCaliente.delete(id);
    cacheCaliente.set(id, valor);
    expulsarSiExcede();
  }

  function expulsarSiExcede() {
    while (cacheCaliente.size > tamanoMaximoCache) {
      var masAntigua = cacheCaliente.keys().next().value;
      cacheCaliente.delete(masAntigua);
    }
  }

  // Nivel de origen: el propio catálogo de AmbienteConfig. Una falla
  // de caché consulta acá; un identificador inexistente en el
  // catálogo es una falla real, no de caché, y se resuelve como no
  // disponible (Cap. 3.13: "el asset solicitado, o una señal de no
  // disponibilidad").
  function resolverDesdeOrigen(id) {
    if (!global.AmbienteConfig) return null;
    return global.AmbienteConfig.obtenerAsset(id);
  }

  var api = {
    // Solicitud de asset por identificador (Cap. 3.13). Sincrónico:
    // en esta fase los assets son definiciones conceptuales, no
    // binarios a descargar por red, así que no existe una versión
    // asincrónica real todavía — la caché sigue siendo el mecanismo
    // correcto para cuando esos assets pasen a ser recursos gráficos
    // reales (Cap. 8.1, fases posteriores).
    obtener: function (id) {
      if (cacheCaliente.has(id)) {
        var enCache = cacheCaliente.get(id);
        marcarComoUsadoRecientemente(id, enCache); // refresca antigüedad
        return enCache;
      }
      var desdeOrigen = resolverDesdeOrigen(id);
      if (desdeOrigen === null) return null; // señal de no disponibilidad
      marcarComoUsadoRecientemente(id, desdeOrigen);
      return desdeOrigen;
    },

    // Cap. 8.1: carga anticipada de los assets que la escena Home
    // necesita desde el primer instante de la sesión. El propio
    // Configuration System decide cuáles son (carga: 'anticipada');
    // este método solo los precalienta en caché.
    precalentar: function () {
      if (!global.AmbienteConfig) return;
      global.AmbienteConfig.listarAssetsAnticipados().forEach(function (id) {
        api.obtener(id);
      });
    },

    // Superficie exclusiva del Performance Manager (Cap. 8.3 / 8.6).
    establecerTamanoCache: function (tamano) {
      if (typeof tamano !== 'number' || tamano < 1) return;
      tamanoMaximoCache = Math.floor(tamano);
      expulsarSiExcede();
    },

    // Solo para Diagnostics & Telemetry / depuración — nunca debe
    // usarse para tomar decisiones de comportamiento visual.
    estadoCache: function () {
      return {
        tamanoActual: cacheCaliente.size,
        tamanoMaximo: tamanoMaximoCache,
        claves: Array.from(cacheCaliente.keys())
      };
    }
  };

  global.AmbienteAssets = api;

})(window);
