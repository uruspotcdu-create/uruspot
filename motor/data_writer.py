from pathlib import Path


def guardar_excel(tabla, ruta_destino):
    """Guarda una tabla (DataFrame) como archivo Excel en la ruta indicada."""
    ruta_destino = Path(ruta_destino)
    ruta_destino.parent.mkdir(parents=True, exist_ok=True)
    tabla.to_excel(ruta_destino, index=False)
    print(f"Excel guardado en: {ruta_destino}")