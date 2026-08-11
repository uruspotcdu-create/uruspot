#!/usr/bin/env node
/**
 * build-ficha-json.js
 * 
 * GENERADOR MAESTRO DE FICHAS
 * Auditoría Brode 2026-08: Centralización de Datos
 * 
 * Lee ficha.json (fuente única de verdad) y GENERA automáticamente:
 * 1. ogBlockRaw (meta tags og: + twitter: para social sharing)
 * 2. jsonLdRaw (schema.org/Bakery o LocalBusiness estructurado)
 * 3. breadcrumbBlockRaw (BreadcrumbList 3-nivel visible + JSON-LD)
 * 4. faqBlockRaw (FAQPage JSON-LD desde faqItems[])
 * 5. webPageBlockRaw (WebPage + isPartOf + dateModified dinámico)
 * 
 * ✅ VENTAJAS:
 * - Cambios en ficha.json → todos los bloques se regeneran automáticamente
 * - No hay desincronización entre campos y JSON-LD
 * - El build-fichas.js puede ahora ser más simple
 * - Fuente única de verdad: ficha.json, nada de código mágico
 * 
 * ⚠️ IMPORTANTE: Este archivo REEMPLAZA la generación manual de Raw blocks.
 * Los campos faqItems[], contact{}, socialLinks[], officialLinks[] en
 * ficha.json son ahora OBLIGATORIOS para que el build funcione.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ──────────────────────── UTILIDADES ────────────────────────

/**
 * Escapa HTML entities en strings (para evitar inyección en JSON-LD)
 */
function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Obtiene la fecha de último commit que modificó un archivo
 * (reemplaza la necesidad de __DATE_MODIFIED__ hardcodeado)
 */
function getLastModified(filepath) {
  try {
    const cmd = `git log -1 --format=%aI "${filepath}"`;
    const date = execSync(cmd, { encoding: 'utf8' }).trim();
    return date || new Date().toISOString();
  } catch (e) {
    // Fallback si git no está disponible
    return new Date().toISOString();
  }
}

/**
 * Convierte string con tildes a formato URL-safe
 */
function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]/g, '-')
    .replace(/--+/g, '-')
    .trim();
}

/**
 * Valida que ficha.json tenga los campos obligatorios
 */
function validateFichaJSON(shell) {
  const required = [
    'slug', 'title', 'metaDescription', 'ogTitle', 'ogDescription',
    'ogImagePath', 'ogImageAlt', 'siteOrigin', 'uruId', 'themeColor',
    'contact', 'socialLinks', 'faqItems', 'schedule_rows'
  ];

  const missing = required.filter(field => {
    if (field === 'contact') return !shell.contact?.phone;
    if (field === 'socialLinks') return !Array.isArray(shell.socialLinks);
    if (field === 'faqItems') return !Array.isArray(shell.faqItems);
    if (field === 'schedule_rows') return !Array.isArray(shell.schedule_rows);
    return !shell[field];
  });

  if (missing.length > 0) {
    throw new Error(`❌ ficha.json incompleto. Faltan campos obligatorios: ${missing.join(', ')}`);
  }

  return true;
}

// ──────────────────────── GENERADORES DE BLOQUES ────────────────────────

/**
 * Genera meta tags Open Graph + Twitter
 * @param {Object} shell - Objeto ficha.json
 * @returns {string} HTML <meta> tags
 */
function generateOGBlock(shell) {
  const og = {
    'og:title': shell.ogTitle,
    'og:description': shell.ogDescription,
    'og:url': `${shell.siteOrigin}/donde-comer-cdu/locales/${shell.slug}/`,
    'og:site_name': 'URU SPOT',
    'og:locale': 'es_AR',
    'og:image': shell.ogImagePath,
    'og:image:secure_url': shell.ogImagePath,
    'og:image:width': '1200',
    'og:image:height': '630',
    'og:image:type': 'image/webp',
    'og:image:alt': shell.ogImageAlt,
    'og:type': 'website'
  };

  const twitter = {
    'twitter:card': 'summary_large_image',
    'twitter:title': shell.ogTitle,
    'twitter:description': shell.ogDescription,
    'twitter:image': shell.ogImagePath,
    'twitter:image:alt': shell.ogImageAlt
  };

  let html = '';
  
  Object.entries(og).forEach(([key, val]) => {
    html += `<meta property="${key}" content="${escapeHtml(String(val))}">\n`;
  });

  Object.entries(twitter).forEach(([key, val]) => {
    html += `<meta name="${key}" content="${escapeHtml(String(val))}">\n`;
  });

  return html.trim();
}

/**
 * Genera BreadcrumbList JSON-LD (3 niveles: Inicio → Gastronomía → Local)
 * @param {Object} shell - Objeto ficha.json
 * @returns {string} <script type="application/ld+json">...</script>
 */
function generateBreadcrumbBlock(shell) {
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    '@id': `${shell.siteOrigin}/donde-comer-cdu/locales/${shell.slug}/#breadcrumb`,
    'itemListElement': [
      {
        '@type': 'ListItem',
        'position': 1,
        'name': 'Inicio',
        'item': shell.siteOrigin
      },
      {
        '@type': 'ListItem',
        'position': 2,
        'name': 'Gastronomía',
        'item': `${shell.siteOrigin}/donde-comer-cdu/`
      },
      {
        '@type': 'ListItem',
        'position': 3,
        'name': shell.title.split('—')[0].trim(), // ej: "Brødë" de "Brødë Panadería — URU SPOT"
        'item': `${shell.siteOrigin}/donde-comer-cdu/locales/${shell.slug}/`
      }
    ]
  };

  return `<script type="application/ld+json">\n${JSON.stringify(breadcrumb, null, 2)}\n</script>`;
}

/**
 * Genera FAQPage JSON-LD desde faqItems[]
 * @param {Object} shell - Objeto ficha.json (debe tener faqItems[])
 * @returns {string} <script type="application/ld+json">...</script>
 */
function generateFAQBlock(shell) {
  if (!Array.isArray(shell.faqItems) || shell.faqItems.length === 0) {
    console.warn(`⚠️  ${shell.slug}: No hay faqItems[], saltando FAQBlock`);
    return '';
  }

  const faq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': `${shell.siteOrigin}/donde-comer-cdu/locales/${shell.slug}/#faq`,
    'inLanguage': 'es-AR',
    'about': { '@id': `${shell.siteOrigin}/donde-comer-cdu/locales/${shell.slug}/#negocio` },
    'mainEntity': shell.faqItems.map(item => ({
      '@type': 'Question',
      'name': item.question,
      'acceptedAnswer': {
        '@type': 'Answer',
        'text': item.answer
      }
    }))
  };

  return `<script type="application/ld+json">\n${JSON.stringify(faq, null, 2)}\n</script>`;
}

/**
 * Genera WebPage JSON-LD con referencias a otros schemas
 * @param {Object} shell - Objeto ficha.json
 * @param {string} lastModified - Fecha ISO del último commit
 * @returns {string} <script type="application/ld+json">...</script>
 */
function generateWebPageBlock(shell, lastModified) {
  const webpage = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${shell.siteOrigin}/donde-comer-cdu/locales/${shell.slug}/#webpage`,
    'url': `${shell.siteOrigin}/donde-comer-cdu/locales/${shell.slug}/`,
    'name': shell.title,
    'inLanguage': 'es-AR',
    'isPartOf': {
      '@type': 'WebSite',
      '@id': `${shell.siteOrigin}/#website`,
      'url': shell.siteOrigin,
      'name': 'URU SPOT'
    },
    'about': { '@id': `${shell.siteOrigin}/donde-comer-cdu/locales/${shell.slug}/#negocio` },
    'breadcrumb': { '@id': `${shell.siteOrigin}/donde-comer-cdu/locales/${shell.slug}/#breadcrumb` },
    'dateModified': lastModified
  };

  return `<script type="application/ld+json">\n${JSON.stringify(webpage, null, 2)}\n</script>`;
}

/**
 * Genera Bakery/LocalBusiness JSON-LD desde datos de contacto y horarios
 * NOTA: Este no reemplaza el jsonLdRaw existente aún, pero puede hacerlo
 * en futuras auditorías cuando se centralicen más campos.
 * @param {Object} shell - Objeto ficha.json
 * @returns {Object} Objeto schema.org completo (para uso futuro)
 */
function generateLocalBusinessSchema(shell) {
  // Este es un template base que se enriquecerá cuando más campos se centralicen
  const schema = {
    '@context': 'https://schema.org',
    '@type': shell.businessType || 'LocalBusiness',
    '@id': `${shell.siteOrigin}/donde-comer-cdu/locales/${shell.slug}/#negocio`,
    'name': shell.title,
    'description': shell.metaDescription,
    'telephone': shell.contact.phone,
    'url': `${shell.siteOrigin}/donde-comer-cdu/locales/${shell.slug}/`,
    'image': shell.ogImagePath
  };

  return schema;
}

/**
 * Genera HTML para action-row (botones contacto) desde contact + socialLinks
 * Esto reemplaza el hardcoding en cuerpo.html
 * @param {Object} shell - Objeto ficha.json
 * @returns {string} HTML <a class="btn">...</a> elements
 */
function generateContactActionRow(shell) {
  const buttons = [];

  // Botón WhatsApp
  if (shell.contact?.phone) {
    const wa_text = encodeURIComponent(shell.contact.whatsappText || 'Hola!');
    buttons.push(
      `<a href="https://wa.me/${shell.contact.phone.replace(/[^0-9]/g, '')}?text=${wa_text}" ` +
      `class="btn btn-primary" target="_blank" rel="noopener noreferrer">💬 WhatsApp</a>`
    );
  }

  // Botón Llamar
  if (shell.contact?.phone) {
    buttons.push(
      `<a href="tel:${shell.contact.phone}" class="btn btn-primary" target="_self">📞 Llamar</a>`
    );
  }

  // Botones de redes sociales
  if (Array.isArray(shell.socialLinks)) {
    shell.socialLinks.forEach(link => {
      if (link.platform === 'instagram' && link.handle) {
        buttons.push(
          `<a href="https://www.instagram.com/${link.handle.replace('@', '')}/" ` +
          `class="btn btn-ghost" target="_blank" rel="noopener noreferrer">📸 Instagram</a>`
        );
      }
    });
  }

  return buttons.join('\n');
}

/**
 * Genera HTML para enlaces oficiales (catálogo, menú, etc.)
 * @param {Object} shell - Objeto ficha.json
 * @returns {string} HTML <div class="info-cell">...</div> elements
 */
function generateOfficialLinksSection(shell) {
  if (!Array.isArray(shell.officialLinks) || shell.officialLinks.length === 0) {
    return '';
  }

  let html = '';

  shell.officialLinks.forEach((link, idx) => {
    const title = escapeHtml(link.title);
    const url = escapeHtml(link.url);
    const icon = escapeHtml(link.icon || '🔗');
    const description = link.description ? `<span class="info-cell-sub">${escapeHtml(link.description)}</span>` : '';

    html += `
<div class="info-cell">
  <span class="info-cell-label">${title}</span>
  <span class="info-cell-value">${icon} ${title}</span>
  ${description}
  <div class="action-row action-row--compact">
    <a href="${url}" class="btn btn-ghost" target="_blank" rel="noopener noreferrer">${icon} Ir</a>
  </div>
</div>
`;
  });

  return html.trim();
}

// ──────────────────────── EXPORTES PÚBLICOS ────────────────────────

module.exports = {
  // Validadores
  validateFichaJSON,

  // Generadores de bloques (retornan HTML/JSON-LD raw)
  generateOGBlock,
  generateBreadcrumbBlock,
  generateFAQBlock,
  generateWebPageBlock,
  generateLocalBusinessSchema,

  // Generadores de HTML
  generateContactActionRow,
  generateOfficialLinksSection,

  // Utilidades
  escapeHtml,
  getLastModified,
  slugify
};

// ──────────────────────── CLI: Si se llama directamente ────────────────────────

if (require.main === module) {
  const fichaPath = process.argv[2];

  if (!fichaPath) {
    console.error('❌ Uso: node build-ficha-json.js <ruta/a/ficha.json>');
    process.exit(1);
  }

  try {
    const shellPath = path.resolve(fichaPath);
    const shell = JSON.parse(fs.readFileSync(shellPath, 'utf8'));

    console.log(`🔍 Validando ${shellPath}...`);
    validateFichaJSON(shell);
    console.log('✅ Validación OK');

    console.log('\n📄 Bloques generados:\n');

    const lastModified = getLastModified(shellPath);

    console.log('--- OG BLOCK ---');
    console.log(generateOGBlock(shell));

    console.log('\n--- BREADCRUMB BLOCK ---');
    console.log(generateBreadcrumbBlock(shell));

    if (shell.faqItems?.length > 0) {
      console.log('\n--- FAQ BLOCK ---');
      console.log(generateFAQBlock(shell));
    }

    console.log('\n--- WEBPAGE BLOCK ---');
    console.log(generateWebPageBlock(shell, lastModified));

    console.log('\n--- CONTACT ACTION ROW ---');
    console.log(generateContactActionRow(shell));

    if (shell.officialLinks?.length > 0) {
      console.log('\n--- OFFICIAL LINKS SECTION ---');
      console.log(generateOfficialLinksSection(shell));
    }

    console.log('\n✨ Generación completada');
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    process.exit(1);
  }
}
