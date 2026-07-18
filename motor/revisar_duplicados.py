import pandas as pd
from data_loader import cargar_datos

datos = cargar_datos()

duplicados_nombre = datos[datos.duplicated(subset=["Nombre"], keep=False)]
duplicados_nombre = duplicados_nombre.sort_values("Nombre")

columnas = ["Nombre", "Categoría", "Grupo", "Dirección", "Place ID", "Estado Verificación"]
reporte = duplicados_nombre[columnas]

ruta_reporte = "datos/salida/duplicados_para_revisar.csv"
reporte.to_csv(ruta_reporte, index=False, encoding="utf-8-sig")

print(f"Grupos de duplicados por nombre: {datos['Nombre'].duplicated().sum()}")
print(f"Filas totales involucradas: {len(reporte)}")
print(f"Reporte guardado en: {ruta_reporte}")