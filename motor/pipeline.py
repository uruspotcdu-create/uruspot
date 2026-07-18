"""
pipeline.py

Orquestador central del motor de datos de URU SPOT.

Responsabilidad de este archivo (y SOLO esta):
    decidir en qué orden se ejecutan los módulos, pasar los datos
    de una etapa a la siguiente, y detener el proceso si una etapa
    detecta algo que impide seguir.

Ningún módulo individual (data_loader, coordinate_validator,
category_normalizer, exportar_json, etc.) sabe nada de los demás
ni del orden en que se ejecutan. Esa es justamente la idea: cada
módulo resuelve UN problema, y pipeline.py es el único que conoce
el flujo completo.
"""

import pandas as pd
from pathlib import Path

from data_loader import cargar_datos
from coordinate_validator import validar_coordenadas
from category_normalizer import cargar_categorias_oficiales, normalizar_categorias
from exportar_json import generar_export


def ejecutar_pipeline():
    print("=== INICIANDO PIPELINE URU SPOT ===\n")

    # --- Etapa 1: Carga de datos ---
    datos = cargar_datos()
    if datos is None:
        print("Pipeline detenido: no se pudieron cargar los datos.")
        return
    print(f"[1/4] Datos cargados: {len(datos)} lugares")

    # --- Etapa 2: Validación de coordenadas ---
    problemas = validar_coordenadas(datos)
    indices_bloqueados = {p[0]: p[2] for p in problemas}
    print(f"[2/4] Coordenadas revisadas: {len(problemas)} lugares con problemas "
          f"(quedarán bloqueados para publicación)")

    # --- Etapa 3: Normalización de categorías y grupos ---
    mapa_oficial = cargar_categorias_oficiales()
    if not mapa_oficial:
        print("[3/4] Aviso: no existe todavía datos/entrada/categorias_oficiales.csv "
              "(correr generar_categorias_oficiales.py). Las categorías se publican tal cual están.")
        datos_normalizados, no_mapeados = datos, []
    else:
        datos_normalizados, no_mapeados = normalizar_categorias(datos, mapa_oficial)
        print(f"[3/4] Categorías normalizadas: {len(no_mapeados)} valores sin forma oficial definida "
              f"(se publican tal cual, sin corregir)")

        if no_mapeados:
            tabla_no_mapeados = pd.DataFrame(
                no_mapeados,
                columns=["Fila", "Nombre", "Columna", "Valor original"]
            )
            ruta_no_mapeados = Path("datos/salida/categorias_sin_mapear.csv")
            tabla_no_mapeados.to_csv(ruta_no_mapeados, index=False, encoding="utf-8-sig")
            print(f"      -> Detalle guardado en: {ruta_no_mapeados}")

    # --- Etapa 4: Exportación ---
    resultado = generar_export(datos_normalizados, indices_bloqueados)
    print(
        f"[4/4] Exportación completa: {resultado['listos']} listos, "
        f"{resultado['pendientes']} pendientes "
        f"({resultado['pendientes_por_coordenadas']} de ellos bloqueados por coordenadas)"
    )

    print("\n=== PIPELINE FINALIZADO ===")


if __name__ == "__main__":
    ejecutar_pipeline()