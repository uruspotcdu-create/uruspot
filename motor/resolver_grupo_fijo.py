import pandas as pd
from data_loader import cargar_datos
from backup_manager import crear_backup
from data_writer import guardar_excel

crear_backup()
datos = cargar_datos()

indices_a_borrar = []
pendientes_manual = []

for nombre, grupo_filas in datos.groupby("Nombre"):
    if len(grupo_filas) < 2:
        continue

    grupos_presentes = grupo_filas["Grupo"].unique()
    if len(grupos_presentes) < 2:
        continue

    if "comercios" in grupos_presentes and len(grupos_presentes) == 2:
        fila_generica = grupo_filas[grupo_filas["Grupo"] == "comercios"]
        indices_a_borrar.extend(fila_generica.index)
    else:
        pendientes_manual.append(grupo_filas)

datos_limpios = datos.drop(index=indices_a_borrar)
guardar_excel(datos_limpios, "datos/entrada/MASTER14_en_progreso.xlsx")

if pendientes_manual:
    reporte = pd.concat(pendientes_manual)
    reporte.to_csv("datos/salida/cruces_pendientes_manual.csv", index=False, encoding="utf-8-sig")

print(f"Resueltos automáticamente (se quitó 'comercios' genérico): {len(indices_a_borrar)}")
print(f"Casos que necesitan tu decisión manual: {len(pendientes_manual)}")
print("Reporte guardado en: datos/salida/cruces_pendientes_manual.csv")