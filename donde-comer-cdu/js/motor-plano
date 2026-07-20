/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — motor-plano.js
   El núcleo del sistema. Reemplaza cualquier noción de "estado
   discreto" por un punto que se calcula en un plano de dos ejes
   (autonomía × fricción tolerable), tal como lo fija el Blueprint de
   Producto v2, sección 1.

   Todas las funciones que calculan algo son puras (reciben estado,
   devuelven estado nuevo) para poder testearlas sin DOM ni red —
   ver tests/motor.test.js. La única parte impura es la persistencia
   (leerEstado/guardarEstado), aislada al final del archivo.

   No depende de motor-exposicion.js ni de motor-mapa.js: estos leen
   el estado que expone este módulo, nunca al revés.
   ═══════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var CFG = global.URU_CONFIG;

  /* ─────────────────────────────────────────────────────────────
     1. Identidad anónima y contexto (usuario × ciudad)
     Constitución del Motor: nunca se pide autoclasificación. Este id
     es un anónimo generado localmente, nunca ligado a datos reales
     de identidad — solo permite que el mismo dispositivo reconozca
     su propio historial en este mismo navegador.
     ───────────────────────────────────────────────────────────── */
  function obtenerUsuarioId() {
    var KEY = 'uru_uid';
    try {
      var id = localStorage.getItem(KEY);
      if (!id) {
        id = 'anon-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
        localStorage.setItem(KEY, id);
      }
      return id;
    } catch (e) {
      // Sin localStorage disponible: id de sesión, no persiste.
      return 'anon-sesion-' + Math.random().toString(36).slice(2, 10);
    }
  }

  function claveContexto(ciudadId) {
    return 'uru_plano::' + ciudadId + '::' + obtenerUsuarioId();
  }

  /* ─────────────────────────────────────────────────────────────
     2. Estado por defecto — Blueprint v2, sección 1 y 3:
     la madurez es un contador POR PAR (usuario, ciudad), nunca global.
     ───────────────────────────────────────────────────────────── */
  function estadoInicial(ciudadId) {
    return {
      ciudad: ciudadId,
      autonomia: CFG.plano.autonomiaInicial,
      friccion: CFG.plano.friccionInicial,
      aperturas: 0,              // madurez de ESTE contexto, no global
      ultimaApertura: null,
      exposicion: {},            // { lugarId: { vecesMostrado, ultimaVez } }
      rechazos: {},              // { grupo: [timestamps] }
      guardadosRecientes: [],    // timestamps para detectar Curaduría
      sesion: {
        curaduriaActiva: false,
        accionDirectaForzada: null, // null | 'nombrada' | 'inferida'
        inicioPermanenciaMs: null,
        empujeFriccionSesion: 0
      }
    };
  }

  function clamp(v) {
    return Math.max(CFG.plano.limites.min, Math.min(CFG.plano.limites.max, v));
  }

  /* ─────────────────────────────────────────────────────────────
     3. Madurez / rol — Blueprint v2, sección 3
     ───────────────────────────────────────────────────────────── */
  function rolPorAperturas(aperturas) {
    var u = CFG.madurez.umbralAperturas;
    if (aperturas >= u.casa) return 'casa';
    if (aperturas >= u.complice) return 'complice';
    if (aperturas >= u.conocido) return 'conocido';
    return 'anfitrion';
  }

  function reposoForzadoActivo(estado) {
    var rol = rolPorAperturas(estado.aperturas);
    return CFG.madurez.rolesConReposoForzado.indexOf(rol) !== -1;
    // Sección 4d: en Cómplice/Casa esto siempre da false — el
    // sistema deja de decidir cuándo alguien tuvo "suficiente".
  }

  /* ─────────────────────────────────────────────────────────────
     4. Decaimiento de señales negativas — Blueprint v2, sección 6
     Un rechazo aislado no se guarda "para siempre": simplemente cae
     fuera de la ventana con el tiempo. Solo un patrón repetido
     DENTRO de la ventana se vuelve estable.
     ───────────────────────────────────────────────────────────── */
  function rechazosVigentes(estado, grupo, ahoraMs) {
    var ventanaMs = CFG.acciones.rechazar.ventanaDecaimientoDias * 24 * 3600 * 1000;
    var lista = estado.rechazos[grupo] || [];
    return lista.filter(function (ts) { return (ahoraMs - ts) <= ventanaMs; });
  }

  function grupoEsPatronEstable(estado, grupo, ahoraMs) {
    return rechazosVigentes(estado, grupo, ahoraMs).length >= CFG.acciones.rechazar.repeticionesParaEstable;
  }

  // Usado por motor-exposicion.js para saber qué rubros evitar hoy.
  function gruposAEvitar(estado, ahoraMs) {
    ahoraMs = ahoraMs || Date.now();
    return Object.keys(estado.rechazos).filter(function (grupo) {
      return grupoEsPatronEstable(estado, grupo, ahoraMs);
    });
  }

  /* ─────────────────────────────────────────────────────────────
     5. Cálculo de región — Blueprint v2, sección 1 y 8
     Acción Directa y Curaduría se activan por disparadores
     explícitos (sesión), NO por posición en el plano — igual que
     documenta el diagrama de la sección 8 del Blueprint.
     ───────────────────────────────────────────────────────────── */
  function region(estado) {
    if (estado.sesion.accionDirectaForzada) {
      return { nombre: 'accionDirecta', variante: estado.sesion.accionDirectaForzada };
    }
    if (estado.sesion.curaduriaActiva) {
      return { nombre: 'curaduria', variante: null };
    }
    if (estado.autonomia < CFG.regiones.autonomiaUmbralGuia) {
      return { nombre: 'guia', variante: null };
    }
    if (estado.friccion >= CFG.regiones.friccionUmbralExploracion) {
      return { nombre: 'exploracion', variante: null };
    }
    return { nombre: 'accionDirecta', variante: 'inferida' };
    // Alta autonomía + baja fricción tolerable = usuario que ya sabe
    // lo que quiere y no tiene margen para que lo sorprendan: el
    // mismo comportamiento de entrega que la variante nombrada
    // (Blueprint v2, sección 7 — fusión Resolución/Verificación).
  }

  /* ─────────────────────────────────────────────────────────────
     6. Las seis acciones mínimas — Vocabulario de Interacción
     Cada una recibe el estado actual y devuelve un estado NUEVO
     (no muta el original) — más fácil de testear y de razonar.
     ───────────────────────────────────────────────────────────── */
  function copiarEstado(estado) {
    return JSON.parse(JSON.stringify(estado));
  }

  var Acciones = {

    permanecer: function (estado, payload) {
      var e = copiarEstado(estado);
      var seg = (payload && payload.segundos) || 0;
      var pasos = Math.floor(seg / CFG.acciones.permanecer.segundosPorEmpuje);
      if (pasos <= 0) return e;
      var empujeTotal = Math.min(
        pasos * CFG.acciones.permanecer.empujeFriccion,
        CFG.acciones.permanecer.empujeFriccionMax - e.sesion.empujeFriccionSesion
      );
      if (empujeTotal > 0) {
        e.friccion = clamp(e.friccion + empujeTotal);
        e.sesion.empujeFriccionSesion += empujeTotal;
      }
      return e;
    },

    aceptar: function (estado, payload) {
      var e = copiarEstado(estado);
      e.autonomia = clamp(e.autonomia + CFG.acciones.aceptar.empujeAutonomia);
      if (payload && payload.lugarId && payload.porIniciativaPropia) {
        var reg = e.exposicion[payload.lugarId] || { vecesMostrado: 0, ultimaVez: null };
        reg.vecesMostrado += 1;
        reg.ultimaVez = Date.now();
        e.exposicion[payload.lugarId] = reg;
      }
      return e;
    },

    rechazar: function (estado, payload) {
      var e = copiarEstado(estado);
      var grupo = (payload && payload.grupo) || 'sin_rubro';
      var ahora = Date.now();
      var vigentes = rechazosVigentes(e, grupo, ahora);
      vigentes.push(ahora);
      e.rechazos[grupo] = vigentes;
      if (grupoEsPatronEstable(e, grupo, ahora)) {
        e.friccion = clamp(e.friccion + CFG.acciones.rechazar.empujeFriccionSiEstable);
      }
      return e;
      // Nota: un rechazo AISLADO no toca el plano en absoluto — solo
      // entra a la cola. Recién si se repite lo suficiente empuja
      // algo, y ese empuje además decae solo porque los timestamps
      // viejos van a salir de la ventana en la próxima lectura.
    },

    nombrar: function (estado, payload) {
      var e = copiarEstado(estado);
      e.sesion.accionDirectaForzada = 'nombrada';
      return e;
      // Salto categórico, independiente de la posición previa —
      // Vocabulario, sección 1.
    },

    guardar: function (estado, payload) {
      var e = copiarEstado(estado);
      var ahora = Date.now();
      var ventanaMs = CFG.acciones.guardar.ventanaCuradoriaSegundos * 1000;
      var recientes = (e.guardadosRecientes || []).filter(function (ts) {
        return (ahora - ts) <= ventanaMs;
      });
      recientes.push(ahora);
      e.guardadosRecientes = recientes;
      if (recientes.length >= CFG.acciones.guardar.disparadorCantidad) {
        e.sesion.curaduriaActiva = true;
      }
      return e;
      // Sección 4a: no importa desde qué región llegó el primer
      // guardado — la condición es únicamente la repetición en el
      // tiempo.
    },

    abandonar: function (estado) {
      // No mueve el plano (Vocabulario, sección 1). Solo se persiste
      // tal cual para que la próxima apertura arranque desde acá.
      return copiarEstado(estado);
    }
  };

  function aplicarAccion(estado, tipo, payload) {
    var fn = Acciones[tipo];
    if (!fn) {
      console.warn('URU_PLANO: acción desconocida "' + tipo + '" — si esto pasa, la interacción no' +
        ' pertenece a este vocabulario (ver Vocabulario de Interacción, sección 1: ninguna séptima acción).');
      return estado;
    }
    return fn(estado, payload);
  }

  /* ─────────────────────────────────────────────────────────────
     7. Apertura de contexto: recalcula madurez y limpia flags de
     sesión (Curaduría y Acción Directa forzada son POR SESIÓN, no
     persisten a la apertura siguiente).
     ───────────────────────────────────────────────────────────── */
  function registrarApertura(estado) {
    var e = copiarEstado(estado);
    e.aperturas += 1;
    e.ultimaApertura = Date.now();
    e.sesion = {
      curaduriaActiva: false,
      accionDirectaForzada: null,
      inicioPermanenciaMs: Date.now(),
      empujeFriccionSesion: 0
    };
    return e;
  }

  /* ─────────────────────────────────────────────────────────────
     8. Persistencia (única parte impura del módulo)
     ───────────────────────────────────────────────────────────── */
  function leerEstado(ciudadId) {
    var clave = claveContexto(ciudadId);
    try {
      var crudo = localStorage.getItem(clave);
      if (crudo) return JSON.parse(crudo);
    } catch (e) { /* localStorage no disponible o corrupto: arrancar de cero */ }
    return estadoInicial(ciudadId);
  }

  function guardarEstado(estado) {
    var clave = claveContexto(estado.ciudad);
    try { localStorage.setItem(clave, JSON.stringify(estado)); } catch (e) { /* no-op */ }
  }

  /* ─────────────────────────────────────────────────────────────
     API pública
     ───────────────────────────────────────────────────────────── */
  global.URU_PLANO = {
    estadoInicial: estadoInicial,
    region: region,
    aplicarAccion: aplicarAccion,
    registrarApertura: registrarApertura,
    rolPorAperturas: rolPorAperturas,
    reposoForzadoActivo: reposoForzadoActivo,
    gruposAEvitar: gruposAEvitar,
    leerEstado: leerEstado,
    guardarEstado: guardarEstado,
    obtenerUsuarioId: obtenerUsuarioId
  };

})(typeof window !== 'undefined' ? window : global);

// Export para el runner de tests en Node (no afecta el navegador).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = (typeof window !== 'undefined' ? window.URU_PLANO : global.URU_PLANO);
}
