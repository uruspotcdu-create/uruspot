import pandas as pd
from data_loader import cargar_datos
from backup_manager import crear_backup
from data_writer import guardar_excel

crear_backup()
datos = cargar_datos()

vacios_a_borrar = []
cruces_de_categoria = []

for nombre, grupo_filas in datos.groupby("Nombre"):
    if len(grupo_filas) < 2:
        continue

    direcciones = grupo_filas["Dirección"].fillna("")
    tiene_vacia = (direcciones == "").any()
    tiene_completa = (direcciones != "").any()

    if tiene_vacia and tiene_completa:
        indices_vacios = grupo_filas[direcciones == ""].index
        vacios_a_borrar.extend(indices_vacios)
        continue

    direcciones_unicas = grupo_filas["Dirección"].nunique()
    if direcciones_unicas == 1:
        cruces_de_categoria.append(grupo_filas)

datos_limpios = datos.drop(index=vacios_a_borrar)
guardar_excel(datos_limpios, "datos/entrada/MASTER14_en_progreso.xlsx")

if cruces_de_categoria:
    reporte_cruces = pd.concat(cruces_de_categoria)
    reporte_cruces.to_csv("datos/salida/cruces_de_categoria.csv", index=False, encoding="utf-8-sig")
else:
    reporte_cruces = pd.DataFrame()

print(f"Filas vacías borradas: {len(vacios_a_borrar)}")
print(f"Lugares con cruce de categoría (mismo lugar, dos Grupos): {len(cruces_de_categoria)}")
print(f"Reporte de cruces guardado en: datos/salida/cruces_de_categoria.csv")