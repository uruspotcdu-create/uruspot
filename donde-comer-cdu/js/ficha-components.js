'use strict';

/**
 * COMPONENTES DE FICHA — Sistema "Ficha Maestra"
 * ================================================
 * Cada función acá es un componente visual EXTRAÍDO 1:1 del markup real
 * de Brødë (donde-comer-cdu/locales/brode/, commit "Auditoría y
 * transformación visual completa de Brødë (ficha GOLD STANDARD)").
 *
 * Regla de oro: estas funciones no inventan estructura nueva. Son la
 * estructura de Brode, parametrizada. Si mañana Brode cambia (nuevo
 * componente, nuevo estado de accesibilidad, nuevo breakpoint), el
 * cambio se hace UNA vez acá y se propaga a las ~1500 fichas al
 * regenerar. Ninguna ficha vuelve a tener su propio HTML de estructura.
 *
 * Lo que NO está acá: contenido editorial (textos, precios, historia).
 * Eso vive en donde-comer-cdu/datos/fichas/<slug>.json — ver
 * scripts/generar-ficha.js y donde-comer-cdu/datos/fichas/SCHEMA.md.
 *
 * CSS/JS que estos componentes asumen (sin tocar, ya compartido por
 * las 54 fichas actuales):
 *   ../ficha.css        -> sistema base (layout, tipografía, componentes)
 *   ../ficha-fonts.css  -> fuentes self-hosted
 *   ../ficha.js         -> comportamiento (estado abierto/cerrado, compartir)
 *   ../js/rubros-meta.js
 * Más el skin de marca (ver `skin` en el schema), que reemplaza al
 * histórico "marca-naranja.css" de Brode, ahora servido desde
 * donde-comer-cdu/locales/skins/<skin>.css (compartido, no por-ficha).
 */

const { esc, escText, joinBlocks, mapOrEmpty } = require('./ficha-utils');

// ---------------------------------------------------------------------
// <head>
// ---------------------------------------------------------------------
function renderHead(d) {
  const skinLink = d.skin
    ? `<link rel="stylesheet" href="../skins/${esc(d.skin)}.css">`
    : '';

  const preloads = (d.font_preloads || []).map(
    (f) => `<link rel="preload" href="${esc(f)}" as="font" type="font/woff2" crossorigin>`
  ).join('\n');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="description" content="${esc(d.meta_description)}">
<meta name="theme-color" content="${esc(d.theme_color)}">
<meta property="og:title" content="${esc(d.og_title)}">
<meta property="og:description" content="${esc(d.og_description)}">
<meta property="og:image" content="${esc(d.og_image)}">
<meta property="og:type" content="article">
<link rel="canonical" href="${esc(d.canonical_url)}">

<title>${esc(d.title)}</title>

${preloads}
<link rel="stylesheet" href="../ficha-fonts.css">
<link rel="stylesheet" href="../ficha.css">
${skinLink}
<script type="application/ld+json">
${JSON.stringify(d.schema_org, null, 2)}
</script>
</head>`;
}

// ---------------------------------------------------------------------
// NAV
// ---------------------------------------------------------------------
function renderNav(d) {
  // El badge "Verificado" es un dato real (lugares-estado.json →
  // estado_verificacion === "VALIDADO_FINAL"), nunca decorativo.
  // Ver AGENTS.md, Glosario "Verificado".
  const verificado = d.verificado
    ? `<span class="badge-verificado"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 1.5l2.35 1.4 2.72-.2 1.02 2.53 2.41 1.3-.66 2.67.66 2.67-2.41 1.3-1.02 2.53-2.72-.2L10 18.5l-2.35-1.4-2.72.2-1.02-2.53-2.41-1.3.66-2.67-.66-2.67 2.41-1.3L4.93 2.7l2.72.2L10 1.5z" fill="currentColor" opacity="0.15"/><path d="M6.5 10.2l2.2 2.2 4.8-4.9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>Verificado por URU SPOT</span>`
    : '';
  const badge = d.nav_badge ? `<span class="nav-badge">${esc(d.nav_badge)}</span>` : '';

  return `<!-- NAV -->
<nav class="nav" role="navigation" aria-label="URU SPOT">
  <a href="../../" class="nav-logo">URU SPOT</a>
  <span class="nav-tag">${esc(d.nav_tag || 'Guía gastronómica · Concepción del Uruguay')}</span>
  ${verificado}
  ${badge}
</nav>`;
}

// ---------------------------------------------------------------------
// HERO
// ---------------------------------------------------------------------
function renderHero(d) {
  const h = d.hero;
  const chips = (h.chips || []).map((c) => {
    // Chip normal, o chip-link a Google Maps con el rating real de Google
    // (distinto del URU SPOT Score) — patrón usado en varias fichas.
    if (c.type === 'google_link') {
      return `<a class="chip chip-google" href="${c.href}" target="_blank" rel="noopener noreferrer" aria-label="${esc(c.aria_label)}">${esc(c.text)}</a>`;
    }
    return `<span class="chip ${c.gold ? 'chip-gold' : ''}">${esc(c.text)}</span>`;
  }).join('');
  // Las estrellas del hero-score reflejan el rating real (Google u otro),
  // no una conversión automática del URU SPOT Score — si el dato no
  // trae `stars` explícito, se aproxima desde `score` como fallback.
  const starCount = h.stars !== undefined ? h.stars : Math.round((h.score || 0) / 2);
  const stars = '★★★★★'.slice(0, Math.max(0, Math.min(5, starCount)));

  return `<!-- HERO -->
<section class="hero " aria-label="${esc(d.nombre)}">
  <img class="hero-img" src="${esc(h.image)}" alt="${esc(h.image_alt)}" fetchpriority="high" loading="eager" width="${esc(h.image_width || 1200)}" height="${esc(h.image_height || 800)}" />
  <div class="hero-overlay" aria-hidden="true"></div>
  <div class="hero-content">
    <div class="hero-eyebrow">
      <span class="eyebrow-line" aria-hidden="true"></span>
      <span class="eyebrow-text">${esc(h.eyebrow)}</span>
    </div>
    <h1 class="hero-title">${h.title_html}</h1>
    <p class="hero-subtitle">${esc(h.subtitle)}</p>
    <div class="hero-chips">${chips}</div>
  </div>
  <div class="hero-score" aria-label="Puntuación URU SPOT: ${esc(h.score)} de 10">
    <div class="score-num">${esc(h.score)}</div>
    <div class="score-label">URU SPOT Score</div>
    <div class="score-stars" aria-hidden="true">${stars}</div>
  </div>
</section>`;
}

// ---------------------------------------------------------------------
// INFO STRIP (genérico — se usa para "Información rápida" y para
// "Accesos oficiales", que en Brode son dos <div class="info-strip">
// consecutivos con la misma estructura de celda)
// ---------------------------------------------------------------------
function renderInfoCell(cell) {
  const actions = (cell.actions || []).length
    ? `<div class="action-row" style="margin-top:12px">${cell.actions.map(
        (a) => `<a href="${esc(a.href)}" class="btn ${a.primary ? 'btn-primary' : 'btn-ghost'}" target="${a.target || '_blank'}" rel="noopener noreferrer">${esc(a.label)}</a>`
      ).join('')}</div>`
    : '';
  const sub = cell.sub_id
    ? `<span class="info-cell-sub" id="${esc(cell.sub_id)}" aria-live="polite"></span>`
    : cell.sub ? `<span class="info-cell-sub">${esc(cell.sub)}</span>` : '';
  const value = cell.value_id
    ? `<span class="info-cell-value" id="${esc(cell.value_id)}">${esc(cell.value || '—')}</span>`
    : `<span class="info-cell-value">${esc(cell.value)}</span>`;

  return `  <div class="info-cell">
    <span class="info-cell-label">${esc(cell.label)}</span>
    ${value}
    ${sub}
    ${actions}
  </div>`;
}

function renderInfoStrip(cells, ariaLabel, extraStyle) {
  if (!cells || !cells.length) return '';
  const style = extraStyle ? ` style="${extraStyle}"` : '';
  return `<div class="info-strip" role="complementary" aria-label="${esc(ariaLabel)}"${style}>
${cells.map(renderInfoCell).join('\n')}
</div>`;
}

// ---------------------------------------------------------------------
// SECCIÓN GENÉRICA "page" con about-grid (texto + side-box/galería)
// Usada por: about, historia, percepción — cualquier bloque de
// "columna principal + columna lateral" del diseño de Brode.
// ---------------------------------------------------------------------
function renderTagsRow(tags, label) {
  if (!tags || !tags.length) return '';
  return `<div class="tags-row" aria-label="${esc(label)}">${tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>`;
}

function renderPullquote(text) {
  if (!text) return '';
  return `<div class="pullquote"><p>${escText(text)}</p></div>`;
}

function renderGallery(images, label) {
  if (!images || !images.length) return '';
  const items = images.map(
    (img, i) => `    <div class="gallery-item ${i === 0 ? 'gallery-main' : ''}">
      <img src="${esc(img.src)}" alt="${esc(img.alt)}" loading="lazy" decoding="async" />
    </div>`
  ).join('\n');
  return `<div class="gallery" aria-label="${esc(label)}">
${items}
</div>`;
}

function renderSideBox(box) {
  if (!box) return '';
  const rows = (box.rows || []).map((r) => {
    if (r.value !== undefined) {
      // fila tipo "Precios verificados": etiqueta + valor + caption opcional
      const caption = r.caption ? `<span class="side-box-caption">${esc(r.caption)}</span>` : '';
      return `<li><div class="side-box-row"><strong>${esc(r.label)}</strong><span class="side-box-val">${esc(r.value)}</span></div>${caption}</li>`;
    }
    // fila tipo "En una mirada" / "Línea de tiempo": etiqueta + texto libre
    return `<li><strong>${escText(r.label)}</strong>${escText(r.text)}</li>`;
  }).join('\n        ');
  const cta = box.cta ? `<a href="${esc(box.cta.href)}" class="side-box-cta" target="_blank" rel="noopener noreferrer">${esc(box.cta.label)}</a>` : '';
  const footnote = box.footnote ? `<p style="font-size:11px;color:var(--muted);margin-top:16px;line-height:1.6;padding-top:12px;border-top:1px solid rgba(var(--gold-rgb),0.2)"><em>${esc(box.footnote)}</em></p>` : '';

  return `<div class="side-box" aria-label="${esc(box.label)}">
      <div class="side-box-title">${esc(box.title)}</div>
      <ul>
        ${rows}
      </ul>
      ${cta}
      ${footnote}
    </div>`;
}

function renderSourceNote(text) {
  if (!text) return '';
  return `<p style="font-size:11px;color:var(--muted);margin-top:10px;letter-spacing:0.03em">${esc(text)}</p>`;
}

// ---- ABOUT ----
function renderAbout(d) {
  const s = d.about;
  if (!s) return '';
  const paras = (s.paragraphs_html || []).map((p) => `<p class="about-body">${p}</p>`).join('');
  return `<!-- ABOUT -->
<section class="page" aria-labelledby="about-heading">
  <div class="section-header">
    <span class="section-label">Sobre el lugar</span>
    <span class="section-line" aria-hidden="true"></span>
  </div>
  <div class="about-grid">
    <div>
      <h2 class="about-title" id="about-heading">${s.title_html}</h2>
      ${paras}
      ${renderPullquote(s.pullquote)}
      ${renderTagsRow(s.tags, 'Características del lugar')}
    </div>
    <div>
      ${renderGallery(s.gallery, `Galería de fotos de ${d.nombre}`)}
    </div>
  </div>
</section>`;
}

// ---- HISTORIA (texto + línea de tiempo lateral) ----
function renderHistoria(d) {
  const s = d.historia;
  if (!s) return '';
  const paras = (s.paragraphs_html || []).map((p) => `<p class="about-body">${p}</p>`).join('\n      ');
  return `<!-- HISTORIA -->
<section class="page" aria-labelledby="historia-heading">
  <div class="section-header">
    <h2 class="section-label" id="historia-heading">${esc(s.heading)}</h2>
    <span class="section-line" aria-hidden="true"></span>
  </div>
  <div class="about-grid">
    <div>
      ${paras}
      ${renderPullquote(s.pullquote)}
      ${renderSourceNote(s.source_note)}
    </div>
    ${renderSideBox(s.side_box)}
  </div>
</section>`;
}

// ---- CATÁLOGO (franja cálida section-warm, texto + side-box de precios) ----
function renderCatalogo(d) {
  const s = d.catalogo;
  if (!s) return '';
  const groups = (s.groups || []).map(
    (g) => `<h3 class="about-title" style="font-size:1.1rem;color:var(--ink);font-weight:600;margin-top:28px">${esc(g.title)}</h3>
      <p class="about-body">${g.body_html}</p>`
  ).join('\n      ');
  const actions = (s.actions || []).map(
    (a) => `<a href="${esc(a.href)}" class="btn ${a.primary ? 'btn-primary' : 'btn-ghost btn-ghost-onlight'}" target="_blank" rel="noopener noreferrer">${esc(a.label)}</a>`
  ).join('');

  return `<!-- CATÁLOGO -->
<section class="section-warm" aria-labelledby="catalogo-heading">
<div class="page">
  <div class="section-header">
    <h2 class="section-label" id="catalogo-heading">${esc(s.heading)}</h2>
    <span class="section-line" aria-hidden="true"></span>
  </div>
  <div class="about-grid">
    <div>
      <p class="about-body" style="margin-bottom:32px;font-size:16px;font-weight:400">${s.intro_html}</p>
      ${groups}
      ${s.closing_html ? `<p class="about-body">${s.closing_html}</p>` : ''}
      ${s.warning_html ? `<p style="font-size:12px;color:var(--muted);margin-top:16px;line-height:1.6;padding:16px;background:rgba(var(--gold-rgb),0.06);border-left:3px solid var(--gold);border-radius:2px">⚠️ ${s.warning_html}</p>` : ''}
      <div class="action-row" style="margin-top:16px;flex-wrap:wrap">${actions}</div>
    </div>
    ${renderSideBox(s.side_box)}
  </div>
</div>
</section>`;
}

// ---- PERCEPCIÓN PÚBLICA (opcional, mismo patrón texto + side-box) ----
function renderPercepcion(d) {
  const s = d.percepcion;
  if (!s) return '';
  const paras = (s.paragraphs_html || []).map((p) => `<p class="about-body">${p}</p>`).join('\n      ');
  return `<!-- PERCEPCIÓN PÚBLICA -->
<section class="page" aria-labelledby="percepcion-heading">
  <div class="section-header">
    <h2 class="section-label" id="percepcion-heading">${esc(s.heading)}</h2>
    <span class="section-line" aria-hidden="true"></span>
  </div>
  <div class="about-grid">
    <div>
      ${paras}
      ${renderSourceNote(s.source_note)}
    </div>
    ${renderSideBox(s.side_box)}
  </div>
</section>`;
}

// ---- HIGHLIGHTS (grilla "01/02/03") ----
function renderHighlights(d) {
  const items = d.highlights;
  if (!items || !items.length) return '';
  const cards = items.map(
    (h, i) => `  <div class="highlight-card" role="listitem">
    <div class="highlight-num" aria-hidden="true">${String(i + 1).padStart(2, '0')}</div>
    <div class="highlight-title">${escText(h.title)}</div>
    <p class="highlight-text">${escText(h.text)}</p>
  </div>`
  ).join('\n  ');
  return `<!-- HIGHLIGHTS -->
<div class="highlights-grid" role="list" aria-label="Lo mejor del lugar">
  ${cards}
</div>`;
}

// ---- SCORES ----
function renderScores(d) {
  const s = d.scores;
  if (!s) return '';
  const rows = (s.categories || []).map((c) => {
    const pct = Math.round((c.value / 10) * 100);
    return `        <div class="score-row">
          <div class="score-row-top">
            <span class="score-name">${esc(c.label)}</span>
            <span class="score-val">${esc(c.value)}</span>
          </div>
          <div class="score-track">
            <div class="score-fill" data-width="${pct}%" role="meter" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(c.label)}: ${esc(c.value)} de 10"></div>
          </div>
        </div>`;
  }).join('\n');

  return `<!-- SCORES -->
<section class="scores-section" aria-labelledby="scores-heading">
  <div class="scores-inner">
    <div class="section-header">
      <h2 class="section-label" id="scores-heading">URU SPOT Score</h2>
      <span class="section-line" aria-hidden="true"></span>
    </div>
    <div class="scores-grid">
      <div class="score-big" aria-label="Puntuación total: ${esc(s.total)} de 10">
        <div class="score-big-num">${esc(s.total)}</div>
        <div class="score-big-den">/ 10</div>
        <div class="score-big-label">Puntuación URU SPOT</div>
        <div class="score-big-reviews">Basado en ${esc(s.review_count)} reseñas verificadas</div>
      </div>
      <div class="score-bars">
${rows}
      </div>
    </div>
  </div>
</section>`;
}

// ---- HORARIOS (schedule-block, con status pill dinámico via ficha.js) ----
function renderSchedule(d) {
  const s = d.schedule;
  if (!s) return '';
  const rows = (s.rows || []).map(
    (r) => `    <div class="schedule-row">
      <span class="schedule-day">${esc(r.day)}</span>
      <span class="${r.closed ? 'schedule-time-closed' : 'schedule-time'}">${esc(r.time)}</span>
    </div>`
  ).join('\n');
  const adn = (s.adn_list || []).map((i) => `<li>${esc(i)}</li>`).join('');
  const actions = (s.actions || []).map(
    (a) => `<a href="${esc(a.href)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary">${esc(a.label)}</a>`
  ).join('');

  const priceNote = s.price_note
    ? `<div class="schedule-note" style="margin-top:24px">
      <div class="schedule-note-label">${esc(s.price_note.label || 'Precio estimado por persona')}</div>
      <div class="schedule-note-val">${esc(s.price_note.value)}</div>
      ${s.price_note.sub ? `<div class="schedule-note-sub">${esc(s.price_note.sub)}</div>` : ''}
    </div>`
    : '';

  return `<!-- HORARIOS -->
<div class="schedule-block" aria-labelledby="schedule-heading">
  <div>
    <h2 class="schedule-title" id="schedule-heading">${esc(s.heading || 'Horarios de atención')}</h2>
${rows}
    ${priceNote}
    <ul class="adn-list" aria-label="Características" style="margin-top:28px">${adn}</ul>
    <p style="font-size:11px;color:#ffffff;margin-top:16px;letter-spacing:0.05em">${esc(s.updated_note || 'Información actualizada')}</p>
  </div>
  <div>
    <div style="margin-bottom:24px" aria-live="polite">
      <div id="schedStatusPill" class="status-pill" style="background:rgba(68,153,111,0.15);color:#ffffff">
        <span class="status-dot" id="schedDot" aria-hidden="true" style="background:#ffffff"></span>
        <span id="schedStatusText">Cargando…</span>
      </div>
      <p id="schedInfo" style="font-size:12px;color:#ffffff;margin-top:8px"></p>
    </div>
    <div style="display:flex;flex-direction:column;gap:12px">
      ${actions}
      <button id="share-btn" class="btn btn-ghost" aria-label="Compartir esta página">📤 Compartir</button>
    </div>
  </div>
</div>`;
}

// ---- MAPA ----
function renderMap(d) {
  const m = d.map;
  if (!m) return '';
  return `<!-- MAPA -->
<section class="map-section" aria-labelledby="map-heading">
  <div class="map-inner">
    <div class="section-header">
      <span class="section-label">Cómo llegar</span>
      <span class="section-line" aria-hidden="true"></span>
    </div>
    <div class="map-grid">
      <div class="map-frame">
        <iframe title="Ubicación de ${esc(d.nombre)} en Google Maps" src="${esc(m.embed_src)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>
      </div>
      <div>
        <h2 class="map-info-title" id="map-heading">${esc(m.title)}</h2>
        <strong>Dirección:</strong> ${esc(m.direccion)}<br>
        <strong>Zona:</strong> ${esc(m.zona)}<br>
        <strong>Recomendación:</strong> ${esc(m.recomendacion)}<br>
        ${m.tambien_disponible ? `<strong>También disponible en:</strong> ${esc(m.tambien_disponible)}` : ''}
        <div style="margin-top:28px;display:flex;flex-direction:column;gap:10px">
          <a href="${esc(m.google_maps_url)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary">🗺️ Cómo llegar</a>${m.whatsapp_url ? `<a href="${esc(m.whatsapp_url)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary">💬 Consultar por WhatsApp</a>` : ''}
        </div>
      </div>
    </div>
  </div>
</section>`;
}

// ---- PRESENCIA DIGITAL ----
function renderDigital(d) {
  const s = d.digital;
  if (!s) return '';
  const paras = (s.paragraphs_html || []).map((p) => `<p class="about-body">${p}</p>`).join('\n      ');
  const subheads = (s.subsections || []).map(
    (sub) => `<h3 class="about-title" style="font-size:1.1rem;color:var(--ink);font-weight:600;margin-top:28px">${esc(sub.title)}</h3>
      <p class="about-body">${sub.body_html}</p>`
  ).join('\n      ');
  const actions = (s.actions || []).map(
    (a) => `<a href="${esc(a.href)}" target="_blank" rel="noopener noreferrer" class="btn ${a.primary ? 'btn-primary' : 'btn-ghost btn-ghost-onlight'}">${esc(a.label)}</a>`
  ).join('');

  return `<!-- PRESENCIA DIGITAL -->
<section class="section-warm-soft" aria-labelledby="digital-heading">
<div class="page">
  <div class="section-header">
    <h2 class="section-label" id="digital-heading">${esc(s.heading)}</h2>
    <span class="section-line" aria-hidden="true"></span>
  </div>
  <div class="about-grid">
    <div>
      ${paras}
      ${subheads}
      <div class="action-row" style="margin-top:16px;flex-wrap:wrap">${actions}</div>
      ${renderSourceNote(s.source_note)}
    </div>
    ${renderSideBox(s.side_box)}
  </div>
</div>
</section>`;
}

// ---- FAQ (dos columnas) ----
function renderFaq(d) {
  const s = d.faq;
  if (!s || !s.items || !s.items.length) return '';
  const half = Math.ceil(s.items.length / 2);
  const col = (items) => items.map(
    (it) => `<h3 class="about-title" style="font-size:1.1rem;color:var(--ink);font-weight:600;margin-top:28px">${esc(it.q)}</h3>
      <p class="about-body">${it.a_html}</p>`
  ).join('\n      ');

  return `<!-- FAQ -->
<section class="page" aria-labelledby="faq-heading">
  <div class="section-header">
    <h2 class="section-label" id="faq-heading">Preguntas frecuentes</h2>
    <span class="section-line" aria-hidden="true"></span>
  </div>
  <div class="about-grid">
    <div>
      ${col(s.items.slice(0, half))}
    </div>
    <div>
      ${col(s.items.slice(half))}
    </div>
  </div>
</section>`;
}

// ---- VEREDICTO ----
function renderVerdict(d) {
  const s = d.verdict;
  if (!s) return '';
  return `<!-- VERDICT -->
<section class="verdict-section" aria-labelledby="verdict-section-heading">
  <div class="verdict-inner">
    <div class="section-header">
      <h2 class="section-label" id="verdict-section-heading">Veredicto URU SPOT</h2>
      <span class="section-line" aria-hidden="true"></span>
    </div>
    <div class="verdict-card">
      <div class="verdict-accent" aria-hidden="true"></div>
      <div class="verdict-content">
        <div class="verdict-label" id="verdict-heading">${esc(s.label)}</div>
        <p class="verdict-text">${esc(s.text)}</p>
      </div>
    </div>
  </div>
</section>`;
}

// ---- FOOTER + script de datos + scripts de cierre ----
function renderFooter(d) {
  const note = (d && d.footer_note) || 'Información verificada y actualizada — Agosto 2026';
  return `<!-- FOOTER -->
<footer class="footer">
  <a href="../../" class="footer-logo">URU SPOT</a>
  <span>Guía gastronómica de Concepción del Uruguay</span>
  <span>${esc(note)}</span>
</footer>`;
}

function renderFichaDataScript(d) {
  const payload = {
    nombre: d.nombre,
    rubro: d.rubro,
    schedule_rows: (d.schedule && d.schedule.rows) || [],
    share_text: d.share_text,
  };
  return `<script id="ficha-data" type="application/json">
${JSON.stringify(payload)}
</script>`;
}

function renderClosingScripts() {
  return `<script src="../js/rubros-meta.js" defer></script>
<script src="../ficha.js" defer></script>`;
}

module.exports = {
  renderHead,
  renderNav,
  renderHero,
  renderInfoStrip,
  renderAbout,
  renderHistoria,
  renderCatalogo,
  renderPercepcion,
  renderHighlights,
  renderScores,
  renderSchedule,
  renderMap,
  renderDigital,
  renderFaq,
  renderVerdict,
  renderFooter,
  renderFichaDataScript,
  renderClosingScripts,
};
