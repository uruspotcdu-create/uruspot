import pandas as pd
from pathlib import Path
from data_loader import cargar_datos

# Coordenadas aproximadas del centro de Concepción del Uruguay,
# usadas como referencia para detectar valores fuera de rango.
LAT_CENTRO = -32.48
LON_CENTRO = -58.23
RADIO_MAXIMO_GRADOS = 0.5  # margen amplio, cubre toda la zona rural cercana


def validar_coordenadas(tabla):
    """Revisa cada fila y clasifica el estado de sus coordenadas."""
    problemas = []

    for indice, fila in tabla.iterrows():
        nombre = fila["Nombre"]
        lat = fila["Latitud"]
        lon = fila["Longitud"]

        # Caso 1: vacío (pandas representa los vacíos como NaN)
        if pd.isna(lat) or pd.isna(lon):
            problemas.append((indice, nombre, "FALTANTE", lat, lon))
            continue

        # Caso 2: fuera del rango físico posible de coordenadas
        if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
            problemas.append((indice, nombre, "FUERA_DE_RANGO_GLOBAL", lat, lon))
            continue

        # Caso 3: lejos del centro de la ciudad (posible error de carga)
        distancia_lat = abs(lat - LAT_CENTRO)
        distancia_lon = abs(lon - LON_CENTRO)
        if distancia_lat > RADIO_MAXIMO_GRADOS or distancia_lon > RADIO_MAXIMO_GRADOS:
            problemas.append((indice, nombre, "LEJOS_DE_LA_CIUDAD", lat, lon))
            continue

    return problemas


if __name__ == "__main__":
    datos = cargar_datos()
    if datos is not None:
        problemas = validar_coordenadas(datos)

        print(f"Total de lugares revisados: {len(datos)}")
        print(f"Lugares con problemas de coordenadas: {len(problemas)}")

        # Convertimos la lista de problemas en una tabla, para poder
        # guardarla como archivo — mismo tipo de objeto que usamos
        # para leer el Excel original.
        tabla_problemas = pd.DataFrame(
            problemas,
            columns=["Fila", "Nombre", "Tipo de problema", "Latitud", "Longitud"]
        )

        ruta_reporte = Path("datos/salida/reporte_coordenadas.csv")
        tabla_problemas.to_csv(ruta_reporte, index=False, encoding="utf-8-sig")

        print(f"\nReporte completo guardado en: {ruta_reporte}")

        # Resumen rápido por tipo de problema, para tener un panorama
        # general sin tener que leer fila por fila.
        if problemas:
            print("\nResumen por tipo de problema:")
            print(tabla_problemas["Tipo de problema"].value_counts())
        else:
            print("\nNinguna coordenada problemática detectada.")
            