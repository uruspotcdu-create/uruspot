import shutil
from pathlib import Path
from datetime import datetime

RUTA_EXCEL_ORIGINAL = Path("datos/entrada/MASTER14_en_progreso.xlsx")
CARPETA_BACKUPS = Path("datos/backups")


def crear_backup():
    """Copia el Excel actual a datos/backups, con fecha y hora en el
    nombre, para poder recuperarlo si algo sale mal más adelante."""
    if not RUTA_EXCEL_ORIGINAL.exists():
        print(f"ERROR: no encuentro el archivo original en {RUTA_EXCEL_ORIGINAL}")
        return None

    # Ej: 20260717_161530  -> año mes día _ hora minuto segundo
    marca_de_tiempo = datetime.now().strftime("%Y%m%d_%H%M%S")
    nombre_backup = f"backup_{marca_de_tiempo}_{RUTA_EXCEL_ORIGINAL.name}"
    ruta_backup = CARPETA_BACKUPS / nombre_backup

    CARPETA_BACKUPS.mkdir(parents=True, exist_ok=True)
    shutil.copy2(RUTA_EXCEL_ORIGINAL, ruta_backup)

    print(f"Backup creado: {ruta_backup}")
    return ruta_backup


if __name__ == "__main__":
    crear_backup()