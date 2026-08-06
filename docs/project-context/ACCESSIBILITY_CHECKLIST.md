# Checklist de accesibilidad e inclusión — uruspot

Adaptado de [Heydon Pickering — Inclusive Design Checklist](https://github.com/Heydon/inclusive-design-checklist),
filtrado a lo que aplica a un sitio estático (HTML/CSS/JS sin framework) con
PWA, mapas, fichas de locales e imágenes de productos.

Usar antes de cada deploy grande, y como referencia al abrir un PR
(ver `.github/PULL_REQUEST_TEMPLATE.md`).

## Imágenes
- [ ] Toda imagen de contenido (fotos de locales/platos) tiene `alt` descriptivo
- [ ] Imágenes puramente decorativas usan `alt=""` o `aria-hidden="true"`
- [ ] Las imágenes están comprimidas / en formato moderno (ya usan `.webp` ✅)
- [ ] Se usa `srcset` para servir tamaños según dispositivo

## Zoom y viewport
- [x] No se bloquea el pinch-zoom (`user-scalable=no` removido en `donde-comer-cdu/index.html`)
- [ ] El contenido no se corta al hacer zoom (sin anchos fijos)
- [ ] Unidades relativas (`rem`, `em`, `%`) para tipografía, no solo `px`

## Formularios (buscador, filtros de rubro)
- [x] Buscador principal (`#inputBuscar`) tiene `<label>` visible-solo-lector, `aria-describedby` y `aria-controls` ✅
- [x] Filtro por rubro (`#listaRubros`) tenía `role="grid"` sin estructura de grilla real (fila/celda) — corregido a `role="group"`, coincide con el patrón real de botones toggle con `aria-pressed`
- [ ] Revisar `role="tablist"`/`role="tab"` en `los-mejores-restaurantes-cdu/index.html` (filtro por tipo de cocina): confirmar que el JS implementa navegación con flechas (patrón tab real) o simplificar a `role="group"` si son solo botones de filtro
- [ ] Los mensajes de error/estado usan regiones `aria-live` (ya hay 8 usos ✅ — verificar que cubran búsqueda vacía)
- [ ] Ningún campo tiene `autofocus` forzado al cargar la página

## Navegación y foco de teclado
- [x] Skip link presente (`#contenido-principal` ✅)
- [ ] Orden de foco lógico y visible (no `outline: none` sin reemplazo)
- [ ] El mapa y las fichas de locales son navegables por teclado
- [ ] Los diálogos/modales devuelven el foco al elemento que los abrió

## Estructura semántica
- [ ] Un solo `<h1>` por página, jerarquía de headings sin saltos
- [ ] Landmarks (`<header>`, `<nav>`, `<main>`, `<footer>`) en todas las páginas de rubro
- [ ] Tablas de datos (si las hay) usan `<table>`, no divs

## Idioma y contenido
- [x] `lang="es"` presente en todas las páginas revisadas ✅
- [ ] Textos de enlaces describen el destino ("ver ficha de Barro", no "ver más")
- [ ] Se evita el uso exclusivo de color para indicar estado (ej. "abierto ahora")

## PWA / Offline
- [ ] `manifest.json` con íconos e íconos maskable (ya presentes ✅ — verificar `offline.html` es accesible)
- [ ] El Service Worker no bloquea contenido crítico sin conexión

## Contraste y movimiento
- [ ] Contraste de texto AA mínimo (4.5:1) en todas las fichas de locales
- [x] `prefers-reduced-motion` respetado en animaciones del "ambiente" ✅
- [ ] Ningún control cambia de contexto de forma inesperada al recibir foco

---
Fuente original: https://github.com/Heydon/inclusive-design-checklist (checklist.json)
