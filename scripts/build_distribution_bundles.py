#!/usr/bin/env python3
"""
AI Hub Distribution Bundle Builder (scripts/build_distribution_bundles.py)
Cria os dois pacotes ZIP solicitados:
1. dist/ai-hub-instalacao.zip -> Ficheiros prontos a instalar num novo computador (Extensão + Servidor Opcional + Instruções)
2. dist/ai-hub-projeto-completo.zip -> Projeto completo com todo o código fonte, testes e manuais técnicos.
"""

import os
import sys
import zipfile
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
DIST.mkdir(parents=True, exist_ok=True)

INSTALL_INSTRUCTIONS = """================================================================================
                    AI HUB - GUIA DE INSTALACAO (NOVO COMPUTADOR)
================================================================================

A extensao AI Hub permite partilhar memoria, injetar contexto e exportar
documentos (DOCX, XLSX, PDF, ZIP e codigo) nos chats oficiais de:
- DeepSeek (chat.deepseek.com)
- Qwen (chat.qwen.ai)
- GLM / Z.ai (chat.z.ai)
- Mistral (chat.mistral.ai)

--------------------------------------------------------------------------------
PASSO 1: INSTALAR A EXTENSAO NO CHROME / EDGE / BRAVE (100% AUTONOMA)
--------------------------------------------------------------------------------
A extensao funciona de forma 100% autonoma (Zero-Install). NAO precisa de instalar
Python nem qualquer programa adicional para exportar DOCX, XLSX, PDF ou ZIP.

1. Abra o navegador (Google Chrome, Microsoft Edge ou Brave).
2. Na barra de enderecos, aceda a:
   - No Chrome: chrome://extensions/
   - No Edge:   edge://extensions/
   - No Brave:  brave://extensions/
3. No canto superior direito, ative a opcao: "Modo de programador" (Developer mode).
4. Clique no botao: "Carregar descompactada" (Load unpacked).
5. Selecione a pasta: "1-EXTENSAO-CHROME" (a pasta que contem o ficheiro manifest.json).
6. A extensao "AI Hub Memoria" fica ativa de imediato!
7. Clique no icone da peca de puzzle na barra do navegador e fixe (pin) o AI Hub.

* NOTA DE SEGURANCA EM COMPUTADORES DE TRABALHO:
  Nao e necessaria qualquer palavra-passe de Administrador do Windows nem autorizacao UAC.

--------------------------------------------------------------------------------
PASSO 2 (OPCIONAL): SERVIDOR LOCAL PYTHON
--------------------------------------------------------------------------------
Caso pretenda utilizar o servidor local complementar (para gravar automaticamente
ficheiros no disco rigido fora do navegador ou aceder ao painel web http://127.0.0.1:8765):

1. Certifique-se de que tem o Python instalado (https://www.python.org).
2. Abra a pasta: "2-SERVIDOR-LOCAL-OPCIONAL".
3. De um duplo clique no ficheiro: "iniciar_servidor.bat"
   (ou no terminal execute: pip install -r requirements.txt e python server.py).
4. O servidor arranca em: http://127.0.0.1:8765

--------------------------------------------------------------------------------
COMO USAR NO DIA A DIA
--------------------------------------------------------------------------------
1. Abra qualquer chat suportado (ex: https://chat.deepseek.com).
2. Vera a barra flutuante do AI Hub no canto do ecra:
   - "Inserir memoria" -> Cola as suas instrucoes permanentes na mensagem.
   - "Chat -> DOCX / PDF / XLSX" -> Descarrega a conversa instantaneamente.
   - "Codigo -> ficheiros" -> Se houver codigo, gera um pacote .zip com todos os ficheiros.
   - "📁 Ficheiros" -> Atalho de 1 clique para ver os ficheiros criados.
3. No icone da extensao na barra superior pode aceder a qualquer momento a
   "📁 Ver Ficheiros Criados" ou "Abrir Downloads do Chrome".
================================================================================
"""

BAT_CONTENT = """@echo off
title AI Hub - Servidor Local
echo ============================================================================
echo                      AI Hub - Servidor Local
echo ============================================================================
echo A iniciar o servidor em http://127.0.0.1:8765 ...
echo Para encerrar o servidor, feche esta janela ou pressione Ctrl+C.
echo.
python server.py
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Ocorreu um erro ao iniciar o servidor.
    echo Certifique-se de que o Python esta instalado e no PATH do sistema.
    echo Pode instalar as dependencias necessarias executando:
    echo     pip install -r requirements.txt
    echo.
    pause
)
"""

def create_installation_zip():
    """Cria o pacote dist/ai-hub-instalacao.zip pronto para novos PCs."""
    zip_path = DIST / "ai-hub-instalacao.zip"
    print(f"[*] A criar pacote de instalacao para novo PC: {zip_path.name}...")

    ext_dir = ROOT / "extension"
    local_dir = ROOT / "local"

    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        # 1. Instruções de instalação
        zf.writestr("COMO_INSTALAR.txt", INSTALL_INSTRUCTIONS.strip())

        # 2. Pasta 1-EXTENSAO-CHROME
        exclude_ext = {"_metadata", "__pycache__", ".git", "generate_icons.py", "README.md"}
        for root, _, files in os.walk(ext_dir):
            for file in files:
                full_p = Path(root) / file
                rel_p = full_p.relative_to(ext_dir)
                if any(part in exclude_ext or part.startswith(".") or part.endswith(".py") for part in rel_p.parts):
                    continue
                arcname = f"1-EXTENSAO-CHROME/{str(rel_p).replace(chr(92), '/')}"
                zf.write(full_p, arcname=arcname)

        # 3. Pasta 2-SERVIDOR-LOCAL-OPCIONAL
        zf.writestr("2-SERVIDOR-LOCAL-OPCIONAL/iniciar_servidor.bat", BAT_CONTENT.replace("\n", "\r\n"))
        zf.write(local_dir / "server.py", arcname="2-SERVIDOR-LOCAL-OPCIONAL/server.py")
        if (ROOT / "requirements.txt").exists():
            zf.write(ROOT / "requirements.txt", arcname="2-SERVIDOR-LOCAL-OPCIONAL/requirements.txt")

        # Arquivos da pasta web/
        web_dir = local_dir / "web"
        if web_dir.exists():
            for root, _, files in os.walk(web_dir):
                for file in files:
                    full_p = Path(root) / file
                    rel_p = full_p.relative_to(local_dir)
                    arcname = f"2-SERVIDOR-LOCAL-OPCIONAL/{str(rel_p).replace(chr(92), '/')}"
                    zf.write(full_p, arcname=arcname)

        # Pastas data e exports (.gitkeep para manter a pasta)
        zf.writestr("2-SERVIDOR-LOCAL-OPCIONAL/data/.gitkeep", "")
        zf.writestr("2-SERVIDOR-LOCAL-OPCIONAL/exports/.gitkeep", "")

    size_kb = zip_path.stat().st_size / 1024
    print(f"  [OK] Criado: {zip_path.name} ({size_kb:.1f} KB)")
    return zip_path


def create_project_and_manual_zip():
    """Cria o pacote dist/ai-hub-projeto-completo.zip com todo o projeto e manuais."""
    zip_path = DIST / "ai-hub-projeto-completo.zip"
    print(f"[*] A criar pacote do projeto completo e manual: {zip_path.name}...")

    exclude_dirs = {".git", ".pytest_cache", "__pycache__", "dist", ".idea", ".vscode", "venv", "env", ".venv"}
    exclude_files = {".DS_Store", "Thumbs.db"}

    files_to_pack = []
    for root, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in exclude_dirs and not d.startswith(".")]
        for file in files:
            if file in exclude_files or file.endswith(".pyc") or file.endswith(".zip"):
                continue
            full_p = Path(root) / file
            rel_p = full_p.relative_to(ROOT)
            files_to_pack.append((full_p, rel_p))

    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for full_p, rel_p in sorted(files_to_pack, key=lambda x: str(x[1])):
            arcname = f"ai-hub/{str(rel_p).replace(chr(92), '/')}"
            zf.write(full_p, arcname=arcname)

    size_kb = zip_path.stat().st_size / 1024
    print(f"  [OK] Criado: {zip_path.name} ({size_kb:.1f} KB)")
    return zip_path


def main():
    print("=================================================================")
    print("         AI Hub - Gerador de Pacotes de Distribuicao            ")
    print("=================================================================")
    z1 = create_installation_zip()
    z2 = create_project_and_manual_zip()
    print("\n[SUCCESS] Todos os pacotes foram criados com sucesso em:")
    print(f"  1. {z1}")
    print(f"  2. {z2}")


if __name__ == "__main__":
    main()
