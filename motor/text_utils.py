import re
import pandas as pd


def normalizar_texto(texto):
    """Convierte un texto a una forma estándar para comparar:
    todo en minúsculas, sin espacios de más al principio, final,
    o repetidos en el medio, y sin espacios pegados a '/' o '-'.

    Este último punto es importante: sin él, "Gimnasio / Crossfit"
    y "Gimnasio/Crossfit" se consideran dos categorías DISTINTAS,
    cuando en realidad son la misma escrita con un espacio de más.
    """
    if pd.isna(texto):
        return ""
    texto = str(texto).lower().strip()
    texto = " ".join(texto.split())
    # Saca espacios pegados a "/" o "-": "a / b" y "a/b" quedan iguales.
    texto = re.sub(r"\s*/\s*", "/", texto)
    texto = re.sub(r"\s*-\s*", "-", texto)
    return texto