# Optimización de rendimiento — URU SPOT

**Fecha:** 2026-07-27
**Alcance:** exclusivamente técnico (peso de assets, scripts bloqueantes, dependencias externas). Sin cambios visuales, de layout, tipografía ni funcionalidad.

## 1. Baseline inicial

- Tamaño del repo (sin `.git`): **41MB**
- Tests: 5/5 suites OK (28/28 lifecycle + 33/33 coreografías) — punto de partida sano
- Composición del peso: 121 HTML, 69 PNG, 50 JS, 25 JPG, 22 CSS, 8 SVG, 7 WebP, 2 XML
- **27MB (66% del repo) eran imágenes PNG**; WebP prácticamente sin usar (96KB)

## 2. Problemas encontrados

### Críticos
1. **28 imágenes huérfanas en `img/`** (11.4MB): cero referencias en HTML/CSS/JS/JSON de todo el repo. Peso muerto.
2. **39 imágenes en uso servidas sin comprimir** (20MB en PNG) cuando WebP reduce ese peso en más de 90% sin pérdida visual perceptible.
3. **36 de esas imágenes se cargaban vía URL externa de GitHub** (`https://github.com/.../blob/main/img/X.png?raw=true`) en lugar de servirse desde el propio dominio — dependencia innecesaria de latencia y disponibilidad de un tercero para contenido que ya vive en el propio repo.
4. **`ficha.js` se cargaba sin `defer`** en las 51 páginas de fichas de locales, inconsistente con el resto del sitio (que sí usa `defer` en todos sus scripts).

### No críticos, detectados pero fuera de alcance de esta tarea
- 6 fichas (`7-colinas`, `drakkar`, `danys`, `dolores-costa`, `bartolo-bar`, `el-arca-resto-bar`) referencian imágenes de galería que **nunca existieron en el repo** (problema de contenido preexistente, confirmado contra el historial de git anterior a esta intervención — no fue introducido por este trabajo).
- CSS no auditado en profundidad por selectores costosos/duplicados (impacto esperado bajo comparado con imágenes).

## 3. Optimizaciones realizadas

1. **Eliminadas 28 imágenes huérfanas** → -11.4MB, cero riesgo (confirmado sin referencias en ningún archivo de texto del repo).
2. **Convertidas 39 imágenes PNG en uso a WebP** (Pillow, calidad 82) → de 20.5MB a 1.78MB (-91.3%).
3. **Migradas todas las referencias de imágenes de URLs de GitHub a rutas locales `/img/...`** (39 imágenes + 3 casos adicionales detectados en el camino: `538frente.webp`, y las fotos de `lucianos-gimnasio` y `posta-torreon` en `.jpg`).
4. **Agregado `defer` a `ficha.js` en las 51 fichas de locales**, verificado seguro porque el script ya estaba al final del `<body>`, después de todos los elementos que consulta.

## 4. Archivos modificados / nuevos / eliminados

- **Modificados:** 51 `donde-comer-cdu/locales/*/index.html` (defer) + 11 de esos mismos (rutas de imagen)
- **Nuevos:** 39 archivos `.webp` en `img/`
- **Eliminados:** 28 PNG huérfanos + 39 PNG ya migrados a WebP (67 archivos, ~32MB)

## 5. Tests antes / después

- **Antes:** 5/5 suites OK
- **Después:** 5/5 suites OK (sin regresiones)
- Validación adicional: verificado programáticamente que ninguna referencia `/img/...` en el HTML apunta a un archivo inexistente (excepto los 6 casos preexistentes documentados arriba, ajenos a este trabajo).

## 6. Métricas antes/después

| Métrica | Antes | Después |
|---|---|---|
| Peso del repo (sin `.git`) | 41MB | 12MB (-71%) |
| Peso de `img/` | ~30MB+ | 3.9MB |
| Imágenes servidas vía GitHub raw | 39 | 0 |
| Scripts sin `defer` en fichas | 51 | 0 |

## 7. Qué se decidió NO optimizar y por qué

- **Imágenes JPG restantes** (1.7MB total): peso bajo comparado con el problema de PNG; no se tocó formato, se corrigió únicamente la ruta de hosteo (GitHub → local) donde aplicaba.
- **Service Worker / PWA:** no se implementó. No había uno previo y agregar uno introduce riesgo de servir contenido obsoleto sin una estrategia de invalidación clara; se recomienda evaluarlo en una etapa separada si se decide.
- **CSS no utilizado:** no se auditó línea por línea por bajo impacto relativo comparado con imágenes; queda como pendiente de una pasada futura.
- **Imágenes de Unsplash externas (10 referencias):** no se tocaron en esta pasada; requieren decisión explícita sobre si migrarlas localmente.

## 8. Riesgos

- Las 39 conversiones a WebP se hicieron sin fallback `<picture>` a PNG. WebP tiene soporte >97% en navegadores modernos (2026); riesgo residual bajo pero no cero en navegadores muy antiguos.
- Los 6 casos de imágenes de galería inexistentes (item preexistente) siguen rotos; no se resolvieron por estar fuera del alcance de "optimización de rendimiento" (es un problema de contenido faltante, no de peso/eficiencia).

## 9. Pendientes

- Migrar o evaluar las 10 referencias a `images.unsplash.com`.
- Auditoría de CSS no utilizado/duplicado entre los 22 archivos `.css`.
- Resolver las 6 fichas con imágenes de galería faltantes (tarea de contenido, no de performance).
- Medir Core Web Vitals reales (LCP/INP/CLS) con herramientas de campo, ya que esta auditoría se hizo de forma estática (sin navegador real disponible en el entorno de trabajo).

## 10. Recomendaciones para la etapa visual futura

- Al rediseñar, mantener `loading="lazy"` + `decoding="async"` ya presentes en imágenes fuera del viewport inicial.
- Si se agregan nuevas imágenes, subirlas directamente en WebP y con ruta local `/img/...` desde el inicio, para no repetir la deuda técnica corregida acá.

---

**Conclusión:** URU SPOT mantiene exactamente su experiencia visual actual, pero ahora es técnicamente más liviano (-71% de peso de repo), sin dependencias externas de GitHub para imágenes, y sin scripts bloqueantes inconsistentes en las fichas de locales.
