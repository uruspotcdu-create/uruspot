import pandas as pd
from pathlib import Path
from data_loader import cargar_datos


def detectar_place_ids_faltantes(tabla):
    """Devuelve las filas que no tienen Place ID cargado, junto con
    su estado de verificación actual, para priorizar el enriquecimiento futuro."""
    sin_place_id = tabla[tabla["Place ID"].isna() | (tabla["Place ID"].astype(str).str.strip() == "")]
    return sin_place_id[["ID_URU", "Nombre", "Categoría", "Grupo", "Estado Verificación", "Dirección"]]


if __name__ == "__main__":
    datos = cargar_datos()
    if datos is not None:
        faltantes = detectar_place_ids_faltantes(datos)

        ruta_reporte = Path("datos/salida/reporte_place_id_faltantes.csv")
        faltantes.to_csv(ruta_reporte, index=False, encoding="utf-8-sig")

        print(f"Total de lugares: {len(datos)}")
        print(f"Lugares sin Place ID: {len(faltantes)}")
        print(f"Porcentaje sin Place ID: {len(faltantes) / len(datos) * 100:.1f}%")
        print(f"\nReporte guardado en: {ruta_reporte}")

        if len(faltantes) > 0:
            print("\nDesglose por 'Estado Verificación' de los que faltan:")
            print(faltantes["Estado Verificación"].value_counts())

            print("\nDesglose por 'Grupo' de los que faltan (top 10):")
            print(faltantes["Grupo"].value_counts().head(10))