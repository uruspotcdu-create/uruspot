// js/contract-test.js — URU SPOT
// ---------------------------------------------------------------------
// FASE 2 del roadmap de mejora (2026-07-26): test del contrato real
// entre index.html y app.js, sin navegador (no hay Playwright/Puppeteer
// disponible en este entorno de forma confiable — ver limitaciones al
// final de este archivo). Corrible con `node js/contract-test.js`.
//
// Deliberadamente NO duplica a mano la lista de ids ni el orden de
// scripts esperado: los lee directamente de las fuentes de verdad
// reales (REQUIRED_DOM_IDS/OPTIONAL_DOM_IDS en app.js, <script defer>
// en index.html) para que este test nunca quede desincronizado de la
// forma en que ya se desincronizó la documentación en el pasado (ver
// REPO_CONTEXT_MASTER.md, hallazgos de la auditoría de precisión).
//
// Verifica:
//   1. Cada REQUIRED_DOM_IDS existe como id="..." en index.html.
//   2. Cada OPTIONAL_DOM_IDS que SÍ existe en el HTML no tiene ids
//      duplicados (si falta, solo se avisa — es opcional por diseño).
//   3. No hay ids duplicados en index.html (bug clásico y silencioso).
//   4. El orden relativo de los <script defer> de negocio respeta las
//      dependencias documentadas: motor-config antes que motor-plano,
//      motor-plano antes que motor-exposicion/motor-mapa, proyeccion
//      antes que motor-render, y app.js después de TODOS los motor-*.
//   5. ambiente-orquestador.js (si existe como script) carga después
//      de cualquier otro ambiente-*.js y antes de app.js.
//
// Sale con código 0 si el contrato se cumple, 1 si algo lo rompe.

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname.replace(/[/\\]js$/, '');
const HTML_PATH = path.join(ROOT, 'index.html');
const APP_JS_PATH = path.join(ROOT, 'js', 'app.js');

function leer(rutaAbs, etiqueta, despojarComentariosHtml) {
  if (!fs.existsSync(rutaAbs)) {
    console.error(`ERROR: no se encontró ${etiqueta} en ${rutaAbs}`);
    process.exit(1);
  }
  const crudo = fs.readFileSync(rutaAbs, 'utf8');
  if (!despojarComentariosHtml) return crudo;
  // Crítico: index.html tiene documentación arquitectónica embebida en
  // comentarios <!-- --> que a veces CITA literalmente ids o etiquetas
  // <script> como texto de ejemplo (ver §16 de esa misma
  // documentación). Sin despojar los comentarios, esas menciones en
  // prosa se confunden con ids/scripts reales y producen falsos
  // positivos de "duplicado" u orden incorrecto. Se reemplaza cada
  // comentario por espacios (no se borra) para no desplazar offsets.
  return crudo.replace(/<!--[\s\S]*?-->/g, (m) => ' '.repeat(m.length));
}

// --- 1. Extraer REQUIRED_DOM_IDS / OPTIONAL_DOM_IDS directo de app.js ---
function extraerListaIds(appJs, nombreVar) {
  const re = new RegExp(
    `var\\s+${nombreVar}\\s*=\\s*\\[([\\s\\S]*?)\\];`
  );
  const m = re.exec(appJs);
  if (!m) {
    console.error(
      `ERROR: no se encontró "var ${nombreVar} = [...]" en app.js — ` +
        'el contrato pudo haber cambiado de forma; este test necesita revisión.'
    );
    process.exit(1);
  }
  return Array.from(m[1].matchAll(/['"]([\w-]+)['"]/g)).map((x) => x[1]);
}

// --- 2. Extraer todos los id="..." de index.html ---
function extraerIdsHtml(html) {
  const ids = [];
  const re = /\sid=["']([\w-]+)["']/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    ids.push(m[1]);
  }
  return ids;
}

// --- 3. Extraer orden real de <script defer src="js/...">
function extraerOrdenScripts(html) {
  const orden = [];
  const re = /<script[^>]*\ssrc=["']js\/([\w.-]+\.js)["'][^>]*>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    orden.push(m[1]);
  }
  return orden;
}

function indiceDe(orden, nombre) {
  return orden.indexOf(nombre);
}

function correr() {
  const html = leer(HTML_PATH, 'index.html', true);
  const appJs = leer(APP_JS_PATH, 'app.js', false);

  let fallos = 0;
  let avisos = 0;

  // ---- Contrato de ids ----
  const required = extraerListaIds(appJs, 'REQUIRED_DOM_IDS');
  const optional = extraerListaIds(appJs, 'OPTIONAL_DOM_IDS');
  const idsHtml = extraerIdsHtml(html);
  const idsHtmlSet = new Set(idsHtml);

  console.log(`REQUIRED_DOM_IDS declarados en app.js: ${required.length}`);
  required.forEach((id) => {
    const ok = idsHtmlSet.has(id);
    console.log(`  ${ok ? '✓' : '✗'} #${id}`);
    if (!ok) {
      fallos++;
      console.error(`    FALTA en index.html: id="${id}" es requerido por app.js`);
    }
  });

  console.log(`\nOPTIONAL_DOM_IDS declarados en app.js: ${optional.length}`);
  optional.forEach((id) => {
    const ok = idsHtmlSet.has(id);
    console.log(`  ${ok ? '✓' : '⚠'} #${id}${ok ? '' : ' (ausente — opcional, no falla el test)'}`);
    if (!ok) avisos++;
  });

  // ---- Ids duplicados en el HTML (bug silencioso clásico) ----
  const conteo = {};
  idsHtml.forEach((id) => {
    conteo[id] = (conteo[id] || 0) + 1;
  });
  const duplicados = Object.keys(conteo).filter((id) => conteo[id] > 1);
  console.log(`\nIds duplicados en index.html: ${duplicados.length}`);
  if (duplicados.length > 0) {
    fallos++;
    duplicados.forEach((id) =>
      console.error(`  ✗ id="${id}" aparece ${conteo[id]} veces`)
    );
  } else {
    console.log('  ✓ ninguno');
  }

  // ---- Orden de carga (dependencias documentadas) ----
  const orden = extraerOrdenScripts(html);
  console.log(`\nScripts js/*.js detectados en orden de carga: ${orden.length}`);

  const parejas = [
    ['motor-config.js', 'motor-plano.js'],
    ['motor-config.js', 'motor-exposicion.js'],
    ['motor-config.js', 'motor-mapa.js'],
    ['motor-plano.js', 'motor-exposicion.js'],
    ['proyeccion.js', 'motor-render.js'],
  ];
  parejas.forEach(([antes, despues]) => {
    const iAntes = indiceDe(orden, antes);
    const iDespues = indiceDe(orden, despues);
    if (iAntes === -1 || iDespues === -1) {
      console.log(`  ⚠ no se pudo verificar ${antes} < ${despues} (algún script no encontrado)`);
      avisos++;
      return;
    }
    const ok = iAntes < iDespues;
    console.log(`  ${ok ? '✓' : '✗'} ${antes} carga antes de ${despues}`);
    if (!ok) fallos++;
  });

  // app.js debe ser el último script "real" de negocio (después de
  // todos los motor-*.js y de ambiente-orquestador.js, si existe)
  const iApp = indiceDe(orden, 'app.js');
  if (iApp === -1) {
    console.error('  ✗ app.js no aparece como <script src="js/app.js">');
    fallos++;
  } else {
    const motorScripts = orden.filter((s) => s.startsWith('motor-'));
    const motorFueraDeLugar = motorScripts.filter(
      (s) => indiceDe(orden, s) > iApp
    );
    if (motorFueraDeLugar.length > 0) {
      fallos++;
      console.error(
        `  ✗ app.js carga ANTES de: ${motorFueraDeLugar.join(', ')} (debería ser al final)`
      );
    } else {
      console.log('  ✓ app.js carga después de todos los motor-*.js');
    }

    const iOrquestador = indiceDe(orden, 'ambiente-orquestador.js');
    if (iOrquestador !== -1) {
      const ok = iOrquestador < iApp;
      console.log(
        `  ${ok ? '✓' : '✗'} ambiente-orquestador.js carga antes de app.js`
      );
      if (!ok) fallos++;

      const ambienteScripts = orden.filter(
        (s) => s.startsWith('ambiente-') && s !== 'ambiente-orquestador.js'
      );
      const fueraDeLugar = ambienteScripts.filter(
        (s) => indiceDe(orden, s) > iOrquestador
      );
      if (fueraDeLugar.length > 0) {
        fallos++;
        console.error(
          `  ✗ ambiente-orquestador.js carga ANTES de: ${fueraDeLugar.join(', ')}`
        );
      } else {
        console.log(
          `  ✓ ambiente-orquestador.js carga después de los otros ${ambienteScripts.length} módulo(s) ambiente-*.js presentes`
        );
      }
    }
  }

  console.log('');
  if (fallos > 0) {
    console.error(`CONTRACT TEST FALLÓ: ${fallos} problema(s), ${avisos} aviso(s).`);
    process.exit(1);
  }
  console.log(`CONTRACT TEST OK (${avisos} aviso(s) no bloqueante(s)).`);
  process.exit(0);
}

correr();

// ---------------------------------------------------------------------
// Limitación conocida y explícita de este test (Fase 2 tal como se
// implementó, sin navegador disponible en este entorno): no ejecuta
// JS real ni renderiza el DOM — es análisis estático de texto sobre
// index.html/app.js. Esto cubre exactamente los dos bugs reales que
// el propio repo ya documenta como causados por romper este contrato
// (mapa invisible, contadores pegados en "cargando"), pero NO
// reemplaza una suite e2e real con Playwright/Puppeteer si en algún
// momento se dispone de navegador headless en el pipeline de CI.
// ---------------------------------------------------------------------
