import requests
import time

URL_BUSQUEDA = "https://nominatim.openstreetmap.org/search"

def buscar_place_id(nombre, direccion):
    consulta = f"{nombre}, {direccion}"
    parametros = {
        "q": consulta,
        "format": "json",
        "limit": 1
    }
    headers = {
        "User-Agent": "uru-spot-engine/1.0"
    }
    respuesta = requests.get(URL_BUSQUEDA, params=parametros, headers=headers)
    datos = respuesta.json()
    time.sleep(1)

    if len(datos) > 0:
        return datos[0]
    else:
        return None