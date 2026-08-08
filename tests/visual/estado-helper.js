async function sembrarEstado(page, estadoModificado = {}) {
  const KEY = 'uru_plano::concepcion-del-uruguay::v1';
  const estadoBase = {
    version: 1,
    region: 'guia',
    busqueda: '',
    filtroRubro: null,
    seleccionadoId: null,
    favoritos: [],
    vistos: []
  };
  const estadoFinal = { ...estadoBase, ...estadoModificado };
  await page.addInitScript(({ key, val }) => {
    window.localStorage.setItem(key, JSON.stringify(val));
  }, { key: KEY, val: estadoFinal });
}

module.exports = { sembrarEstado };

