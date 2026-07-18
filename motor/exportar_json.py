import json
import pandas as pd


def generar_export(datos, indices_bloqueados=None):
    """
    Genera el JSON final para la web y el CSV de pendientes.

    Parámetros:
        datos: tabla completa de lugares (ya cargada, sin filtrar).
        indices_bloqueados: dict {indice_fila: motivo}. Lugares que
            otro módulo (por ejemplo coordinate_validator) marcó como
            problemáticos y que por lo tanto NO deben publicarse,
            aunque tengan todos los campos llenos.

    Devuelve un resumen (dict) con las cantidades, para que quien
    llame a esta función pueda mostrar un reporte propio si quiere.
    """
    if indices_bloqueados is None:
        indices_bloqueados = {}

    campos_esenciales = (
        datos["Nombre"].notna()
        & datos["Categoría"].notna()
        & datos["Grupo"].notna()
        & datos["Dirección"].notna()
        & datos["Latitud"].notna()
        & datos["Longitud"].notna()
    )

    bloqueados_mask = datos.index.isin(indices_bloqueados.keys())

    listos = datos[campos_esenciales & ~bloqueados_mask]
    no_listos = datos[~datos.index.isin(listos.index)].copy()

    lugares_json = []
    for _, fila in listos.iterrows():
        lugares_json.append({
            "id": fila.get("ID_URU"),
            "nombre": fila.get("Nombre"),
            "categoria": fila.get("Categoría"),
            "grupo": fila.get("Grupo"),
            "direccion": fila.get("Dirección"),
            "descripcion": fila.get("Descripción") if pd.notna(fila.get("Descripción")) else None,
            "lat": fila.get("Latitud"),
            "lng": fila.get("Longitud"),
            "rating": fila.get("Rating") if pd.notna(fila.get("Rating")) else None,
            "rating_count": int(fila["Cant. Reseñas"]) if pd.notna(fila.get("Cant. Reseñas")) else None,
            "telefono": fila.get("Teléfono") if pd.notna(fila.get("Teléfono")) else None,
            "place_id": fila.get("Place ID") if pd.notna(fila.get("Place ID")) else None,
            "estado_verificacion": fila.get("Estado Verificación") if pd.notna(fila.get("Estado Verificación")) else None,
        })

    with open("datos/salida/uru_spot_lugares.json", "w", encoding="utf-8") as archivo:
        json.dump(lugares_json, archivo, ensure_ascii=False, indent=2)

    # Motivo por el que cada pendiente no se publicó: si el índice
    # está en indices_bloqueados, usamos ese motivo (viene de
    # coordinate_validator); si no, es que le falta un campo esencial.
    no_listos["Motivo"] = no_listos.index.map(
        lambda i: indices_bloqueados.get(i, "Campo esencial faltante")
    )
    no_listos[["Nombre", "Grupo", "Motivo"]].to_csv(
        "datos/salida/pendientes_para_publicar.csv", index=False, encoding="utf-8-sig"
    )

    print(f"Lugares listos para publicar: {len(listos)}")
    print(f"Lugares pendientes: {len(no_listos)}")
    print("JSON guardado en: datos/salida/uru_spot_lugares.json")
    print("Pendientes guardados en: datos/salida/pendientes_para_publicar.csv")

    return {
        "listos": len(listos),
        "pendientes": len(no_listos),
        "pendientes_por_coordenadas": int(
            (no_listos["Motivo"] != "Campo esencial faltante").sum()
        ),
    }


if __name__ == "__main__":
    # Permite seguir corriendo "python motor/exportar_json.py" solo,
    # para una prueba rápida. En ese caso no hay validación de
    # coordenadas (esa la aporta pipeline.py cuando corre todo junto).
    from data_loader import cargar_datos

    datos = cargar_datos()
    if datos is not None:
        generar_export(datos)