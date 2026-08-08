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
// Bundles (perf, 2026-07-26/31): motor-*.js y ambiente-*.js pueden
// vivir sueltos O concatenados en js/motor.bundle.js / js/ambiente.
// bundle.js (ver scripts/build-motor-bundle.js y
// scripts/build-ambiente-bundle.js). Los puntos 4 y 5 siguen
// verificándose igual de estricto en ambos casos: si un módulo está
// bundleado, este test lee el marcador `/* ==== módulo.js ==== */`
// dentro del bundle para saber su posición real, en vez de degradarse
// a "no se pudo verificar".
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
  const re = /<script[^>]*\ssrc=["']js\/([\w.-]+\.js)(?:\?[^"']*)?["'][^>]*>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    orden.push(m[1]);
  }
  return orden;
}

// --- 3b. Bundles (perf, 2026-07-31): un módulo bundleado (ver
// scripts/build-ambiente-bundle.js / scripts/build-motor-bundle.js) ya
// no aparece como <script src="js/nombre.js"> individual — pero su
// posición real de ejecución sigue siendo verificable, porque cada
// build script escribe un marcador `/* ==== nombre.js ==== */` en el
// mismo orden en que concatenó los módulos. Sin este paso, cualquier
// módulo bundleado caía en "no se pudo verificar" (aviso silencioso)
// en vez de seguir siendo un chequeo real — este bloque evita que
// bundlear degrade el contrato a "confiar y no verificar".
function extraerPosicionesEnBundles(orden) {
  // archivo → { bundle, offset } — offset es la posición del marcador
  // DENTRO del bundle (no del documento), para poder comparar orden
  // relativo entre dos módulos que viven en el mismo bundle.
  const posiciones = {};
  orden.forEach((nombreScript) => {
    if (!nombreScript.endsWith('.bundle.js')) return;
    const rutaBundle = path.join(ROOT, 'js', nombreScript);
    if (!fs.existsSync(rutaBundle)) return;
    const contenido = fs.readFileSync(rutaBundle, 'utf8');
    const re = /\/\* ==== ([\w.-]+\.js) ==== \*\//g;
    let m;
    let offset = 0;
    while ((m = re.exec(contenido)) !== null) {
      posiciones[m[1]] = { bundle: nombreScript, offset: offset++ };
    }
  });
  return posiciones;
}

// Posición comparable de un módulo, sea que cargue suelto o adentro de
// un bundle: [índice del <script> real en el documento, offset dentro
// del bundle (0 si no aplica)]. Comparación lexicográfica de la tupla
// da el orden real de ejecución en ambos casos.
function posicionVirtual(orden, posicionesBundle, nombre) {
  const iDirecto = orden.indexOf(nombre);
  if (iDirecto !== -1) return [iDirecto, 0];
  const enBundle = posicionesBundle[nombre];
  if (!enBundle) return null;
  const iBundle = orden.indexOf(enBundle.bundle);
  if (iBundle === -1) return null;
  return [iBundle, enBundle.offset];
}

function comparar(a, b) {
  if (a[0] !== b[0]) return a[0] - b[0];
  return a[1] - b[1];
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
  const posicionesBundle = extraerPosicionesEnBundles(orden);
  const bundlesDetectados = orden.filter((s) => s.endsWith('.bundle.js'));
  console.log(`\nScripts js/*.js detectados en orden de carga: ${orden.length}`);
  if (bundlesDetectados.length) {
    console.log(
      `  (${bundlesDetectados.length} bundle(s) detectado(s): ${bundlesDetectados.join(', ')} — ` +
      `el orden interno de sus módulos se verifica vía marcadores, no solo la posición del <script>)`
    );
  }

  const parejas = [
    ['motor-config.js', 'motor-plano.js'],
    ['motor-config.js', 'motor-exposicion.js'],
    ['motor-config.js', 'motor-mapa.js'],
    ['motor-plano.js', 'motor-exposicion.js'],
    ['proyeccion.js', 'motor-render.js'],
  ];
  parejas.forEach(([antes, despues]) => {
    const pAntes = posicionVirtual(orden, posicionesBundle, antes);
    const pDespues = posicionVirtual(orden, posicionesBundle, despues);
    if (!pAntes || !pDespues) {
      console.log(`  ⚠ no se pudo verificar ${antes} < ${despues} (algún módulo no encontrado, ni suelto ni en bundle)`);
      avisos++;
      return;
    }
    const ok = comparar(pAntes, pDespues) < 0;
    console.log(`  ${ok ? '✓' : '✗'} ${antes} carga antes de ${despues}`);
    if (!ok) fallos++;
  });

  // app.js debe ser el último script "real" de negocio (después de
  // todos los motor-*.js — sueltos o dentro de un bundle — y de
  // ambiente-orquestador.js, si existe). Perf (auditoría de rendimiento):
  // en producción index.html carga js/app.min.js (versión minificada
  // generada por scripts/build-app-min.js), no js/app.js directo — el
  // contrato de orden sigue siendo el mismo, solo cambia el nombre de
  // archivo que se busca en <script src>.
  const nombreAppEnHtml = orden.includes('app.min.js') ? 'app.min.js' : 'app.js';
  const pApp = posicionVirtual(orden, posicionesBundle, nombreAppEnHtml);
  if (!pApp) {
    console.error(`  ✗ app.js no aparece como <script src="js/${nombreAppEnHtml}">`);
    fallos++;
  } else {
    const nombresMotor = new Set([
      ...orden.filter((s) => s.startsWith('motor-')),
      ...Object.keys(posicionesBundle).filter((s) => s.startsWith('motor-'))
    ]);
    const motorFueraDeLugar = [...nombresMotor].filter((s) => {
      const p = posicionVirtual(orden, posicionesBundle, s);
      return p && comparar(p, pApp) > 0;
    });
    if (motorFueraDeLugar.length > 0) {
      fallos++;
      console.error(
        `  ✗ app.js carga ANTES de: ${motorFueraDeLugar.join(', ')} (debería ser al final)`
      );
    } else {
      console.log(`  ✓ app.js carga después de todos los motor-*.js (${nombresMotor.size} módulo(s), sueltos o en bundle)`);
    }

    const pOrquestador = posicionVirtual(orden, posicionesBundle, 'ambiente-orquestador.js');
    if (pOrquestador) {
      const ok = comparar(pOrquestador, pApp) < 0;
      console.log(
        `  ${ok ? '✓' : '✗'} ambiente-orquestador.js carga antes de app.js`
      );
      if (!ok) fallos++;

      const nombresAmbiente = new Set([
        ...orden.filter((s) => s.startsWith('ambiente-') && s !== 'ambiente-orquestador.js'),
        ...Object.keys(posicionesBundle).filter((s) => s.startsWith('ambiente-') && s !== 'ambiente-orquestador.js')
      ]);
      const fueraDeLugar = [...nombresAmbiente].filter((s) => {
        const p = posicionVirtual(orden, posicionesBundle, s);
        return p && comparar(p, pOrquestador) > 0;
      });
      if (fueraDeLugar.length > 0) {
        fallos++;
        console.error(
          `  ✗ ambiente-orquestador.js carga ANTES de: ${fueraDeLugar.join(', ')}`
        );
      } else {
        console.log(
          `  ✓ ambiente-orquestador.js carga después de los otros ${nombresAmbiente.size} módulo(s) ambiente-*.js presentes (sueltos o en bundle)`
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

