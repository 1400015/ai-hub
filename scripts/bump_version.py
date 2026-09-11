#!/usr/bin/env python3
"""Script para actualizar versao da extensao automaticamente."""
import json
import sys
from pathlib import Path

def bump_version(manifest_path, version_type="patch"):
    """Actualiza versao no manifest.json.
    
    Args:
        manifest_path: Caminho para manifest.json
        version_type: 'major', 'minor', ou 'patch'
    """
    manifest = Path(manifest_path)
    if not manifest.exists():
        print(f"Erro: {manifest} nao encontrado")
        sys.exit(1)
    
    data = json.loads(manifest.read_text(encoding="utf-8"))
    version = data.get("version", "1.0.0")
    parts = list(map(int, version.split(".")))
    
    if version_type == "major":
        parts[0] += 1
        parts[1] = 0
        parts[2] = 0
    elif version_type == "minor":
        parts[1] += 1
        parts[2] = 0
    else:  # patch
        parts[2] += 1
    
    new_version = ".".join(map(str, parts))
    data["version"] = new_version
    
    manifest.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Versao actualizada: {version} → {new_version}")
    return new_version


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python bump_version.py [major|minor|patch]")
        sys.exit(1)
    
    version_type = sys.argv[1].lower()
    if version_type not in ("major", "minor", "patch"):
        print("Erro: tipo deve ser major, minor ou patch")
        sys.exit(1)
    
    # Procura manifest.json na estrutura do projeto
    for root in [".", "./extension"]:
        manifest = Path(root) / "manifest.json"
        if manifest.exists():
            bump_version(manifest, version_type)
            break
    else:
        print("Erro: manifest.json nao encontrado")
        sys.exit(1)
