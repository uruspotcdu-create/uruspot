import pandas as pd
from data_loader import cargar_datos
from backup_manager import crear_backup
from data_writer import guardar_excel

crear_backup()
datos = cargar_datos()

decisiones = {
    "Cerrajería Boxer": "oficios_tecnicos",
    "Cerrajería Cerrojo de Guillermo Waterloo": "oficios_tecnicos",
    "Cerrajería San Pedro": "oficios_tecnicos",
    "Herrería Martín": "oficios_tecnicos",
    "Herrería y Metalúrgica Beck": "oficios_tecnicos",
    "La Sampedrina S.A.": "oficios_tecnicos",
    "Termas Concepción de Entre Ríos": "alojamiento",
}

indices_a_borrar = []

for nombre, grupo_a_mantener in decisiones.items():
    filas = datos[datos["Nombre"] == nombre]
    filas_a_eliminar = filas[filas["Grupo"] != grupo_a_mantener]
    indices_a_borrar.extend(filas_a_eliminar.index)

datos_limpios = datos.drop(index=indices_a_borrar)
guardar_excel(datos_limpios, "datos/entrada/MASTER14_en_progreso.xlsx")

print(f"Filas eliminadas: {len(indices_a_borrar)}")
print(f"Total de lugares ahora: {len(datos_limpios)}")