/* ficha-template.js — ÚNICA fuente de la estructura HTML compartida por
 * las fichas de donde-comer-cdu/locales/ (<!DOCTYPE>, <head>, <nav>,
 * <footer>, orden de <script>). Basada en la estructura de Brode, la
 * ficha GOLD STANDARD del sitio (ver ARCHITECTURE.md).
 *
 * Qué SÍ arma este template (datos → HTML, `shell` de ficha.json):
 *   <title>, meta description/theme-color/og:*, <link rel="canonical">,
 *   bloque JSON-LD, <nav>, <footer>, orden de <link>/<script>.
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
 */
"use strict";

function renderFicha(shell, cuerpo) {
  // el-arca-resto-bar y papa-luigi no tienen nav-badge (gap real
  // preexistente, no se inventa uno).
  const navBadgeHtml = shell.navBadge
    ? `  <span class="nav-badge">${shell.navBadge}</span>\n`
    : "";

  // Ver comentario en extraer-fichas.js: bloque opcional, hoy exclusivo
  // de Brode, preservado literal (incluye su propio comentario
  // explicativo de la condición real de datos).
  const navBadgeVerificadoHtml = shell.navBadgeVerificadoRaw || "";

  // parrilla-la-gruta es la única ficha sin og:image hoy (gap real
  // preexistente, ver extraer-fichas.js) — se omite la etiqueta entera
  // en vez de emitir content="undefined" o inventar una imagen.
  const ogImageTag = shell.ogImage
    ? `<meta property="og:image" content="${shell.ogImage}">\n`
    : "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="description" content="${shell.metaDescription}">
<meta name="theme-color" content="${shell.themeColor}">
<meta property="og:title" content="${shell.ogTitle}">
<meta property="og:description" content="${shell.ogDescription}">
${ogImageTag}<meta property="og:type" content="article">
<link rel="canonical" href="${shell.canonical}">

<title>${shell.title}</title>

<!-- Fuentes self-hosted (heredado del sistema Gold Standard de Brode,
     ver ../ficha-fonts.css): sin request externo a fonts.googleapis.com,
     render identico entre todas las fichas. -->
<link rel="preload" href="../fonts/cormorant-garamond-latin-700-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="../fonts/dm-sans-latin-300-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="../ficha-fonts.css">
<link rel="stylesheet" href="../ficha.css">
<!-- El sistema visual de Brode (piloto "marca-naranja") se promovió a
     sistema base de TODAS las fichas — fusionado dentro de ../ficha.css
     (sección "SISTEMA GOLD STANDARD", 2026-08). Ninguna ficha carga una
     hoja CSS propia. Ver ARCHITECTURE.md. -->
<script type="application/ld+json">
${shell.jsonLdRaw}
</script>
</head>
<body>

<!-- NAV -->
<nav class="nav" role="navigation" aria-label="URU SPOT">
  <a href="../../" class="nav-logo">URU SPOT</a>
  <span class="nav-tag">${shell.navTag}</span>
${navBadgeVerificadoHtml}${navBadgeHtml}</nav>

${cuerpo}<footer class="footer">
  <a href="../../" class="footer-logo">URU SPOT</a>
  <span>${shell.footerLine2}</span>
  <span>${shell.footerLine3}</span>
</footer>
${shell.colaScriptsRaw}`;
}

module.exports = { renderFicha };
