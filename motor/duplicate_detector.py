import pandas as pd
from pathlib import Path
from data_loader import cargar_datos
from text_utils import normalizar_texto


def detectar_duplicados_por_nombre(tabla):
    """Agrupa filas cuyo nombre normalizado coincide exactamente.
    Señal confiable: dos filas con el mismo nombre son casi
    seguramente el mismo negocio cargado dos veces."""
    tabla = tabla.copy()
    tabla["_nombre_normalizado"] = tabla["Nombre"].apply(normalizar_texto)

    duplicados = []
    grupos = tabla.groupby("_nombre_normalizado")
    for nombre_normalizado, grupo in grupos:
        if nombre_normalizado != "" and len(grupo) > 1:
            for indice in grupo.index:
                duplicados.append((indice, tabla.loc[indice, "Nombre"], "NOMBRE_IDENTICO", nombre_normalizado))
    return duplicados


def detectar_duplicados_por_place_id(tabla):
    """Agrupa filas que comparten el mismo Place ID de Google.
    Señal confiable: Google nunca asigna el mismo Place ID
    a dos negocios distintos."""
    duplicados = []
    tabla_con_id = tabla[tabla["Place ID"].notna()]
    grupos = tabla_con_id.groupby("Place ID")
    for place_id, grupo in grupos:
        if len(grupo) > 1:
            for indice in grupo.index:
                duplicados.append((indice, tabla.loc[indice, "Nombre"], "PLACE_ID_REPETIDO", place_id))
    return duplicados


def detectar_ubicaciones_cercanas(tabla, umbral=0.0005):
    """Agrupa filas cuyas coordenadas están muy cerca entre sí.
    IMPORTANTE: esto NO es evidencia de duplicado por sí solo —
    puede ser el mismo edificio con locales distintos, o coordenadas
    poco precisas. Se reporta aparte, para revisión manual."""
    resultado = []
    tabla_con_coords = tabla.dropna(subset=["Latitud", "Longitud"]).copy()

    tabla_con_coords["_lat_redondeada"] = (tabla_con_coords["Latitud"] / umbral).round()
    tabla_con_coords["_lon_redondeada"] = (tabla_con_coords["Longitud"] / umbral).round()

    grupos = tabla_con_coords.groupby(["_lat_redondeada", "_lon_redondeada"])
    for clave, grupo in grupos:
        if len(grupo) > 1:
            for indice in grupo.index:
                lat = tabla.loc[indice, "Latitud"]
                lon = tabla.loc[indice, "Longitud"]
                resultado.append((indice, tabla.loc[indice, "Nombre"], "UBICACION_COMPARTIDA", f"{lat}, {lon}"))
    return resultado


if __name__ == "__main__":
    datos = cargar_datos()
    if datos is not None:
        dup_nombre = detectar_duplicados_por_nombre(datos)
        dup_place_id = detectar_duplicados_por_place_id(datos)
        ubicaciones_cercanas = detectar_ubicaciones_cercanas(datos)

        duplicados_confiables = dup_nombre + dup_place_id
        tabla_duplicados = pd.DataFrame(
            duplicados_confiables,
            columns=["Fila", "Nombre", "Tipo de coincidencia", "Valor comparado"]
        )
        ruta_duplicados = Path("datos/salida/reporte_duplicados.csv")
        tabla_duplicados.to_csv(ruta_duplicados, index=False, encoding="utf-8-sig")

        tabla_ubicaciones = pd.DataFrame(
            ubicaciones_cercanas,
            columns=["Fila", "Nombre", "Tipo", "Coordenadas"]
        )
        ruta_ubicaciones = Path("datos/salida/reporte_ubicaciones_cercanas.csv")
        tabla_ubicaciones.to_csv(ruta_ubicaciones, index=False, encoding="utf-8-sig")

        print(f"Total de lugares revisados: {len(datos)}")
        print(f"Duplicados confiables por nombre idéntico: {len(dup_nombre)}")
        print(f"Duplicados confiables por Place ID repetido: {len(dup_place_id)}")
        print(f"\nReporte de duplicados guardado en: {ruta_duplicados}")
        print(f"\n--- Aparte, solo para revisión (NO son duplicados confirmados) ---")
        print(f"Lugares con ubicación compartida con otro: {len(ubicaciones_cercanas)}")
        print(f"Reporte guardado en: {ruta_ubicaciones}")