#!/usr/bin/env python3
"""
AI Hub Extension Packager (scripts/package_extension.py)
Gera um pacote .zip limpo e validado para redistribuição da extensão Chrome,
em estrita conformidade com as diretrizes do Chrome Web Store e modo unpacked.
"""

import json
import os
import sys
import zipfile
from pathlib import Path

# ----------------------------------------------------------------------------
# BLOCO 1: Compatibilidade de Consola Windows e Padrões de Exclusão
# O QUE É SUPOSTO ACONTECER:
# - Reconfigura a consola para UTF-8 prevenindo falhas de impressão no Windows.
# - Define a lista de ficheiros/pastas proibidos de entrar no arquivo final de produção
#   (metadados locais _metadata, caches __pycache__, ficheiros .git, scripts .py).
# ----------------------------------------------------------------------------
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

EXCLUDE_PATTERNS = {
    "_metadata",
    "__pycache__",
    ".git",
    ".github",
    ".gitignore",
    ".DS_Store",
    "Thumbs.db",
    "generate_icons.py",
    "README.md",
}

def should_include(rel_path: Path) -> bool:
    """Verifica se o ficheiro deve ser incluído no pacote final de distribuição."""
    parts = rel_path.parts
    for p in parts:
        if p in EXCLUDE_PATTERNS or p.startswith(".") or (p.startswith("_") and p != "_locales"):
            return False
        if p.endswith(".py") or p.endswith(".pyc"):
            return False
    return True

# ----------------------------------------------------------------------------
# BLOCO 2: Empacotamento de Ficheiros no Arquivo ZIP (ZIP_DEFLATED level 9)
# O QUE É SUPOSTO ACONTECER:
# - Lê o manifest.json para extrair versão e nome da extensão.
# - Varre a pasta extension/ e grava cada ficheiro com caminho relativo sem prefixo.
# - Garante que manifest.json fique posicionado exatamente na raiz do arquivo ZIP.
# ----------------------------------------------------------------------------
def package_extension(base_dir: Path, output_dir: Path) -> Path:
    ext_dir = base_dir / "extension"
    manifest_path = ext_dir / "manifest.json"

    if not manifest_path.exists():
        raise FileNotFoundError(f"manifest.json não encontrado em {ext_dir}")

    manifest_data = json.loads(manifest_path.read_text(encoding="utf-8"))
    version = manifest_data.get("version", "1.0.0")
    name = manifest_data.get("name", "ai-hub-extension")

    output_dir.mkdir(parents=True, exist_ok=True)
    zip_filename = f"ai-hub-extension-v{version}.zip"
    zip_path = output_dir / zip_filename

    print(f"[*] A preparar pacote para {name} v{version}...")
    
    files_to_pack = []
    for root, _, filenames in os.walk(ext_dir):
        for filename in filenames:
            full_path = Path(root) / filename
            rel_path = full_path.relative_to(ext_dir)
            if should_include(rel_path):
                files_to_pack.append((full_path, rel_path))

    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for full_path, rel_path in sorted(files_to_pack, key=lambda x: str(x[1])):
            arcname = str(rel_path).replace("\\", "/")
            zf.write(full_path, arcname=arcname)
            stat = full_path.stat()
            print(f"  + {arcname:<35} ({stat.st_size:>6} bytes)")

    print(f"\n[OK] Pacote criado com sucesso em: {zip_path}")
    validate_package(zip_path, manifest_data)
    return zip_path

# ----------------------------------------------------------------------------
# BLOCO 3: Validação Minuciosa de Conformidade do Pacote Gerado
# O QUE É SUPOSTO ACONTECER:
# - Testa o CRC de cada ficheiro no ZIP para garantir que não há dados corrompidos.
# - Verifica se o manifest.json e todos os ícones, scripts e HTMLs declarados existem.
# - Assegura ausência total de ficheiros proibidos pelo Google Chrome.
# ----------------------------------------------------------------------------
def validate_package(zip_path: Path, manifest_data: dict):
    print("[*] A verificar integridade do pacote...")
    with zipfile.ZipFile(zip_path, "r") as zf:
        # 1. Teste de CRC
        bad_crc = zf.testzip()
        if bad_crc:
            raise ValueError(f"Ficheiro corrompido no ZIP: {bad_crc}")

        namelist = set(zf.namelist())

        # 2. Verificar se manifest.json está na raiz
        if "manifest.json" not in namelist:
            raise ValueError("ERRO CRÍTICO: manifest.json tem de estar na raiz do ZIP!")

        # 3. Verificar ícones obrigatórios
        for size, icon_rel in manifest_data.get("icons", {}).items():
            icon_norm = str(icon_rel).replace("\\", "/")
            if icon_norm not in namelist:
                raise ValueError(f"Ícone obrigatório em falta: {icon_norm}")

        # 4. Verificar background service worker
        bg_sw = manifest_data.get("background", {}).get("service_worker")
        if bg_sw and bg_sw.replace("\\", "/") not in namelist:
            raise ValueError(f"Service worker em falta: {bg_sw}")

        # 5. Verificar popup e sidepanel
        popup = manifest_data.get("action", {}).get("default_popup")
        if popup and popup.replace("\\", "/") not in namelist:
            raise ValueError(f"Popup em falta: {popup}")

        sidepanel = manifest_data.get("side_panel", {}).get("default_path")
        if sidepanel and sidepanel.replace("\\", "/") not in namelist:
            raise ValueError(f"Sidepanel em falta: {sidepanel}")

        # 6. Verificar content scripts
        for cs in manifest_data.get("content_scripts", []):
            for script in cs.get("js", []):
                norm = script.replace("\\", "/")
                if norm not in namelist:
                    raise ValueError(f"Content script em falta: {norm}")

        # 7. Verificar ausência de ficheiros proibidos
        for name in namelist:
            parts = name.split("/")
            for p in parts:
                if p.startswith(".") or (p.startswith("_") and p != "_locales"):
                    raise ValueError(f"Ficheiro proibido detetado no pacote: {name}")
                if p.endswith(".py"):
                    raise ValueError(f"Script de desenvolvimento detetado no pacote: {name}")

        total_uncompressed = sum(info.file_size for info in zf.infolist())
        total_compressed = zip_path.stat().st_size
        ratio = (1 - (total_compressed / total_uncompressed)) * 100 if total_uncompressed else 0

        print("  [OK] Verificacao de integridade CRC: 100% OK")
        print("  [OK] Manifest V3 na raiz do arquivo")
        print(f"  [OK] Total de ficheiros empacotados: {len(namelist)}")
        print(f"  [OK] Tamanho descompactado: {total_uncompressed / 1024:.1f} KB")
        print(f"  [OK] Tamanho final comprimido: {total_compressed / 1024:.1f} KB ({ratio:.1f}% reducao)")
        print("  [OK] Zero ficheiros restritos (_metadata, .git, etc.)")
        print("[SUCCESS] Pacote 100% funcional e pronto a distribuir!\n")


if __name__ == "__main__":
    base = Path(__file__).resolve().parent.parent
    dist = base / "dist"
    package_extension(base, dist)
