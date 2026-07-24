/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-diagnostico.js
   Fase 2: Diagnostics & Telemetry (Arquitectura técnica, Cap. 3.14 / 8.6)

   Subsistema del Grupo de Infraestructura. Responsabilidad única:
   registrar métricas de funcionamiento interno del Ambient Engine
   (cuadros por segundo efectivos, frecuencia de activación del
   Estado de Reducción, tiempos de transición reales — Cap. 3.14)
   para informar decisiones futuras de ajuste, sin exponerlas como
   parte del comportamiento visual del sistema.

   Reglas de este documento que este módulo respeta explícitamente:
   - Cap. 3.14 — "nunca debe influir en tiempo real sobre el
     comportamiento del sistema". Este archivo no importa, no llama y
     no conoce a ningún otro subsistema salvo para ser consultado por
     ellos — es un sumidero de eventos de un solo sentido (entradas
     de registro, salidas de lectura), nunca emite señales propias
     que otro subsistema deba escuchar.
   - Cap. 2.3 — Grupo de Infraestructura: "no inicia comunicación
     hacia ningún otro subsistema, únicamente responde a
     solicitudes". No conoce escena, estado ni contexto de quien
     registra un evento; solo el tipo de métrica y su valor.
   - Cap. 8.6 — "debe aplicar sus propios límites de retención": es
     la única excepción del sistema autorizada a acumular una
     serie de eventos en el tiempo, y por eso es también la única
     obligada a acotarla explícitamente (buffer circular de tamaño
     fijo por tipo de métrica, nunca una lista sin límite).

   Debe cargarse junto al resto del Grupo de Infraestructura, antes
   de cualquier subsistema que vaya a registrar eventos en él
   (Performance Manager, State Manager, Scene Manager).
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  // Cap. 8.6: buffer circular de tamaño fijo por tipo de métrica —
  // el límite de retención explícito que este subsistema debe
  // imponerse a sí mismo, distinto para cada tipo porque cada uno se
  // produce a una frecuencia distinta (fps se muestrea mucho más
  // seguido que una activación de Reducción).
  var LIMITES_RETENCION = {
    fps: 120,          // ~2 minutos de muestreo a un valor cada segundo
    reduccion: 50,      // activaciones del Estado de Reducción
    transicion: 100,    // duraciones reales de transición
    cargaFallida: 50,   // timeouts / errores de Estado de Carga
    fidelidad: 50        // cambios de nivel de fidelidad
  };

  var registros = {
    fps: [],
    reduccion: [],
    transicion: [],
    cargaFallida: [],
    fidelidad: []
  };

  function ahora() {
    return (global.performance && typeof global.performance.now === 'function')
      ? global.performance.now() : Date.now();
  }

  // Inserta con marca de tiempo y recorta al límite de retención del
  // tipo correspondiente (Cap. 8.6). Un tipo desconocido se ignora
  // silenciosamente: un registro malformado no debe nunca convertirse
  // en un error visible para el usuario (mismo espíritu del rechazo
  // silencioso del State Manager, Cap. 5.3).
  function registrar(tipo, valor) {
    if (!Object.prototype.hasOwnProperty.call(registros, tipo)) return;
    var lista = registros[tipo];
    lista.push({ valor: valor, marca: ahora() });
    var limite = LIMITES_RETENCION[tipo];
    if (lista.length > limite) lista.splice(0, lista.length - limite);
  }

  function promedio(lista) {
    if (!lista.length) return null;
    var suma = 0;
    for (var i = 0; i < lista.length; i++) suma += lista[i].valor;
    return suma / lista.length;
  }

  var api = {
    // ── Entradas de registro, una por tipo de métrica del Cap. 3.14 ──
    registrarFPS: function (fps) {
      if (typeof fps === 'number' && isFinite(fps)) registrar('fps', fps);
    },
    registrarActivacionReduccion: function () {
      registrar('reduccion', 1);
    },
    registrarTransicion: function (duracionMs) {
      if (typeof duracionMs === 'number' && isFinite(duracionMs)) registrar('transicion', duracionMs);
    },
    registrarCargaFallida: function () {
      registrar('cargaFallida', 1);
    },
    registrarCambioFidelidad: function (nivel) {
      // Se registra el nombre del nivel, no un número — la lectura
      // (obtenerResumen) lo trata como conteo de ocurrencias, no
      // como promedio, ver más abajo.
      registros.fidelidad.push({ valor: nivel, marca: ahora() });
      if (registros.fidelidad.length > LIMITES_RETENCION.fidelidad) {
        registros.fidelidad.splice(0, registros.fidelidad.length - LIMITES_RETENCION.fidelidad);
      }
    },

    // ── Salidas de lectura, exclusivamente para consulta pasiva
    // (equipo de producto / debugging) — nunca deben usarse como
    // entrada de una decisión visual en tiempo real (Cap. 3.14).
    obtenerResumen: function () {
      return {
        fpsPromedio: promedio(registros.fps),
        fpsMuestras: registros.fps.length,
        activacionesReduccion: registros.reduccion.length,
        transicionPromedioMs: promedio(registros.transicion),
        transicionesRegistradas: registros.transicion.length,
        cargasFallidas: registros.cargaFallida.length,
        ultimoNivelFidelidad: registros.fidelidad.length
          ? registros.fidelidad[registros.fidelidad.length - 1].valor
          : null
      };
    },

    // Acceso al detalle crudo de un tipo, para herramientas de
    // depuración puntuales. Devuelve una copia, nunca la lista
    // interna, para que nadie pueda mutar el registro desde afuera.
    obtenerSerie: function (tipo) {
      if (!Object.prototype.hasOwnProperty.call(registros, tipo)) return [];
      return registros[tipo].slice();
    },

    // Solo para pruebas / reinicio explícito de sesión de
    // diagnóstico — no forma parte del flujo normal del sistema.
    reiniciar: function () {
      Object.keys(registros).forEach(function (tipo) { registros[tipo].length = 0; });
    }
  };

  global.AmbienteDiagnostico = api;

})(window);
