import pandas as pd
from pathlib import Path
from data_loader import cargar_datos
from backup_manager import crear_backup
from data_writer import guardar_excel
from google_places_client import buscar_place_id

crear_backup()
datos = cargar_datos()

faltantes = datos[datos["Place ID"].isna() | (datos["Place ID"] == "")]

resultados = []

for indice, fila in faltantes.iterrows():
    nombre = str(fila["Nombre"])
    direccion = str(fila["Dirección"]) if pd.notna(fila["Dirección"]) else "Concepción del Uruguay, Entre Ríos"

    resultado = buscar_place_id(nombre, direccion)

    if resultado:
        datos.at[indice, "Place ID"] = str(resultado.get("place_id", ""))
        estado = "Encontrado"
    else:
        estado = "No encontrado"

    resultados.append({
        "Nombre": nombre,
        "Estado": estado
    })
    print(f"{nombre} -> {estado}")

guardar_excel(datos, "datos/entrada/MASTER14_en_progreso.xlsx")

reporte = pd.DataFrame(resultados)
ruta_reporte = Path("datos/salida/reporte_enriquecimiento_place_id.csv")
reporte.to_csv(ruta_reporte, index=False, encoding="utf-8-sig")

print(f"\nTotal procesados: {len(resultados)}")
print(f"Encontrados: {len(reporte[reporte['Estado'] == 'Encontrado'])}")
print(f"No encontrados: {len(reporte[reporte['Estado'] == 'No encontrado'])}")
print(f"Reporte guardado en: {ruta_reporte}")