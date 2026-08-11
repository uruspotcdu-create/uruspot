/* ficha-template.js — ÚNICA fuente de la estructura HTML compartida por
 * las fichas de donde-comer-cdu/locales/ (<!DOCTYPE>, <head>, skip-link,
 * <nav>, <main>, <footer>, orden de <script>). Basada en la estructura
 * de Brode, la ficha GOLD STANDARD del sitio (ver ARCHITECTURE.md).
 *
 * Qué SÍ arma este template (datos → HTML, `shell` de ficha.json):
 *   <title>, meta description/theme-color/og:*, <link rel="canonical">,
 *   bloque JSON-LD, skip-link, <nav>, <main id="contenido-principal">
 *   (envolviendo el cuerpo editorial), <footer>, orden de <link>/<script>.
 *
 * Qué NO arma este template (se preserva byte a byte desde cuerpo.html
 * y los campos *Raw de ficha.json):
 *   el contenido editorial (Hero, Sobre el lugar, Historia, Catálogo,
 *   Percepción, Highlights, Puntajes, Horarios, Mapa, Reseñas, Presencia
 *   digital, FAQ, Veredicto), el bloque <script id="ficha-data"> y los
 *   <script> de cierre. Es prosa única por lugar, no datos repetibles —
 *   forzarla a JSON no da reutilización real, solo la vuelve más frágil
 *   de editar. Ver docs/project-context/FICHAS_ARQUITECTURA.md, sección
 *   "Qué queda sin templar y por qué" para la decisión completa.
 *
 * Actualizar CUALQUIER ficha de las 51 (o cualquiera de las que se
 * sumen después) implica: 1) tocar este archivo (o ficha.css, ya
 * unificado) si es un cambio de estructura/diseño que aplica a TODAS,
 * 2) tocar el ficha.json o cuerpo.html puntual si es un cambio de
 * contenido de una sola ficha. Nunca tocar index.html a mano — se
 * regenera con `npm run fichas:build` y ese archivo queda como salida
 * de build, igual que motor.bundle.js / app.min.js (ver package.json).
 * [IMPORTANTE 5] (auditoría accesibilidad, 2026-08): se agrega el
 * skip-link "Ir al contenido principal" acá, como primer elemento del
 * <body>, en vez de tocar cuerpo.html — la misma razón de siempre: es
 * estructura compartida por las 51 fichas, no contenido editorial. La
 * convención ya existía en donde-comer-cdu/index.html e inicio/index.html
 * (con targets distintos entre sí, #contenido-principal y #main-content)
 * pero nunca se había portado a las fichas. AGENTS.md §9.2 lo documenta
 * como invariante del sitio: "el skip-link debe seguir siendo el primer
 * elemento enfocable del <body>". Envolver ${cuerpo} en <main id> (en vez
 * de exigir que cada cuerpo.html empiece con un id concreto) mantiene esa
 * garantía sin requerir tocar las 51 fichas una por una ni las que se
 * sumen después.
 */
"use strict";

// [FIX] (2026-08): dos esquemas conviven en locales/*/ficha.json — las 50
// fichas "viejas" traen ogImageBlockRaw suelto (og:url/site_name/locale y
// twitter:card/title/description quedan hardcodeados acá, og:type fijo en
// "article"); brode (la única migrada al esquema "consolidado") trae
// ogBlockRaw/twitterBlockRaw ya armados con todo adentro, más un campo
// ogType propio. El template previo asumía SOLO el esquema consolidado
// (shell.ogImageBlockRaw no existía en ningún ficha.json real) — con
// cualquier ficha vieja eso interpolaba el string literal "undefined" en
// el HTML. Estas dos constantes resuelven cuál esquema usar por ficha,
// sin duplicar og:url/twitter:card cuando el bloque consolidado ya los
// trae adentro.
function armarBloqueOg(shell) {
  if (shell.ogBlockRaw) return shell.ogBlockRaw;
  return (
    `<meta property="og:url" content="${shell.canonical}">\n` +
    `<meta property="og:site_name" content="URU SPOT">\n` +
    `<meta property="og:locale" content="es_AR">\n` +
    (shell.ogImageBlockRaw || "")
  );
}
function armarBloqueTwitter(shell) {
  if (shell.twitterBlockRaw) return shell.twitterBlockRaw;
  return (
    `<meta name="twitter:card" content="summary_large_image">\n` +
    `<meta name="twitter:title" content="${shell.ogTitle}">\n` +
    `<meta name="twitter:description" content="${shell.ogDescription}">\n` +
    (shell.twitterImageBlockRaw || "")
  );
}

function renderFicha(shell, cuerpo) {
  const ogType = shell.ogType || "article";
  const bloqueOg = armarBloqueOg(shell);
  const bloqueTwitter = armarBloqueTwitter(shell);
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="description" content="${shell.metaDescription}">
<meta name="theme-color" content="${shell.themeColor}">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
<meta property="og:title" content="${shell.ogTitle}">
<meta property="og:description" content="${shell.ogDescription}">
${bloqueOg}<meta property="og:type" content="${ogType}">

${bloqueTwitter}<link rel="canonical" href="${shell.canonical}">

<!-- Favicon/manifest (paridad con donde-comer-cdu/index.html, auditoria
     Brode 2026-08: faltaban por completo en las fichas - ver Critico 1). -->
<!-- NOTA (auditoria accesibilidad, 2026-08): el guion largo original de
     este comentario se corrompia en cada build a un byte de control
     0x14 - ver escribirLatin1() en build-fichas.js. Cambiado a guion
     simple ("-"). MISMO MOTIVO (auditoria 2026-08, ver [BUG] mas abajo
     en el header de este archivo): cualquier caracter fuera de ASCII
     escrito literal en un comentario HTML dentro de este template
     literal se emite tal cual al HTML final y rompe el mismo pipeline
     latin1 -- a diferencia de los comentarios /* JS */ de este mismo
     archivo, que nunca llegan al output y si pueden usar tildes,
     guiones largos o cualquier caracter UTF-8 sin riesgo. Por eso todo
     comentario HTML de este template usa solo ASCII plano desde
     2026-08 (auditoria pipeline latin1). -->
<link rel="manifest" href="/donde-comer-cdu/manifest.json">
<link rel="icon" type="image/svg+xml" href="/img/favicon.svg">
<link rel="icon" type="image/png" sizes="32x32" href="/img/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="192x192" href="/img/favicon-192x192.png">
<link rel="apple-touch-icon" href="/img/apple-touch-icon-180x180.png">

<title>${shell.title}</title>

<!-- Fuentes self-hosted (heredado del sistema Gold Standard de Brode,
     ver ../ficha-fonts.css): sin request externo a fonts.googleapis.com,
     render identico entre todas las fichas. -->
<link rel="preload" href="../../fonts/cormorant-garamond-latin-700-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="../../fonts/dm-sans-latin-300-normal.woff2" as="font" type="font/woff2" crossorigin>
${shell.imagePath ? `<!-- Preload de la foto del hero (candidata a LCP de esta pagina, auditoria
     Brode 2026-08): adelanta la descarga antes de que el parser llegue al
     <img> en el <body>, complementando el fetchpriority="high"+loading="eager"
     que ya trae ese tag en cuerpo.html. Usa shell.imagePath, que ya existe en
     el ficha.json de las 51 fichas -- antes vivia hardcodeado a mano solo en
     Brode y se perdia al regenerar. Misma ruta absoluta que debe usar el
     <img> del hero en cuerpo.html. Condicional (auditoria 2026-08): antes se
     emitia siempre, con href="undefined" en toda ficha sin shell.imagePath
     -- rompia el preload en las 50 fichas viejas y seguiria rompiendolo en
     cualquier ficha legitimamente sin foto de hero (ej. parrilla-la-gruta,
     hero--sin-foto por diseno). Ahora solo se emite si hay imagen real. -->
<link rel="preload" href="${shell.imagePath}" as="image" fetchpriority="high">
` : ""}<link rel="stylesheet" href="../ficha-fonts.css">
<link rel="stylesheet" href="../ficha.css">
<!-- El sistema visual de Brode (piloto "marca-naranja") se promovio a
     sistema base de TODAS las fichas - fusionado dentro de ../ficha.css
     (seccion "SISTEMA GOLD STANDARD", 2026-08). Ninguna ficha carga una
     hoja CSS propia. Ver ARCHITECTURE.md. -->
<script type="application/ld+json">
${shell.jsonLdRaw}
</script>
${shell.breadcrumbBlockRaw || ""}${shell.faqBlockRaw || ""}</head>
<body>

<!-- SKIP LINK - invariante AGENTS.md 9.2: debe ser el primer elemento
     enfocable del <body>. Apunta al <main> de mas abajo. -->
<a href="#contenido-principal" class="skip-link">Saltar al contenido</a>

<!-- NAV -->
<nav class="nav" role="navigation" aria-label="URU SPOT">
  <a href="../../" class="nav-logo">URU SPOT</a>
  <span class="nav-tag">${shell.navTag}</span>
${shell.navBadgesBlockRaw}</nav>

<main id="contenido-principal" tabindex="-1">
${cuerpo}</main>
<footer class="footer">
  <a href="../../" class="footer-logo">URU SPOT</a>
  <span>${shell.footerLine2}</span>
  <span>${shell.footerLine3}</span>
  <span><a href="/donde-comer-cdu/privacidad.html" rel="privacy-policy">Privacidad</a></span>
</footer>${shell.colaScriptsRaw}`;
}

module.exports = { renderFicha };
