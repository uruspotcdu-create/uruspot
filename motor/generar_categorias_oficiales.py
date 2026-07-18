"""
generar_categorias_oficiales.py

Script de UN SOLO USO (o de uso ocasional, cuando quieras rehacer
el borrador desde cero). NO forma parte del pipeline automático.

Lee todos los lugares, agrupa las categorías y grupos por su forma
normalizada, y escribe datos/entrada/categorias_oficiales.csv con
una sugerencia de "valor oficial" para cada uno (la variante más
usada).

Después de correr esto:
    1. Abrí datos/entrada/categorias_oficiales.csv en Excel.
    2. Revisá la columna "Valor oficial" fila por fila.
    3. Corregí a mano los casos donde la sugerencia esté mal
       (por ejemplo, si el sistema sugirió una variante con un
       error de tipeo porque era la más repetida por casualidad).
    4. Guardá el archivo.

A partir de ahí, motor/pipeline.py va a usar ese archivo para
corregir las categorías automáticamente en cada exportación.

ATENCIÓN: si volvés a correr este script, se PISA el archivo
completo, incluidas las correcciones que hayas hecho a mano.
Úsalo de nuevo solo si querés empezar el mapeo de cero.
"""

from data_loader import cargar_datos
from category_normalizer import generar_borrador_categorias_oficiales


if __name__ == "__main__":
    datos = cargar_datos()
    if datos is not None:
        ruta = generar_borrador_categorias_oficiales(datos)
        print(f"Borrador generado en: {ruta}")
        print("Abrilo, revisá la columna 'Valor oficial' y corregí lo que haga falta.")