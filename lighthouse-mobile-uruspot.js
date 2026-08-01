/*
 * lighthouse-mobile-uruspot.js
 * ---------------------------------------------------------------------
 * Corre Lighthouse (perfil mobile, throttling simulado 4G/CPU medio)
 * contra donde-comer-cdu DOS veces en el MISMO navegador:
 *
 *   1) CARGA EN FRÍO — cache y Service Worker limpios. Es la que ya
 *      medías antes de hoy.
 *   2) CARGA REPETIDA — mismo perfil de navegador, sin limpiar storage
 *      (`disableStorageReset`). Es la visita que se beneficia del
 *      Service Worker (stale-while-revalidate en JS/CSS/imágenes +
 *      network-first-con-contención en los datos, incluidos los tiles
 *      del mapa desde hoy).
 *
 * La comparación entre ambas corridas es la forma real de confirmar
 * si el Service Worker (y el resto de los cambios de hoy) mueve la
 * aguja, en vez de asumirlo por el diseño del código.
 *
 * Requiere: Google Chrome o Chromium instalado en esta máquina
 * (Lighthouse lo detecta solo — no usa el Chromium de Playwright).
 *
 * Uso:
 *   npm install
 *   npm run perf:mobile
 *   (o directo: node lighthouse-mobile-uruspot.js)
 *
 * Sirve el repo con http-server en :8080 automáticamente — no hace
 * falta tenerlo corriendo antes. Reportes HTML completos quedan en
 * lighthouse-reports/, y un resumen comparativo se imprime en la
 * terminal.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const lighthouse = require('lighthouse').default || require('lighthouse');
const chromeLauncher = require('chrome-launcher');

const PUERTO = 8080;
const RUTA = '/donde-comer-cdu/';
const URL_OBJETIVO = `http://127.0.0.1:${PUERTO}${RUTA}`;
const DIR_REPORTES = path.join(__dirname, 'lighthouse-reports');

function esperarServidorListo(intentos) {
  const http = require('http');
  return new Promise((resolve, reject) => {
    function intentar(restantes) {
      const req = http.get(`http://127.0.0.1:${PUERTO}/`, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (restantes <= 0) return reject(new Error('http-server no respondió a tiempo'));
        setTimeout(() => intentar(restantes - 1), 300);
      });
    }
    intentar(intentos);
  });
}

function iniciarServidor() {
  const proceso = spawn('npx', ['http-server', __dirname, '-p', String(PUERTO), '-s'], {
    stdio: 'ignore',
    shell: true
  });
  return esperarServidorListo(30).then(() => proceso);
}

async function correrLighthouse(chrome, disableStorageReset) {
  const resultado = await lighthouse(URL_OBJETIVO, {
    port: chrome.port,
    output: ['html', 'json'],
    logLevel: 'error',
    onlyCategories: ['performance'],
    formFactor: 'mobile',
    screenEmulation: {
      mobile: true,
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
      disabled: false
    },
    throttling: {
      // Perfil "Slow 4G" estándar de Lighthouse — mismo default que
      // usa PageSpeed Insights, para que el número sea comparable
      // con lo que cualquiera vería buscando el sitio en PageSpeed.
      rttMs: 150,
      throughputKbps: 1638.4,
      cpuSlowdownMultiplier: 4,
      requestLatencyMs: 150 * 3.75,
      downloadThroughputKbps: 1638.4 * 0.9,
      uploadThroughputKbps: 675 * 0.9
    },
    disableStorageReset: disableStorageReset
  });
  return resultado;
}

function resumen(lhr) {
  const m = lhr.audits;
  return {
    performance: Math.round(lhr.categories.performance.score * 100),
    fcp: m['first-contentful-paint'].displayValue,
    lcp: m['largest-contentful-paint'].displayValue,
    tbt: m['total-blocking-time'].displayValue,
    cls: m['cumulative-layout-shift'].displayValue,
    si: m['speed-index'].displayValue,
    tti: m['interactive'] ? m['interactive'].displayValue : 'n/d'
  };
}

function imprimirTabla(frio, repetida) {
  const filas = [
    ['Performance score', frio.performance + '/100', repetida.performance + '/100'],
    ['First Contentful Paint', frio.fcp, repetida.fcp],
    ['Largest Contentful Paint', frio.lcp, repetida.lcp],
    ['Total Blocking Time', frio.tbt, repetida.tbt],
    ['Cumulative Layout Shift', frio.cls, repetida.cls],
    ['Speed Index', frio.si, repetida.si],
    ['Time to Interactive', frio.tti, repetida.tti]
  ];
  const anchoCol1 = Math.max(...filas.map((f) => f[0].length), 'Métrica'.length) + 2;
  const anchoCol2 = Math.max(...filas.map((f) => String(f[1]).length), 'Carga en frío'.length) + 2;
  const anchoCol3 = Math.max(...filas.map((f) => String(f[2]).length), 'Carga repetida (SW)'.length) + 2;

  function fila(a, b, c) {
    return a.padEnd(anchoCol1) + b.padEnd(anchoCol2) + c;
  }
  console.log('\n' + fila('Métrica', 'Carga en frío', 'Carga repetida (SW)'));
  console.log('-'.repeat(anchoCol1 + anchoCol2 + anchoCol3));
  filas.forEach((f) => console.log(fila(f[0], String(f[1]), String(f[2]))));
  console.log('');
}

async function main() {
  if (!fs.existsSync(DIR_REPORTES)) fs.mkdirSync(DIR_REPORTES);

  console.log('Arrancando servidor local en :' + PUERTO + '...');
  const servidor = await iniciarServidor();

  console.log('Abriendo Chrome...');
  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu']
  });

  try {
    console.log('Corrida 1/2 — carga en frío (cache y Service Worker limpios)...');
    const rFrio = await correrLighthouse(chrome, false);
    fs.writeFileSync(path.join(DIR_REPORTES, 'frio.html'), rFrio.report[0]);
    fs.writeFileSync(path.join(DIR_REPORTES, 'frio.json'), rFrio.report[1]);

    console.log('Esperando 3s para que el Service Worker termine de instalarse...');
    await new Promise((r) => setTimeout(r, 3000));

    console.log('Corrida 2/2 — carga repetida (storage NO se limpia, SW activo)...');
    const rRepetida = await correrLighthouse(chrome, true);
    fs.writeFileSync(path.join(DIR_REPORTES, 'repetida.html'), rRepetida.report[0]);
    fs.writeFileSync(path.join(DIR_REPORTES, 'repetida.json'), rRepetida.report[1]);

    const resumenFrio = resumen(rFrio.lhr);
    const resumenRepetida = resumen(rRepetida.lhr);
    imprimirTabla(resumenFrio, resumenRepetida);

    console.log('Reportes HTML completos en: ' + DIR_REPORTES);
    console.log('  - frio.html      (equivalente a lo que ya medías antes de hoy)');
    console.log('  - repetida.html  (visita repetida, con Service Worker activo)');
  } finally {
    await chrome.kill();
    servidor.kill();
  }
}

main().catch((err) => {
  console.error('Error corriendo la medición:', err.message);
  console.error('\nSi el error es que no encuentra Chrome, instalá Google Chrome');
  console.error('o seteá la variable CHROME_PATH apuntando a tu ejecutable.');
  process.exit(1);
});
