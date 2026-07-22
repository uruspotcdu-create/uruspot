/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — motor-exposicion.js
   Decide QUÉ lugares mostrar dentro de cada región, respetando la
   regla que el Blueprint v2 (sección 4b) fija como no negociable:

     Los límites de exposición rigen ÚNICAMENTE el contenido que el
     sistema ofrece por iniciativa propia (Guía, Exploración).
     NUNCA rigen sobre una acción de búsqueda o construcción
     explícita del usuario (Acción Directa, Curaduría).

   Por eso este archivo expone dos funciones bien distintas:
     recortePorIniciativaPropia()  → con presupuesto y rotación
     resultadosPorAccionExplicita() → sin presupuesto, nunca recorta
                                       por rotación, solo por lo que
                                       el usuario pidió (búsqueda,
                                       colección propia)
   ═══════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var CFG = global.URU_CONFIG;
  var PLANO = global.URU_PLANO;

  function descansando(estado, lugarId, ahoraMs) {
    var reg = estado.exposicion[lugarId];
    if (!reg || !reg.ultimaVez) return false;
    var descansoMs = CFG.exposicion.descansoHoras * 3600 * 1000;
    return (ahoraMs - reg.ultimaVez) < descansoMs;
  }

  /* ── Guía / Exploración: iniciativa propia del sistema ──
     registro: arreglo completo de lugares (viene de lugares-core.json)
     estado:   estado de motor-plano para este contexto
     nombreRegion: 'guia' | 'exploracion'                             */
  function recortePorIniciativaPropia(registro, estado, nombreRegion) {
    var ahora = Date.now();
    var evitar = PLANO.gruposAEvitar(estado, ahora); // decaimiento, sección 6

    var candidatos = registro.filter(function (lugar) {
      if (evitar.indexOf(lugar.grupo) !== -1) return false;
      if (descansando(estado, lugar.id, ahora)) return false;
      return true;
    });

    // Si el filtro deja muy pocos candidatos (rubro chico, o mucho
    // ya descansando), se relaja primero la rotación y recién si
    // sigue sin alcanzar, el rubro evitado — nunca se cae de vuelta
    // a "mostrar todo": el presupuesto sigue rigiendo, solo se
    // amplía la ventana de qué puede entrar a competir por el cupo.
    var tamano = nombreRegion === 'guia'
      ? CFG.exposicion.recorteGuia
      : CFG.exposicion.recorteExploracion;

    if (candidatos.length < tamano) {
      candidatos = registro.filter(function (lugar) {
        return evitar.indexOf(lugar.grupo) === -1;
      });
    }
    if (candidatos.length < tamano) {
      candidatos = registro.slice();
    }

    return barajarConSemilla(candidatos, estado.ultimaApertura || 0).slice(0, tamano);
  }

  /* ── Acción Directa / Curaduría: acción explícita del usuario ──
     Nunca aplica presupuesto ni rotación — si alguien busca o arma
     una colección, el sistema no le niega el mejor resultado
     disponible en nombre de la rotación (Blueprint v2, sección 4b). */
  function resultadosPorAccionExplicita(registro, consulta) {
    if (!consulta) return registro.slice();
    var q = consulta.trim().toLowerCase();
    if (!q) return registro.slice();
    return registro.filter(function (lugar) {
      var texto = (lugar.nombre + ' ' + (lugar.categoria || '') + ' ' + (lugar.direccion || '')).toLowerCase();
      return texto.indexOf(q) !== -1;
    });
  }

  function coleccionCurada(registro, idsGuardados) {
    var set = {};
    idsGuardados.forEach(function (id) { set[id] = true; });
    return registro.filter(function (lugar) { return !!set[lugar.id]; });
  }

  // Barajado determinístico por semilla (no aleatorio real): rota de
  // forma distinta entre aperturas sin depender de Math.random en
  // cada render, para que el resultado sea estable dentro de una
  // misma sesión.
  function barajarConSemilla(arr, semilla) {
    var copia = arr.slice();
    var s = semilla || 1;
    function rand() {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    }
    for (var i = copia.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var tmp = copia[i]; copia[i] = copia[j]; copia[j] = tmp;
    }
    return copia;
  }

  global.URU_EXPOSICION = {
    recortePorIniciativaPropia: recortePorIniciativaPropia,
    resultadosPorAccionExplicita: resultadosPorAccionExplicita,
    coleccionCurada: coleccionCurada
  };

})(typeof window !== 'undefined' ? window : global);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = (typeof window !== 'undefined' ? window.URU_EXPOSICION : global.URU_EXPOSICION);
}
