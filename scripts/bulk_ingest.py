import os
import re
import sys
import json

# Ensure UTF-8 stdout on Windows PowerShell
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

EXTENSION_FORMAT_MAP = {
    ".rfa": "RFA",
    ".rvt": "RVT",
    ".ifc": "IFC",
    ".dwg": "DWG",
    ".skp": "SKP",
    ".pdf": "PDF",
    ".glb": "GLB",
    ".gltf": "GLTF",
    ".zip": "ZIP",
    ".rar": "RAR",
    ".7z": "ZIP",
    ".max": "3DS MAX",
    ".fbx": "FBX",
    ".obj": "OBJ",
    ".nwd": "NWD",
    ".nwc": "NWC",
}

CATEGORY_KEYWORDS = {
    "silla": "Mobiliario",
    "chair": "Mobiliario",
    "sofa": "Mobiliario",
    "mesa": "Mobiliario",
    "table": "Mobiliario",
    "mueble": "Mobiliario",
    "credenza": "Mobiliario",
    "furniture": "Mobiliario",
    "puerta": "Puertas",
    "door": "Puertas",
    "ventana": "Ventanas",
    "window": "Ventanas",
    "sanitario": "Sanitarios",
    "bano": "Sanitarios",
    "baño": "Sanitarios",
    "lavamano": "Sanitarios",
    "sink": "Sanitarios",
    "hvac": "HVAC",
    "aire": "HVAC",
    "difusor": "HVAC",
    "fan": "HVAC",
    "columna": "Estructuras",
    "viga": "Estructuras",
    "estructura": "Estructuras",
    "column": "Estructuras",
    "beam": "Estructuras",
}

def slugify(text):
    text = text.lower()
    text = re.sub(r'[^a-z0-9]+', '-', text)
    return text.strip('-')

def clean_product_name(folder_name):
    name = folder_name.replace("_", " ").strip()
    return " ".join(word.capitalize() if not word.isupper() else word for word in name.split())

def detect_category(folder_name, file_names):
    combined = (folder_name + " " + " ".join(file_names)).lower()
    for keyword, cat in CATEGORY_KEYWORDS.items():
        if keyword in combined:
            return cat
    return "Arquitectura"

def detect_maker(folder_name, file_names):
    combined = (folder_name + " " + " ".join(file_names)).lower()
    if "kokuyo" in combined:
        return "KOKUYO"
    if "plank" in combined:
        return "Plank"
    if "steelbim" in combined:
        return "SteelBIM"
    if "modasa" in combined:
        return "MODASA"
    if "airtek" in combined:
        return "AirTek"
    return "InfraBIM"

def detect_formats(file_names):
    formats = set()
    for fname in file_names:
        ext = os.path.splitext(fname)[1].lower()
        if ext in EXTENSION_FORMAT_MAP:
            formats.add(EXTENSION_FORMAT_MAP[ext])
        elif ext and len(ext) <= 6:
            clean_ext = ext.replace(".", "").upper()
            formats.add(clean_ext)
    return sorted(list(formats)) if formats else ["RFA", "IFC"]

def process_directory(base_path):
    if not os.path.exists(base_path):
        print(f"[ERROR] La ruta especificada no existe: {base_path}")
        return

    print(f"=== PROCESANDO CARPETA MASIVA Y GENERANDO LOTE JSON ===")
    print(f"Directorio Origen: {base_path}\n")

    items = [d for d in os.listdir(base_path) if os.path.isdir(os.path.join(base_path, d))]
    if not items:
        print("[AVISO] No se encontraron subcarpetas en el directorio especificado.")
        return

    batch_payloads = []
    total_items = len(items)

    for idx, folder in enumerate(items, 1):
        folder_path = os.path.join(base_path, folder)
        files = [f for f in os.listdir(folder_path) if os.path.isfile(os.path.join(folder_path, f))]

        name = clean_product_name(folder)
        slug = slugify(name)
        doc_id = f"familias-{slug}"
        category = detect_category(folder, files)
        maker = detect_maker(folder, files)
        formats = detect_formats(files)

        has_glb = any(f.lower().endswith(('.glb', '.gltf')) for f in files)
        image_file = next((f for f in files if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp'))), None)
        image_url = f"file:///{os.path.join(folder_path, image_file).replace('\\', '/')}" if image_file else ""

        attached_files = []
        for fname in files:
            fpath = os.path.join(folder_path, fname)
            attached_files.append({
                "id": f"file-{slugify(fname)}",
                "name": fname,
                "ownerUid": "bulk-script-admin",
                "webViewLink": f"file:///{fpath.replace('\\', '/')}"
            })

        payload = {
            "id": doc_id,
            "kind": "familias",
            "slug": slug,
            "route": f"/familias/{slug}",
            "name": name,
            "maker": maker,
            "category": category,
            "discipline": category,
            "country": "Peru",
            "formats": formats,
            "versions": ["2026", "2025", "2024", "2023"],
            "price": "Gratis",
            "downloads": "1.2K",
            "tags": [maker, category, "BIM"],
            "specs": [f"Archivos incluidos: {', '.join(formats)}", "Compatibilidad: Revit 2020-2026"],
            "description": f"Familia BIM {name} de la marca {maker} parametrizada para flujos de trabajo en Revit y OpenBIM.",
            "visual": "box",
            "feature": "Nuevo",
            "isPremium": False,
            "imageUrl": image_url,
            "has3D": has_glb,
            "hasAR": has_glb,
            "attachedFiles": attached_files,
            "isArchived": False
        }

        batch_payloads.append(payload)
        print(f"[{idx}/{total_items}] Item parsed: {name}")
        print(f"       Categoría: {category} | Marca: {maker}")
        print(f"       Formatos autodetectados: {', '.join(formats)}")
        print(f"       Archivos adjuntos: {len(files)} archivos\n")

    # Output JSON file path
    output_filename = "bulk_catalog_import.json"
    output_path = os.path.join(base_path, output_filename)
    local_project_output = os.path.join(os.getcwd(), output_filename)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(batch_payloads, f, ensure_ascii=False, indent=2)

    with open(local_project_output, "w", encoding="utf-8") as f:
        json.dump(batch_payloads, f, ensure_ascii=False, indent=2)

    print("=" * 60)
    print(f"🎉 Lote de {len(batch_payloads)} recursos generado exitosamente.")
    print(f"📄 Archivo generado en: {output_path}")
    print(f"📄 Archivo copiado en:  {local_project_output}")
    print("\n💡 Puedes importar este lote en 1-clic desde el Panel Administrador (/admin).")

if __name__ == "__main__":
    target_path = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("--") else r"D:\RECURSOS INFRABIM"
    process_directory(target_path)
