#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
split_dataset.py — genera los dos archivos de PRODUCCIÓN a partir de la
fuente de verdad `lugares-mapa.json`.

POR QUÉ EXISTE ESTE SCRIPT
───────────────────────────────────────────────────────────────────────────
`lugares-mapa.json` sigue siendo el único archivo que DSA edita a mano (o
vía los scripts de merge/auditoría existentes): mismo flujo de siempre,
mismos 13 campos, mismo formato legible. Nada cambia en ese frente.

Lo que cambia es qué se DESCARGA en el arranque de la app. De los 13 campos,
solo 6-8 son necesarios para que el mapa pinte los pines, los filtros
cuenten y la búsqueda funcione (id, nombre, categoria, grupo, lat, lng,
rating, rating_count). El resto (direccion, descripcion, telefono,
place_id) solo se lee dentro del popup de UN lugar, y ese popup ya se
generaba de forma perezosa (recién al abrirlo) desde la auditoría de
rendimiento anterior — pero el JSON completo de los 862 lugares se seguía
descargando entero de entrada de todos modos.

Este script separa eso en dos archivos:

  lugares-core.json      → bloqueante, se pide en el arranque, es lo que
                            determina cuándo el usuario puede interactuar.
  lugares-detalles.json  → se pide en paralelo pero se aplica en segundo
                            plano (requestIdleCallback), nunca bloquea el
                            primer render.

USO
───────────────────────────────────────────────────────────────────────────
    python3 split_dataset.py

Correrlo cada vez que se edite `lugares-mapa.json` (a mano, con el script de
merge, etc.), antes de hacer commit/deploy. Es determinístico e idempotente:
correrlo dos veces seguidas sin tocar la fuente produce los mismos bytes.
"""

import json
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
SRC = BASE_DIR / "lugares-mapa.json"
OUT_CORE = BASE_DIR / "lugares-core.json"
OUT_DETAILS = BASE_DIR / "lugares-detalles.json"
OUT_ESTADO = BASE_DIR / "lugares-estado.json"

# Campos que necesita el arranque (pin en el mapa, filtros, búsqueda,
# spotlight "mejor puntuados"). rating/rating_count son opcionales: la
# mayoría de los lugares no tiene reseñas de Google todavía.
CORE_FIELDS_REQUIRED = ("id", "nombre", "categoria", "grupo", "lat", "lng")
CORE_FIELDS_OPTIONAL = ("rating", "rating_count")

# Campos que solo se leen dentro de un popup ya abierto por el usuario.
DETAIL_FIELDS_OPTIONAL = ("direccion", "descripcion", "telefono", "place_id")

# Campo que hoy solo lee js/fase4-motor.js (badge "pendiente de
# verificación"), en segundo plano vía requestIdleCallback. Antes de este
# archivo, fase4-motor.js pedía lugares-mapa.json ENTERO (13 campos, 1.468
# registros) solo para leer este único campo — el resto se ignoraba a
# propósito (ver comentario en fase4-motor.js sobre "grupo" desincronizado).
ESTADO_FIELD = "estado_verificacion"


def build_core(lugar):
    out = {}
    for k in CORE_FIELDS_REQUIRED:
        out[k] = lugar[k]
    for k in CORE_FIELDS_OPTIONAL:
        v = lugar.get(k)
        if v is not None:
            out[k] = v
    return out


def build_detail(lugar):
    out = {"id": lugar["id"]}
    tiene_algo = False
    for k in DETAIL_FIELDS_OPTIONAL:
        v = lugar.get(k)
        if v:
            out[k] = v
            tiene_algo = True
    return out if tiene_algo else None


def build_estado(lugar):
    v = lugar.get(ESTADO_FIELD)
    if not v:
        return None
    return {"id": lugar["id"], ESTADO_FIELD: v}


def main():
    if not SRC.exists():
        print(f"ERROR: no se encontró {SRC}", file=sys.stderr)
        sys.exit(1)

    with SRC.open(encoding="utf-8") as f:
        data = json.load(f)

    if not isinstance(data, list):
        print("ERROR: lugares-mapa.json no es un array en el nivel raíz", file=sys.stderr)
        sys.exit(1)

    ids = [o.get("id") for o in data]
    if len(ids) != len(set(ids)):
        print("ERROR: hay ids duplicados en lugares-mapa.json — abortado, "
              "no se generó ningún archivo de salida", file=sys.stderr)
        sys.exit(1)

    core = [build_core(o) for o in data]
    details = [d for d in (build_detail(o) for o in data) if d is not None]
    estado = [e for e in (build_estado(o) for o in data) if e is not None]

    core_json = json.dumps(core, ensure_ascii=False, separators=(",", ":"))
    details_json = json.dumps(details, ensure_ascii=False, separators=(",", ":"))
    estado_json = json.dumps(estado, ensure_ascii=False, separators=(",", ":"))

    OUT_CORE.write_text(core_json, encoding="utf-8")
    OUT_DETAILS.write_text(details_json, encoding="utf-8")
    OUT_ESTADO.write_text(estado_json, encoding="utf-8")

    src_bytes = len(SRC.read_text(encoding="utf-8").encode("utf-8"))
    core_bytes = len(core_json.encode("utf-8"))
    details_bytes = len(details_json.encode("utf-8"))
    estado_bytes = len(estado_json.encode("utf-8"))

    print(f"OK — {len(data)} lugares procesados")
    print(f"  {SRC.name:24s} {src_bytes:>8,} bytes  (fuente, sin cambios)")
    print(f"  {OUT_CORE.name:24s} {core_bytes:>8,} bytes  (bloqueante — {len(core)} registros)")
    print(f"  {OUT_DETAILS.name:24s} {details_bytes:>8,} bytes  (segundo plano — {len(details)} registros)")
    print(f"  {OUT_ESTADO.name:24s} {estado_bytes:>8,} bytes  (segundo plano — {len(estado)} registros)")
    print(f"  Payload bloqueante: {(1 - core_bytes / src_bytes) * 100:.1f}% menor que la fuente")
    print(f"  lugares-estado.json es {(1 - estado_bytes / src_bytes) * 100:.1f}% menor que lugares-mapa.json "
          f"(reemplaza al fetch de fase4-motor.js que traía el archivo completo por 1 solo campo)")


if __name__ == "__main__":
    main()
