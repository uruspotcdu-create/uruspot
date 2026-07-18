import pandas as pd
from pathlib import Path

# Ruta al Excel: Path arma la dirección del archivo de forma segura,
# sin importar si estamos en Windows, Mac o Linux.
RUTA_EXCEL = Path("datos/entrada/MASTER14_en_progreso.xlsx")

def cargar_datos():
    """Abre el Excel y lo convierte en una tabla que Python puede manejar."""
    if not RUTA_EXCEL.exists():
        print(f"ERROR: no encuentro el archivo en {RUTA_EXCEL}")
        return None

    tabla = pd.read_excel(RUTA_EXCEL)
    return tabla


if __name__ == "__main__":
    datos = cargar_datos()
    if datos is not None:
        print("Excel cargado correctamente.")
        print(f"Cantidad de filas (lugares): {len(datos)}")
        print(f"Cantidad de columnas: {len(datos.columns)}")
        print("\nNombres de las columnas:")
        for columna in datos.columns:
            print(f" - {columna}")
        print("\nPrimeras 3 filas de ejemplo:")
        print(datos.head(3))