import pandas as pd
from data_loader import cargar_datos

datos = cargar_datos()

sin_coordenadas = datos[datos["Latitud"].isna() | datos["Longitud"].isna()]
con_direccion = sin_coordenadas[sin_coordenadas["Dirección"].notna()]

reporte = con_direccion[["Nombre", "Dirección"]]
reporte.to_csv("datos/salida/direcciones_a_corregir.csv", index=False, encoding="utf-8-sig")

print(f"Lugares con dirección pero sin coordenadas: {len(reporte)}")
print("Reporte guardado en: datos/salida/direcciones_a_corregir.csv")