## Descripción
<!-- Qué cambia y por qué -->

## Checklist de accesibilidad
Ver detalle completo en `docs/project-context/ACCESSIBILITY_CHECKLIST.md`
(basado en la checklist de Heydon Pickering).

- [ ] Imágenes nuevas tienen `alt` (o `alt=""` si son decorativas)
- [ ] No se agregó `user-scalable=no` ni anchos fijos que corten el zoom
- [ ] Inputs nuevos tienen `<label>` asociado
- [ ] Navegable por teclado (probado con Tab/Shift+Tab)
- [ ] `lang="es"` presente si es una página nueva
- [ ] Sin `outline: none` sin un estilo de foco alternativo

## Testing
- [ ] `npm test` pasa
- [ ] Probado en mobile y desktop
