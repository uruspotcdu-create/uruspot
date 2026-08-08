'use strict';
// Script ad-hoc para Fase 5.1: mide LCP/CLS en una ficha representativa
// de CADA familia (donde-comer-cdu/locales y los-mejores-restaurantes-cdu),
// con la MISMA config mobile/throttling que lighthouse-mobile-uruspot.js,
// para que los números sean comparables entre sí.

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const lighthouse = require('lighthouse').default || require('lighthouse');
const chromeLauncher = require('chrome-launcher');

const PUERTO = 8080;
const DIR_REPORTES = path.join(__dirname, '..', 'lighthouse-reports');

const OBJETIVOS = [
  { nombre: 'ficha-donde-comer-cdu-antigua-fonda', ruta: '/donde-comer-cdu/locales/antigua-fonda/' },
  { nombre: 'ficha-los-mejores-restaurantes-cdu-el-moro-pizza', ruta: '/los-mejores-restaurantes-cdu/el-moro-pizza/' },
];

function esperarServidorListo(intentos) {
  const http = require('http');
  return new Promise((resolve, reject) => {
    function intentar(restantes) {
      const req = http.get(`http://127.0.0.1:${PUERTO}/`, (res) => { res.resume(); resolve(); });
      req.on('error', () => {
        if (restantes <= 0) return reject(new Error('http-server no respondió a tiempo'));
        setTimeout(() => intentar(restantes - 1), 300);
      });
    }
    intentar(intentos);
  });
}

function iniciarServidor() {
  const proceso = spawn('npx', ['http-server', path.join(__dirname, '..'), '-p', String(PUERTO), '-s'], { stdio: 'ignore', shell: true });
  return esperarServidorListo(30).then(() => proceso);
}

async function correrLighthouse(chrome, url) {
  return lighthouse(url, {
    port: chrome.port,
    output: ['html', 'json'],
    logLevel: 'error',
    onlyCategories: ['performance'],
    formFactor: 'mobile',
    screenEmulation: { mobile: true, width: 390, height: 844, deviceScaleFactor: 3, disabled: false },
    throttling: {
      rttMs: 150, throughputKbps: 1638.4, cpuSlowdownMultiplier: 4,
      requestLatencyMs: 150 * 3.75, downloadThroughputKbps: 1638.4 * 0.9, uploadThroughputKbps: 675 * 0.9
    },
    disableStorageReset: false
  });
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
  };
}

async function main() {
  if (!fs.existsSync(DIR_REPORTES)) fs.mkdirSync(DIR_REPORTES);
  console.log('Arrancando servidor local en :' + PUERTO + '...');
  const servidor = await iniciarServidor();
  console.log('Abriendo Chrome...');
  const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'] });

  const resultados = [];
  try {
    for (const obj of OBJETIVOS) {
      const url = `http://127.0.0.1:${PUERTO}${obj.ruta}`;
      console.log(`\nCorriendo Lighthouse mobile (carga en frío) para: ${obj.nombre}`);
      console.log('URL: ' + url);
      const r = await correrLighthouse(chrome, url);
      fs.writeFileSync(path.join(DIR_REPORTES, obj.nombre + '.html'), r.report[0]);
      fs.writeFileSync(path.join(DIR_REPORTES, obj.nombre + '.json'), r.report[1]);
      const s = resumen(r.lhr);
      resultados.push({ nombre: obj.nombre, ...s });
      console.log(`  Performance: ${s.performance}/100 | LCP: ${s.lcp} | CLS: ${s.cls} | TBT: ${s.tbt} | FCP: ${s.fcp} | SI: ${s.si}`);
    }
  } finally {
    await chrome.kill();
    servidor.kill();
  }

  console.log('\n=== RESUMEN FICHAS (carga en frío) ===');
  console.table(resultados.map(r => ({ Ficha: r.nombre, Performance: r.performance, LCP: r.lcp, CLS: r.cls, TBT: r.tbt })));
}

main().catch((err) => { console.error('Error:', err.message); process.exit(1); });
