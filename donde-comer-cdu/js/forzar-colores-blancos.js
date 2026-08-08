/* Externalizado desde un <script> inline en index.html (auditoría CSP,
   2026-08-08): la CSP del documento es `script-src 'self'` sin
   'unsafe-inline'/nonce/hash, así que este bloque nunca llegaba a
   ejecutarse — la app arrancaba directo con el fallback oscuro de
   tokens.css en vez del forzado a blanco de acá. Mismo código, solo
   movido a un archivo con <script src>, permitido por 'self'. */
document.addEventListener('DOMContentLoaded', function() {
  // Arreglar TODOS los colores problemáticos
  const elements = document.querySelectorAll('[style*="color"]');
  elements.forEach(el => {
    el.style.color = '#ffffff';
  });

  // Arreglar elementos específicos
  document.querySelectorAll('.hero__scroll-cue, #schedStatusText, .btn-primary, a, footer p').forEach(el => {
    el.style.color = '#ffffff !important';
  });

  // Arreglar variables CSS
  document.documentElement.style.setProperty('--color-tinta-60', '#ffffff', 'important');
  document.documentElement.style.setProperty('--color-tinta', '#ffffff', 'important');
});
