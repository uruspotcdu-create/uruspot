/**
 * ÍNDICE INVERTIDO POR TRIGRAMAS — reduce cuántos lugares hay que
 * revisar en cada búsqueda de texto, antes de que motor-exposicion.js
 * aplique el ranking exacto (nombre exacto > empieza-con > contiene >
 * categoría > dirección).
 *
 * Por qué trigramas y no palabra exacta: la búsqueda real de la app
 * matchea por SUBSTRING ("piz" encuentra "pizzería", no solo "piz" como
 * palabra completa). Un índice de palabra exacta no puede servir eso —
 * por eso la versión anterior de este archivo quedaba construida pero
 * nunca conectada a resultadosPorAccionExplicita(). Un índice de
 * trigramas sí: si "pizzeria" contiene la consulta "piz" como substring,
 * entonces "piz" en sí (si la consulta tiene 3+ caracteres) o todos sus
 * trigramas están garantizados a aparecer en el texto indexado de ese
 * lugar. Es la misma técnica que usa pg_trgm en Postgres.
 *
 * GARANTÍA DE CORRECCIÓN: candidatosPara() es un filtro NECESARIO pero
 * NO SUFICIENTE — puede devolver falsos positivos (un lugar que
 * contiene todos los trigramas de la consulta pero no la consulta como
 * substring contiguo), nunca falsos negativos. motor-exposicion.js
 * siempre re-verifica con indexOf() exacto sobre cada candidato, así
 * que un falso positivo de acá simplemente se descarta después sin
 * afectar el resultado. Si candidatosPara() no puede ayudar (consulta
 * de 1-2 caracteres, o índice todavía no construido), devuelve `null` y
 * el llamador cae al barrido completo de siempre — cero riesgo de
 * regresión.
 */
(function (global) {
  'use strict';

  // Debe coincidir EXACTAMENTE con normalizarTexto() de
  // motor-exposicion.js. Si estas dos normalizaciones alguna vez
  // divergen, el índice puede generar falsos negativos (peor que los
  // falsos positivos, que el re-chequeo exacto absorbe sin problema).
  function normalizarTexto(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function trigramas(s) {
    if (s.length < 3) return s ? [s] : [];
    var out = [];
    for (var i = 0; i <= s.length - 3; i++) out.push(s.substr(i, 3));
    return out;
  }

  var postings = Object.create(null); // trigrama -> [lugares...]
  var indexado = false;

  /**
   * Construye (o reconstruye) el índice completo. Se llama una vez al
   * cargar el catálogo y otra vez cuando lugares-detalles.json termina
   * de rellenar `direccion` en segundo plano (ver app.js) — direccion
   * empieza en null y varios lugares solo matchean por dirección, así
   * que sin ese segundo llamado esos matches quedarían indexados como
   * si la dirección nunca hubiese llegado.
   */
  function construir(registro) {
    var nuevoPostings = Object.create(null);
    if (!Array.isArray(registro) || !registro.length) {
      postings = nuevoPostings;
      indexado = false;
      return;
    }

    registro.forEach(function (lugar) {
      var texto = normalizarTexto(
        (lugar.nombre || '') + ' ' + (lugar.categoria || '') + ' ' + (lugar.direccion || '')
      );
      var vistos = Object.create(null); // no repetir el mismo lugar en el mismo trigrama
      trigramas(texto).forEach(function (tri) {
        if (vistos[tri]) return;
        vistos[tri] = true;
        if (!nuevoPostings[tri]) nuevoPostings[tri] = [];
        nuevoPostings[tri].push(lugar);
      });
    });

    postings = nuevoPostings;
    indexado = true;
  }

  /**
   * Devuelve un superconjunto candidato de lugares (referencias, no
   * copias) que PODRÍAN matchear `query`, o `null` si el índice no
   * puede reducir nada de forma confiable. Nunca decide qué es un
   * match real — eso lo sigue haciendo motor-exposicion.js.
   */
  function candidatosPara(query) {
    if (!indexado) return null;
    var q = normalizarTexto(String(query || '').trim());
    if (q.length < 3) return null; // trigramas no aplican a consultas de 1-2 chars

    var tris = trigramas(q);
    var listas = [];
    for (var i = 0; i < tris.length; i++) {
      var lista = postings[tris[i]];
      if (!lista || !lista.length) return []; // ningún lugar tiene este trigrama -> cero candidatos
      listas.push(lista);
    }

    // Intersección empezando por la lista más chica, para tocar el
    // menor número de lugares posible en cada paso.
    listas.sort(function (a, b) { return a.length - b.length; });

    var acumulado = listas[0];
    for (var j = 1; j < listas.length && acumulado.length; j++) {
      var siguiente = new Set(listas[j]);
      acumulado = acumulado.filter(function (lugar) { return siguiente.has(lugar); });
    }
    return acumulado;
  }

  /**
   * Variante tolerante a errores tipográficos de candidatosPara(): en vez
   * de exigir TODOS los trigramas de la consulta (intersección estricta),
   * cuenta cuántos trigramas de la consulta tiene cada lugar y exige un
   * mínimo — la misma idea de "similarity threshold" de pg_trgm, calculada
   * acá en vez de depender de una extensión de base de datos. Sigue
   * siendo NECESARIO-PERO-NO-SUFICIENTE: motor-exposicion.js decide con
   * distancia de edición real si el lugar entra y con qué prioridad —
   * esto solo evita recorrer el catálogo completo para calcularla.
   *
   * `maxDistancia` es la cantidad de errores tipográficos tolerados (1 o
   * 2 en la práctica). Cada carácter distinto entre la consulta y el
   * texto real puede destruir hasta 3 trigramas (los que lo contienen),
   * así que el mínimo de trigramas en común exigido es (total de
   * trigramas de la consulta) - 3 * maxDistancia, con un piso de 1 para
   * no exigir cero coincidencias.
   */
  function candidatosDifusos(query, maxDistancia) {
    if (!indexado) return null;
    var q = normalizarTexto(String(query || '').trim());
    if (q.length < 4) return null; // con 1-3 chars, un typo es indistinguible de otra palabra

    var tris = trigramas(q);
    if (!tris.length) return null;

    var conteo = new Map();
    for (var i = 0; i < tris.length; i++) {
      var lista = postings[tris[i]];
      if (!lista) continue;
      for (var j = 0; j < lista.length; j++) {
        var lugar = lista[j];
        conteo.set(lugar, (conteo.get(lugar) || 0) + 1);
      }
    }

    var umbral = Math.max(1, tris.length - 3 * maxDistancia);
    var resultado = [];
    conteo.forEach(function (veces, lugar) {
      if (veces >= umbral) resultado.push(lugar);
    });
    return resultado;
  }

  global.IndiceInvertido = {
    construir: construir,
    candidatosPara: candidatosPara,
    candidatosDifusos: candidatosDifusos
  };
})(typeof window !== 'undefined' ? window : global);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = (typeof window !== 'undefined' ? window.IndiceInvertido : global.IndiceInvertido);
}

