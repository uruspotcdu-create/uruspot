/* validar-meta-longitud.js
 * ─────────────────────────────────────────────────────────────────────
 * [IMPORTANTE 3] (auditoría SEO, 2026-08): metaDescription/title fuera
 * de rango no rompen el build (Google igual indexa, y a veces re-escribe
 * la meta por su cuenta), así que hasta ahora no había ninguna señal
 * cuando una ficha se pasaba del límite — el problema podía repetirse
 * en las 1500 fichas sin que nadie lo notara hasta una auditoría manual.
 *
 * Límites recomendados antes de que Google trunque en SERP:
 *   - title:            ≤ 60 caracteres
 *   - metaDescription:  ≤ 160 caracteres
 *
 * Se integra en build-fichas.js (fichas:build y fichas:verify) como
 * WARNING, no como error que corte el build: un title/description largo
 * es una oportunidad de SEO perdida, no un bug funcional — la ficha
 * sigue siendo indexable y se sigue viendo bien en el sitio. Cortar el
 * build entero (o el --verify de CI) por esto bloquearía un deploy de
 * 1500 fichas por un problema cosmético en 1 sola. El objetivo es que
 * el problema sea VISIBLE en cada build, no invisible como hasta ahora.
 * ───────────────────────────────────────────────────────────────────── */
"use strict";

const LIMITE_TITLE = 60;
const LIMITE_META_DESCRIPTION = 160;

/**
 * Valida los límites de longitud de title/metaDescription de un shell de
 * ficha.json. No lanza excepción: devuelve los warnings encontrados
 * (array vacío si todo está dentro de rango).
 *
 * NOTA DE INTEGRACIÓN: asume que el shell trae `title` y
 * `metaDescription` en el nivel superior (mismos nombres reportados en
 * la auditoría SEO). Si en el ficha.json real viven anidados distinto
 * (ej. shell.seo.title), ajustar el llamado en build-fichas.js — esta
 * función solo necesita que le pasen los dos strings ya resueltos.
 *
 * @param {string} slug             - identificador de la ficha, para el log
 * @param {Object} shell            - contenido ya parseado de ficha.json
 * @param {string} [shell.title]
 * @param {string} [shell.metaDescription]
 * @returns {Array<string>} mensajes de warning (vacío si no hay problemas)
 */
function validarLongitudesMeta(slug, shell) {
  const warnings = [];
  const title = shell && shell.title;
  const metaDescription = shell && shell.metaDescription;

  if (typeof title === "string" && title.length > LIMITE_TITLE) {
    warnings.push(
      `[SEO] ${slug}: title de ${title.length} caracteres (límite recomendado: ${LIMITE_TITLE}).`
    );
  }

  if (typeof metaDescription === "string" && metaDescription.length > LIMITE_META_DESCRIPTION) {
    warnings.push(
      `[SEO] ${slug}: metaDescription de ${metaDescription.length} caracteres (límite recomendado: ${LIMITE_META_DESCRIPTION}).`
    );
  }

  return warnings;
}

module.exports = { validarLongitudesMeta, LIMITE_TITLE, LIMITE_META_DESCRIPTION };
