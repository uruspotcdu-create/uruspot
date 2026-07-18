import pandas as pd
from pathlib import Path
from data_loader import cargar_datos
from text_utils import normalizar_texto

# Columnas de la base de datos que este módulo sabe normalizar.
# Si en el futuro hay que sumar otra columna (por ejemplo, "Estado
# Verificación"), alcanza con agregarla acá.
COLUMNAS_A_NORMALIZAR = ["Categoría", "Grupo"]

RUTA_CATEGORIAS_OFICIALES = Path("datos/entrada/categorias_oficiales.csv")


def analizar_columna(tabla, nombre_columna):
    """Agrupa los valores de una columna por su forma normalizada,
    para detectar variantes de escritura del mismo valor real.
    Además sugiere, para cada grupo, cuál es la variante más usada
    (candidata natural a ser la forma "oficial")."""
    tabla = tabla.copy()
    tabla["_valor_normalizado"] = tabla[nombre_columna].apply(normalizar_texto)

    resultado = []
    grupos = tabla.groupby("_valor_normalizado")
    for valor_normalizado, grupo in grupos:
        if valor_normalizado == "":
            continue
        conteo_variantes = grupo[nombre_columna].value_counts()
        variante_mas_comun = conteo_variantes.idxmax()

        resultado.append({
            "Columna": nombre_columna,
            "Valor normalizado": valor_normalizado,
            "Valor oficial sugerido": variante_mas_comun,
            "Cantidad de lugares": len(grupo),
            "Variantes encontradas": " | ".join(str(v) for v in conteo_variantes.index),
            "Cantidad de variantes distintas": len(conteo_variantes),
        })

    return pd.DataFrame(resultado).sort_values("Cantidad de variantes distintas", ascending=False)


def generar_borrador_categorias_oficiales(datos, ruta_salida=RUTA_CATEGORIAS_OFICIALES):
    """Crea (o sobreescribe) el archivo de categorías oficiales,
    sugiriendo como valor oficial la variante más común de cada grupo.

    Este archivo es un PUNTO DE PARTIDA, no una verdad final: hay que
    abrirlo y revisar a mano la columna 'Valor oficial', porque "la
    variante más común" no siempre es la mejor escrita.

    IMPORTANTE: si el archivo ya existe y fue editado a mano, correr
    esta función de nuevo lo pisa por completo. Por eso es una acción
    manual y separada del pipeline automático, no algo que se corre solo.
    """
    partes = [analizar_columna(datos, columna) for columna in COLUMNAS_A_NORMALIZAR]
    combinado = pd.concat(partes, ignore_index=True)

    tabla_oficial = combinado[["Columna", "Valor normalizado", "Valor oficial sugerido"]].rename(
        columns={"Valor oficial sugerido": "Valor oficial"}
    )
    tabla_oficial.to_csv(ruta_salida, index=False, encoding="utf-8-sig")
    return ruta_salida


def cargar_categorias_oficiales(ruta=RUTA_CATEGORIAS_OFICIALES):
    """Lee el archivo de categorías oficiales y arma un diccionario
    {(columna, valor_normalizado): valor_oficial} para consultas rápidas.

    Si el archivo todavía no existe, devuelve un diccionario vacío:
    el pipeline puede seguir funcionando, simplemente no corrige nada
    todavía (equivale a decir "aún no definiste ninguna lista oficial")."""
    if not ruta.exists():
        return {}

    tabla = pd.read_csv(ruta, encoding="utf-8-sig")
    mapa = {}
    for _, fila in tabla.iterrows():
        clave = (fila["Columna"], fila["Valor normalizado"])
        mapa[clave] = fila["Valor oficial"]
    return mapa


def normalizar_categorias(datos, mapa_oficial):
    """Reescribe las columnas de COLUMNAS_A_NORMALIZAR usando el mapa
    oficial. Si un valor no tiene forma oficial definida, se deja
    TAL CUAL ESTABA (decisión tomada explícitamente: no bloquea la
    publicación, solo queda reportado como pendiente de mapear).

    Devuelve:
        datos_corregidos: copia de los datos con las columnas ya
            normalizadas donde había mapeo disponible.
        no_mapeados: lista de (indice, nombre, columna, valor original)
            con los valores que no tenían forma oficial todavía.
    """
    datos = datos.copy()
    no_mapeados = []

    for columna in COLUMNAS_A_NORMALIZAR:
        for indice, valor in datos[columna].items():
            valor_normalizado = normalizar_texto(valor)
            if valor_normalizado == "":
                continue  # ya lo captura el chequeo de "campo esencial faltante"

            clave = (columna, valor_normalizado)
            if clave in mapa_oficial:
                datos.at[indice, columna] = mapa_oficial[clave]
            else:
                no_mapeados.append((indice, datos.loc[indice, "Nombre"], columna, valor))

    return datos, no_mapeados


if __name__ == "__main__":
    # Modo diagnóstico: solo analiza y reporta variantes, no toca nada.
    # Para generar el borrador de lista oficial, correr en cambio
    # generar_categorias_oficiales.py
    datos = cargar_datos()
    if datos is not None:
        analisis_categoria = analizar_columna(datos, "Categoría")
        analisis_grupo = analizar_columna(datos, "Grupo")

        ruta_categoria = Path("datos/salida/analisis_categorias.csv")
        ruta_grupo = Path("datos/salida/analisis_grupos.csv")

        analisis_categoria.to_csv(ruta_categoria, index=False, encoding="utf-8-sig")
        analisis_grupo.to_csv(ruta_grupo, index=False, encoding="utf-8-sig")

        con_variantes_categoria = (analisis_categoria["Cantidad de variantes distintas"] > 1).sum()
        con_variantes_grupo = (analisis_grupo["Cantidad de variantes distintas"] > 1).sum()

        print(f"Columna 'Categoría': {len(analisis_categoria)} valores únicos normalizados")
        print(f"  -> {con_variantes_categoria} de ellos tienen más de una forma de escritura distinta")
        print(f"  -> Reporte: {ruta_categoria}")

        print(f"\nColumna 'Grupo': {len(analisis_grupo)} valores únicos normalizados")
        print(f"  -> {con_variantes_grupo} de ellos tienen más de una forma de escritura distinta")
        print(f"  -> Reporte: {ruta_grupo}")