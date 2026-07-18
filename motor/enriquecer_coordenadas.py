import pandas as pd
import requests
import time
from pathlib import Path
from data_loader import cargar_datos
from backup_manager import crear_backup
from data_writer import guardar_excel

URL_BUSQUEDA = "https://nominatim.openstreetmap.org/search"
HEADERS = {"User-Agent": "uru-spot-engine/1.0"}

def buscar_coordenadas(direccion):
    parametros = {"q": direccion, "format": "json", "limit": 1}
    respuesta = requests.get(URL_BUSQUEDA, params=parametros, headers=HEADERS)
    datos = respuesta.json()
    time.sleep(1)
    if len(datos) > 0:
        return float(datos[0]["lat"]), float(datos[0]["lon"])
    return None, None

crear_backup()
datos = cargar_datos()

faltantes = datos[datos["Latitud"].isna() | datos["Longitud"].isna()]

resultados = []

for indice, fila in faltantes.iterrows():
    nombre = str(fila["Nombre"])
    direccion = fila["Dirección"] if pd.notna(fila["Dirección"]) else None

    if not direccion:
        resultados.append({"Nombre": nombre, "Estado": "Sin dirección para buscar"})
        print(f"{nombre} -> Sin dirección")
        continue

    lat, lon = buscar_coordenadas(direccion)

    if lat and lon:
        datos.at[indice, "Latitud"] = lat
        datos.at[indice, "Longitud"] = lon
        estado = "Encontrado"
    else:
        estado = "No encontrado"

    resultados.append({"Nombre": nombre, "Estado": estado})
    print(f"{nombre} -> {estado}")

guardar_excel(datos, "datos/entrada/MASTER14_en_progreso.xlsx")

reporte = pd.DataFrame(resultados)
ruta_reporte = Path("datos/salida/reporte_enriquecimiento_coordenadas.csv")
reporte.to_csv(ruta_reporte, index=False, encoding="utf-8-sig")

print(f"\nTotal procesados: {len(resultados)}")
print(f"Encontrados: {len(reporte[reporte['Estado'] == 'Encontrado'])}")
print(f"No encontrados: {len(reporte[reporte['Estado'] == 'No encontrado'])}")
print(f"Sin dirección: {len(reporte[reporte['Estado'] == 'Sin dirección para buscar'])}")
print(f"Reporte guardado en: {ruta_reporte}")