/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — motor-exposicion.js
   Decide QUÉ lugares mostrar dentro de cada región, respetando la
   regla que el Blueprint v2 (sección 4b) fija como no negociable:

     Los límites de exposición rigen ÚNICAMENTE el contenido que el
     sistema ofrece por iniciativa propia (Guía, Exploración).
     NUNCA rigen sobre una acción de búsqueda o construcción
     explícita del usuario (Acción Directa, Curaduría).

   ───────────────────────────────────────────────────────────────────
   AUDITORÍA Y REDISEÑO DE ESTA PASADA — de "filtro + shuffle" a motor
   de selección
   ───────────────────────────────────────────────────────────────────
   Verificado con `grep` en todo el repo antes de tocar nada (no se
   asumió ningún dato de los comentarios existentes):

   • `PLANO.gruposAfines()` existe en motor-plano.js desde SCHEMA_VERSION
     v4, con su propio mecanismo de decaimiento (idéntico al de
     `gruposAEvitar`), pero no tenía NINGÚN consumidor real — ni acá
     ni en app.js. El propio comentario de esa función lo decía:
     "No tiene consumidor todavía en motor-exposicion.js". El sistema
     sabía evitar; no sabía preferir.
   • `functions/weather.js` es una Cloudflare Function completa y
     funcional (clima real vía MET Norway) sin un solo `fetch` que la
     consuma en todo `js/`. Infraestructura lista, desconectada.
   • La proximidad ("cerca de mí") SÍ está conectada, pero vive en
     app.js como un re-ordenamiento posterior sobre la lista que este
     archivo ya recortó — nunca participaba en decidir QUÉ entra al
     recorte, solo en qué orden se ve lo que ya entró.
   • El propio recorte, hasta esta pasada, era: filtrar por rubros
     evitados + descanso, después un shuffle determinístico por
     semilla. Sin score, sin ranking, sin combinar señales.

   Esta pasada convierte ese filtro en un motor de scoring modular.
   Nada de esto es Machine Learning: son funciones puras, pesos
   configurables (motor-config.js: exposicion.scoring) y selección
   determinística — la misma filosofía que ya regía el resto del
   archivo, aplicada con más criterio.

   INVARIANTES QUE ESTA PASADA NO TOCA (verificados, no reescritos):
   • `resultadosPorAccionExplicita()` — sin cambios. Cero scoring,
     cero recorte por presupuesto. Una búsqueda nombra lo que quiere
     y lo recibe completo.
   • `coleccionCurada()` — sin cambios. IDs guardados adentro, el
     resto afuera. No pasa por scoring ni por rotación.
   • El contrato de `recortePorIniciativaPropia(registro, estado,
     nombreRegion)` sigue devolviendo un array plano de lugares — los
     mismos objetos del registro, en el mismo shape. Ningún consumidor
     existente (app.js, motor-mapa.js) necesita cambiar una línea.
   • La cascada de relajación del filtro (grupos evitados → sin
     rotación → catálogo completo si no alcanza) se conserva textual:
     el presupuesto nunca cae a "mostrar todo" salvo que ni así
     alcance el cupo.
   • El motor sigue sin tocar DOM, sin hacer fetch, sin depender de
     nada más que motor-plano.js (vía su API pública) y su propia
     configuración. `contexto.clima`, si se usa, entra como dato ya
     resuelto — nunca este archivo pide clima por su cuenta.

   QUÉ ES NUEVO
   • `calcularScore(lugar, ...)`: combina afinidad, proximidad,
     frescura y contexto (clima/hora) en un score [0,1]. Cada señal es
     OPCIONAL — si el dato no está (sin ubicación, sin clima, lugar
     sin coordenadas), esa señal simplemente no participa y los pesos
     restantes se renormalizan. Nunca se penaliza a un lugar por falta
     de dato (pedido explícito de esta pasada).
   • Diversidad: tope configurable de cuántos lugares del mismo rubro
     pueden ocupar el cupo, con relajación automática si no hay
     variedad suficiente entre los candidatos.
   • Exploración: una fracción del cupo se llena con candidatos fuera
     del top-score (elegidos con el mismo mecanismo de semilla
     determinística de siempre), para que la personalización no se
     cierre en burbuja.
   • `recortePorIniciativaPropiaExplicado()`: misma selección, pero
     devuelve score + señales + razones legibles por lugar, más el
     nivel de confianza de la sesión. Función NUEVA, aditiva — nadie
     que hoy consuma `recortePorIniciativaPropia()` se entera de que
     existe.
   • `calcularScoreLugar()`: wrapper de un solo lugar, pensado para
     tests unitarios de cada señal por separado sin pasar por toda la
     canalización de selección.

   QUÉ SIGUE FUERA DE ALCANCE DE ESTA PASADA (ver informe de cierre)
   • Conectar `contexto.ubicacion`/`contexto.clima` desde app.js real
     — hoy sólo se acepta como parámetro opcional, nadie lo manda
     todavía. Requiere tocar app.js (fuera de alcance autorizado).
   • Poblar `afinidadClimaPorGrupo` con criterio de producto real.
   • Unificar `distanciaMetros` (duplicada aquí y en app.js) en un
     módulo geográfico compartido — hoy motor-plano.js prohíbe que
     este archivo dependa de app.js, así que la duplicación puntual
     de una fórmula de 8 líneas es el costo correcto de esa frontera,
     pero si aparece un tercer consumidor, debería moverse a
     proyeccion.js.
   ═══════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var CFG = global.URU_CONFIG;
  var PLANO = global.URU_PLANO;

  /* ─────────────────────────────────────────────────────────────
     0. Utilidades puras compartidas
     ───────────────────────────────────────────────────────────── */

  function clamp01(v) {
    return Math.max(0, Math.min(1, v));
  }

  // Barajado determinístico por semilla (no aleatorio real): dado el
  // mismo array y la misma semilla, siempre el mismo orden. Se usa
  // tanto para desempatar scores iguales como para elegir el cupo de
  // exploración — cada uso con su propia semilla derivada, para que
  // un uso no condicione al otro.
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

  // Distancia entre dos puntos lat/lng en metros (fórmula de
  // Haversine). Duplicada intencionalmente de la equivalente en
  // app.js — ver nota de arquitectura al inicio del archivo sobre por
  // qué el núcleo no puede depender de la capa de UI.
  function distanciaMetros(lat1, lng1, lat2, lng2) {
    var R = 6371000;
    var toRad = Math.PI / 180;
    var dLat = (lat2 - lat1) * toRad;
    var dLng = (lng2 - lng1) * toRad;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function descansando(estado, lugarId, ahoraMs) {
    var reg = estado.exposicion[lugarId];
    if (!reg || !reg.ultimaVez) return false;
    var descansoMs = CFG.exposicion.descansoHoras * 3600 * 1000;
    return (ahoraMs - reg.ultimaVez) < descansoMs;
  }

  /* ─────────────────────────────────────────────────────────────
     1. Señales individuales — cada una pura, cada una opcional
     ───────────────────────────────────────────────────────────── */

  // Afinidad: 1 si el rubro del lugar tiene patrón de aceptación
  // estable (PLANO.gruposAfines), 0 si no. Binaria a propósito: el
  // umbral de "estable" (3+ aceptaciones dentro de la ventana, ver
  // motor-plano.js) ya es la barrera anti-sobreajuste — una señal
  // graduada por encima de ese umbral no tiene más evidencia real
  // detrás, solo más ruido.
  function scoreAfinidad(lugar, gruposAfinesSet) {
    return gruposAfinesSet[lugar.grupo] ? 1 : 0;
  }

  // Proximidad: null (señal ausente) si no hay ubicación del usuario
  // o el lugar no tiene coordenadas — nunca 0 en ese caso, para no
  // penalizar por falta de dato. Con ambos datos presentes, decae
  // linealmente hasta 0 a partir de `distanciaReferenciaMetros`.
  function scoreProximidad(lugar, ubicacion, distanciaReferenciaMetros) {
    if (!ubicacion || typeof ubicacion.lat !== 'number' || typeof ubicacion.lng !== 'number') return null;
    if (typeof lugar.lat !== 'number' || typeof lugar.lng !== 'number') return null;
    var d = distanciaMetros(ubicacion.lat, ubicacion.lng, lugar.lat, lugar.lng);
    return clamp01(1 - d / distanciaReferenciaMetros);
  }

  // Frescura: 1 si el lugar nunca fue aceptado antes desde un recorte
  // por iniciativa propia; decae suavemente (nunca a 0) cuantas más
  // veces se aceptó. Complementa, no reemplaza, la exclusión dura por
  // descanso (esa ya sacó del pool a los "recién mostrados"; esto
  // solo empuja hacia arriba a los "nunca mostrados" entre los que
  // quedaron).
  function scoreFrescura(lugar, estado, decaimientoPorVez) {
    var reg = estado.exposicion && estado.exposicion[lugar.id];
    var vecesMostrado = (reg && typeof reg.vecesMostrado === 'number') ? reg.vecesMostrado : 0;
    if (vecesMostrado <= 0) return 1;
    return clamp01(1 / (1 + vecesMostrado * decaimientoPorVez));
  }

  // Condición climática de lectura simple, a partir de la forma que
  // ya devuelve functions/weather.js (`.current`): weather_code (WMO,
  // ver symbolToWmo en ese archivo), temperature_2m, precipitation.
  // null si no hay datos usables — nunca inventa una condición.
  function condicionClimatica(clima) {
    if (!clima) return null;
    var codigo = typeof clima.weather_code === 'number' ? clima.weather_code : null;
    var temp = typeof clima.temperature_2m === 'number' ? clima.temperature_2m : null;
    var precip = typeof clima.precipitation === 'number' ? clima.precipitation : null;
    if (codigo === null && temp === null) return null;
    if ((codigo !== null && codigo >= 51) || (precip !== null && precip > 0.2)) return 'lluvia';
    if (temp !== null && temp <= 10) return 'frio';
    if (temp !== null && temp >= 30) return 'calor';
    if (codigo !== null && codigo <= 1) return 'despejado';
    return 'templado';
  }

  // Contexto (clima/hora): null si no hay clima en el contexto, o si
  // no hay ninguna afinidad configurada para (rubro, condición) —
  // ver motor-config.js: scoring.afinidadClimaPorGrupo (vacío por
  // defecto, ver nota de arquitectura arriba). Con la tabla vacía,
  // esta función siempre devuelve null: se calcula la condición (para
  // explicabilidad/tests) pero nunca afecta el score.
  function scoreContexto(lugar, condicion, afinidadClimaPorGrupo) {
    if (!condicion) return null;
    var tabla = afinidadClimaPorGrupo[lugar.grupo];
    if (!tabla || typeof tabla[condicion] !== 'number') return null;
    return clamp01(0.5 + tabla[condicion]);
  }

  /* ─────────────────────────────────────────────────────────────
     2. Score combinado — pesos configurables, renormalizados según
        qué señales están realmente presentes para ESTE lugar.
     ───────────────────────────────────────────────────────────── */

  /**
   * Calcula el score [0,1] de un lugar y las señales que lo componen.
   * Pura: mismos parámetros, mismo resultado siempre.
   * @param {object} lugar
   * @param {object} params — { gruposAfinesSet, estado, ubicacion,
   *   distanciaReferenciaMetros, condicionClima, pesos,
   *   afinidadClimaPorGrupo, decaimientoPorVez }
   * @returns {{score:number, señales:object}}
   */
  function calcularScore(lugar, params) {
    var señales = {};
    señales.afinidad = scoreAfinidad(lugar, params.gruposAfinesSet);
    señales.frescura = scoreFrescura(lugar, params.estado, params.decaimientoPorVez);

    var proximidad = scoreProximidad(lugar, params.ubicacion, params.distanciaReferenciaMetros);
    if (proximidad !== null) señales.proximidad = proximidad;

    var contexto = scoreContexto(lugar, params.condicionClima, params.afinidadClimaPorGrupo);
    if (contexto !== null) señales.contexto = contexto;

    var pesoTotal = 0, acumulado = 0;
    Object.keys(señales).forEach(function (clave) {
      var peso = params.pesos[clave] || 0;
      pesoTotal += peso;
      acumulado += peso * señales[clave];
    });

    return { score: pesoTotal > 0 ? acumulado / pesoTotal : 0, señales: señales };
  }

  /**
   * Conveniencia para testear/inspeccionar el score de UN lugar sin
   * pasar por toda la canalización de selección (filtro de rotación,
   * diversidad, exploración). Usa la configuración vigente de
   * motor-config.js salvo que se pase `contexto` con overrides.
   * @param {object} lugar
   * @param {object} estado
   * @param {object} [contexto] — { ubicacion, clima, ahoraMs }
   * @returns {{score:number, señales:object}}
   */
  function calcularScoreLugar(lugar, estado, contexto) {
    contexto = contexto || {};
    var ahora = numeroFinitoOr(contexto.ahoraMs, Date.now());
    var cfgScoring = CFG.exposicion.scoring;
    var afinesSet = {};
    (PLANO.gruposAfines(estado, ahora) || []).forEach(function (g) { afinesSet[g] = true; });
    return calcularScore(lugar, {
      gruposAfinesSet: afinesSet,
      estado: estado,
      ubicacion: contexto.ubicacion || null,
      distanciaReferenciaMetros: cfgScoring.proximidad.distanciaReferenciaMetros,
      condicionClima: condicionClimatica(contexto.clima),
      pesos: cfgScoring.pesos,
      afinidadClimaPorGrupo: cfgScoring.afinidadClimaPorGrupo || {},
      decaimientoPorVez: cfgScoring.frescura.decaimientoPorVez
    });
  }

  function numeroFinitoOr(v, porDefecto) {
    return (typeof v === 'number' && isFinite(v)) ? v : porDefecto;
  }

  /* ─────────────────────────────────────────────────────────────
     3. Ranking + diversidad + exploración
     ───────────────────────────────────────────────────────────── */

  // Ordena TODOS los candidatos por score descendente. Los empates se
  // desempatan barajando primero con semilla (determinístico por
  // sesión) y usando sort estable después — así el orden entre
  // iguales no depende del orden original del registro (que sesgaría
  // sistemáticamente a los primeros ids) sino de la sesión actual.
  function ordenarPorScore(candidatos, estado, afinesSet, condicion, contexto) {
    var cfgScoring = CFG.exposicion.scoring;
    var puntuados = candidatos.map(function (lugar) {
      var r = calcularScore(lugar, {
        gruposAfinesSet: afinesSet,
        estado: estado,
        ubicacion: (contexto && contexto.ubicacion) || null,
        distanciaReferenciaMetros: cfgScoring.proximidad.distanciaReferenciaMetros,
        condicionClima: condicion,
        pesos: cfgScoring.pesos,
        afinidadClimaPorGrupo: cfgScoring.afinidadClimaPorGrupo || {},
        decaimientoPorVez: cfgScoring.frescura.decaimientoPorVez
      });
      return { lugar: lugar, score: r.score, señales: r.señales };
    });
    var semilla = estado.ultimaApertura || 0;
    var mezclados = barajarConSemilla(puntuados, semilla);
    mezclados.sort(function (a, b) { return b.score - a.score; });
    return mezclados;
  }

  // Selección con tope de diversidad por rubro, con relajación
  // automática si no hay variedad suficiente entre los candidatos
  // disponibles (mismo principio que la cascada de relajación de
  // gruposAEvitar: el cupo nunca queda sin llenar por falta de
  // variedad si hay candidatos de sobra).
  function seleccionarConDiversidad(puntuados, cupo, maxPorGrupo) {
    var elegidos = [];
    var conteoPorGrupo = {};
    var descartadosPorTope = [];
    puntuados.forEach(function (item) {
      if (elegidos.length >= cupo) return;
      var grupo = item.lugar.grupo;
      var actual = conteoPorGrupo[grupo] || 0;
      if (actual < maxPorGrupo) {
        elegidos.push(item);
        conteoPorGrupo[grupo] = actual + 1;
      } else {
        descartadosPorTope.push(item);
      }
    });
    var i = 0;
    while (elegidos.length < cupo && i < descartadosPorTope.length) {
      elegidos.push(descartadosPorTope[i]);
      i++;
    }
    return elegidos;
  }

  // Pipeline completo: score → diversidad → exploración. Devuelve
  // objetos {lugar, score, señales} — quien solo necesita los lugares
  // (recortePorIniciativaPropia) los desenvuelve; quien necesita
  // explicabilidad (recortePorIniciativaPropiaExplicado) los usa tal
  // cual. Una sola implementación para ambos, para no duplicar la
  // lógica de selección entre los dos puntos de entrada públicos.
  function calcularRecorte(candidatos, estado, tamano, afinesSet, condicion, contexto) {
    var puntuados = ordenarPorScore(candidatos, estado, afinesSet, condicion, contexto);

    if (candidatos.length <= tamano) {
      return puntuados;
    }

    var cfgScoring = CFG.exposicion.scoring;
    var slotsExploracion = candidatos.length >= cfgScoring.exploracion.minCandidatosParaActivarse
      ? Math.min(Math.round(tamano * cfgScoring.exploracion.ratio), Math.max(tamano - 1, 0))
      : 0;
    var slotsRelevancia = tamano - slotsExploracion;

    var maxPorGrupo = Math.max(1, Math.ceil(tamano * cfgScoring.diversidad.maxPorGrupoRatio));
    var elegidosRelevancia = seleccionarConDiversidad(puntuados, slotsRelevancia, maxPorGrupo);

    var idsElegidos = {};
    elegidosRelevancia.forEach(function (p) { idsElegidos[p.lugar.id] = true; });
    var restantes = puntuados.filter(function (p) { return !idsElegidos[p.lugar.id]; });
    var restantesLugares = restantes.map(function (p) { return p.lugar; });

    // Semilla distinta (+1) a la del desempate de arriba: así el cupo
    // de exploración no queda correlacionado con el orden de empate
    // del ranking principal.
    var barajados = barajarConSemilla(restantesLugares, (estado.ultimaApertura || 0) + 1);
    var restantesPorId = {};
    restantes.forEach(function (p) { restantesPorId[p.lugar.id] = p; });
    var exploracionElegida = barajados.slice(0, slotsExploracion).map(function (lugar) {
      return restantesPorId[lugar.id];
    });

    return elegidosRelevancia.concat(exploracionElegida).slice(0, tamano);
  }

  /* ─────────────────────────────────────────────────────────────
     4. Candidatos: filtro de rubros evitados + descanso, con la
        misma cascada de relajación de siempre (sin cambios de
        comportamiento respecto de la versión anterior del archivo).
     ───────────────────────────────────────────────────────────── */

  function candidatosBase(registro, estado, ahora, evitar, tamano) {
    var candidatos = registro.filter(function (lugar) {
      if (evitar.indexOf(lugar.grupo) !== -1) return false;
      if (descansando(estado, lugar.id, ahora)) return false;
      return true;
    });

    if (candidatos.length < tamano) {
      candidatos = registro.filter(function (lugar) {
        return evitar.indexOf(lugar.grupo) === -1;
      });
    }
    if (candidatos.length < tamano) {
      candidatos = registro.slice();
    }
    return candidatos;
  }

  /* ─────────────────────────────────────────────────────────────
     5. API pública — Guía / Exploración: iniciativa propia
     ───────────────────────────────────────────────────────────── */

  /**
   * Recorte por iniciativa propia del sistema (Guía/Exploración),
   * ahora elegido por score en vez de solo shuffle. Contrato de
   * salida sin cambios: array plano de lugares.
   * @param {object[]} registro — catálogo completo (lugares-core.json)
   * @param {object} estado — estado de motor-plano para este contexto
   * @param {string} nombreRegion — 'guia' | 'exploracion'
   * @param {object} [contexto] — OPCIONAL, no rompe nada si se omite.
   *   { ubicacion:{lat,lng}, clima:{weather_code,temperature_2m,
   *   precipitation}, ahoraMs, diaSemana }. Este módulo nunca hace
   *   fetch ni lee geolocalización por su cuenta — todo entra ya
   *   resuelto, o no entra.
   * @returns {object[]}
   */
  function recortePorIniciativaPropia(registro, estado, nombreRegion, contexto) {
    contexto = contexto || {};
    var ahora = numeroFinitoOr(contexto.ahoraMs, Date.now());
    var evitar = PLANO.gruposAEvitar(estado, ahora);
    var afinesSet = {};
    (PLANO.gruposAfines(estado, ahora) || []).forEach(function (g) { afinesSet[g] = true; });
    var condicion = condicionClimatica(contexto.clima);

    var tamano = nombreRegion === 'guia'
      ? CFG.exposicion.recorteGuia
      : CFG.exposicion.recorteExploracion;

    var candidatos = candidatosBase(registro, estado, ahora, evitar, tamano);
    var seleccion = calcularRecorte(candidatos, estado, tamano, afinesSet, condicion, contexto);
    return seleccion.map(function (p) { return p.lugar; });
  }

  /**
   * Misma selección que `recortePorIniciativaPropia`, pero con score,
   * señales y razones legibles por lugar, más el nivel de confianza
   * de la sesión. Capa OPCIONAL y aditiva: ningún consumidor actual
   * la usa ni la necesita — pensada para cuando la UI quiera mostrar
   * "por qué te lo mostramos" sin que ese texto sea inventado.
   * @param {object[]} registro
   * @param {object} estado
   * @param {string} nombreRegion
   * @param {object} [contexto]
   * @returns {{lugares: Array<{lugar:object, score:number, señales:object, razones:string[]}>,
   *   confianza: string, tamanoObjetivo: number, candidatosEvaluados: number}}
   */
  function recortePorIniciativaPropiaExplicado(registro, estado, nombreRegion, contexto) {
    contexto = contexto || {};
    var ahora = numeroFinitoOr(contexto.ahoraMs, Date.now());
    var evitar = PLANO.gruposAEvitar(estado, ahora);
    var afinesSet = {};
    (PLANO.gruposAfines(estado, ahora) || []).forEach(function (g) { afinesSet[g] = true; });
    var condicion = condicionClimatica(contexto.clima);

    var tamano = nombreRegion === 'guia'
      ? CFG.exposicion.recorteGuia
      : CFG.exposicion.recorteExploracion;

    var candidatos = candidatosBase(registro, estado, ahora, evitar, tamano);
    var seleccion = calcularRecorte(candidatos, estado, tamano, afinesSet, condicion, contexto);

    return {
      lugares: seleccion.map(function (p) {
        return {
          lugar: p.lugar,
          score: Number(p.score.toFixed(3)),
          señales: p.señales,
          razones: razonesDesdeSeñales(p.señales)
        };
      }),
      confianza: PLANO.nivelConfianza(estado),
      tamanoObjetivo: tamano,
      candidatosEvaluados: candidatos.length
    };
  }

  // Traduce señales numéricas a razones legibles, sin inventar nada
  // que el score no respalde. Siempre devuelve al menos una razón.
  function razonesDesdeSeñales(señales) {
    var razones = [];
    if (señales.afinidad >= 1) razones.push('te interesaron lugares similares antes');
    if (typeof señales.proximidad === 'number' && señales.proximidad >= 0.6) razones.push('está cerca tuyo');
    if (señales.frescura >= 1) razones.push('todavía no te lo mostramos');
    if (typeof señales.contexto === 'number') razones.push('encaja con el clima de hoy');
    if (!razones.length) razones.push('parte de la selección de hoy para vos');
    return razones;
  }

  /* ─────────────────────────────────────────────────────────────
     6. Acción Directa / Curaduría — acción explícita del usuario.
     SIN CAMBIOS respecto de la versión anterior de este archivo:
     nunca aplican presupuesto, scoring ni rotación (Blueprint v2,
     sección 4b). Ver invariantes en el encabezado.
     ───────────────────────────────────────────────────────────── */

  // Minúsculas + sin acentos. Antes solo se hacía toLowerCase(): una
  // tilde de más o de menos en "café"/"cafe" rompía el match en
  // silencio, justo el tipo de fricción que esta pasada busca sacar.
  function normalizarTexto(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  // Rango de relevancia, de más a menos específico (0 = mejor). null
  // = no matchea nada. El orden de los checks —nombre exacto > nombre
  // empieza con > nombre contiene > categoría > dirección— es el
  // mismo criterio con el que una persona escanearía los resultados:
  // lo más parecido a lo que escribiste, primero.
  function rangoDeCoincidencia(nombre, categoria, direccion, q) {
    if (nombre === q) return 0;
    if (nombre.indexOf(q) === 0) return 1;
    if (nombre.indexOf(q) !== -1) return 2;
    if (categoria === q) return 3;
    if (categoria.indexOf(q) !== -1) return 4;
    if (direccion.indexOf(q) !== -1) return 5;
    return null;
  }

  /**
   * SIGUE SIN RECORTAR NADA (Blueprint v2, sección 4b): esta función
   * devuelve el 100% de los lugares que matchean, sin presupuesto ni
   * exposición — eso no cambia. Lo que se agrega en esta pasada es
   * orden: antes el resultado salía en el orden crudo del registro
   * (esencialmente arbitrario desde la perspectiva de quien buscó);
   * ahora sale ordenado por qué tan específico es el match. Ordenar
   * quién aparece primero no es lo mismo que decidir quién no aparece
   * — el conteo total nunca cambia (ver tests §19 y §62).
   */
  function resultadosPorAccionExplicita(registro, consulta) {
    if (!consulta) return registro.slice();
    var q = normalizarTexto(consulta.trim());
    if (!q) return registro.slice();

    var candidatos = [];
    for (var i = 0; i < registro.length; i++) {
      var lugar = registro[i];
      var nombre = normalizarTexto(lugar.nombre);
      var categoria = normalizarTexto(lugar.categoria);
      var direccion = normalizarTexto(lugar.direccion);
      var rango = rangoDeCoincidencia(nombre, categoria, direccion, q);
      if (rango === null) continue;
      candidatos.push({ lugar: lugar, rango: rango, indiceOriginal: i });
    }

    // Desempate explícito por índice original en vez de confiar en que
    // Array.prototype.sort sea estable: mantiene el orden del catálogo
    // entre lugares con el mismo nivel de relevancia.
    candidatos.sort(function (a, b) {
      return (a.rango - b.rango) || (a.indiceOriginal - b.indiceOriginal);
    });

    return candidatos.map(function (c) { return c.lugar; });
  }

  function coleccionCurada(registro, idsGuardados) {
    var set = {};
    idsGuardados.forEach(function (id) { set[id] = true; });
    return registro.filter(function (lugar) { return !!set[lugar.id]; });
  }

  global.URU_EXPOSICION = {
    recortePorIniciativaPropia: recortePorIniciativaPropia,
    recortePorIniciativaPropiaExplicado: recortePorIniciativaPropiaExplicado,
    resultadosPorAccionExplicita: resultadosPorAccionExplicita,
    coleccionCurada: coleccionCurada,
    calcularScoreLugar: calcularScoreLugar
  };

})(typeof window !== 'undefined' ? window : global);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = (typeof window !== 'undefined' ? window.URU_EXPOSICION : global.URU_EXPOSICION);
}
