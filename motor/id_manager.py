import pandas as pd
from pathlib import Path
from data_loader import cargar_datos, RUTA_EXCEL
from data_writer import guardar_excel
from backup_manager import crear_backup

PREFIJO = "URU-"
CANTIDAD_DIGITOS = 5  # URU-00001, URU-00002, ...


def asignar_ids(tabla):
    """Asigna un ID_URU permanente a cada fila que todavía no tenga uno.
    Las filas que ya tienen ID_URU asignado NUNCA se modifican."""
    tabla = tabla.copy()

    # Si la columna todavía no existe en el Excel, la creamos vacía.
    if "ID_URU" not in tabla.columns:
        tabla["ID_URU"] = pd.NA

    # Buscamos cuál es el número más alto ya usado, para continuar
    # la numeración desde ahí y nunca repetir un ID.
    ids_existentes = tabla["ID_URU"].dropna()
    numeros_usados = []
    for id_valor in ids_existentes:
        try:
            numero = int(str(id_valor).replace(PREFIJO, ""))
            numeros_usados.append(numero)
        except ValueError:
            continue

    siguiente_numero = max(numeros_usados, default=0) + 1

    asignados = 0
    for indice in tabla.index:
        if pd.isna(tabla.loc[indice, "ID_URU"]):
            nuevo_id = f"{PREFIJO}{siguiente_numero:0{CANTIDAD_DIGITOS}d}"
            tabla.loc[indice, "ID_URU"] = nuevo_id
            siguiente_numero += 1
            asignados += 1

    return tabla, asignados


if __name__ == "__main__":
    datos = cargar_datos()
    if datos is not None:
        # Regla de oro: nunca escribimos sin backup primero.
        crear_backup()

        datos_con_ids, cantidad_asignados = asignar_ids(datos)

        print(f"Total de lugares: {len(datos_con_ids)}")
        print(f"IDs nuevos asignados: {cantidad_asignados}")
        print(f"IDs que ya existían (sin tocar): {len(datos_con_ids) - cantidad_asignados}")

        guardar_excel(datos_con_ids, RUTA_EXCEL)