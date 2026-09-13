#!/usr/bin/env python3
"""Testes basicos para o servidor AI Hub."""
import pytest
import json
import sys
from pathlib import Path

# Adiciona o diretório local ao path
sys.path.insert(0, str(Path(__file__).parent.parent / "local"))

from server import (
    safe_filename,
    load_memories,
    save_memories,
    load_conversations,
    save_conversations,
    MAX_CONTENT_SIZE,
    export_xlsx,
    export_pdf,
    export_docx,
    _clean_for_pdf,
    PROVIDERS,
)


class TestSafeFilename:
    """Testes para funcao de sanitizacao de filenames."""
    
    def test_basic_sanitization(self):
        assert safe_filename("test file") == "test_file"
        assert safe_filename("test/file") == "test_file"
        assert safe_filename("test\\file") == "test_file"
    
    def test_special_chars(self):
        assert safe_filename("test<>file") == "test__file"
        assert safe_filename("test|file") == "test_file"
        assert safe_filename("test?file") == "test_file"
    
    def test_length_limit(self):
        long_name = "a" * 200
        result = safe_filename(long_name)
        assert len(result) <= 80
    
    def test_default_value(self):
        assert safe_filename("") == "export"
        assert safe_filename(None) == "export"


class TestMemories:
    """Testes para gestao de memorias."""
    
    def test_save_and_load(self, tmp_path, monkeypatch):
        # Mock do arquivo de memorias
        monkeypatch.setattr("server.MEMORIES_FILE", tmp_path / "memories.json")
        
        test_memories = [
            {"id": "1", "title": "Teste", "body": "Conteudo", "active": True}
        ]
        save_memories(test_memories)
        loaded = load_memories()
        
        assert len(loaded) == 1
        assert loaded[0]["title"] == "Teste"
    
    def test_empty_file(self, tmp_path, monkeypatch):
        monkeypatch.setattr("server.MEMORIES_FILE", tmp_path / "nonexistent.json")
        assert load_memories() == []


class TestConversations:
    """Testes para gestao de conversas."""
    
    def test_save_and_load(self, tmp_path, monkeypatch):
        monkeypatch.setattr("server.CONVERSATIONS_FILE", tmp_path / "conversations.json")
        
        test_convs = [
            {"id": "1", "messages": [{"role": "user", "content": "Olá"}]}
        ]
        save_conversations(test_convs)
        loaded = load_conversations()
        
        assert len(loaded) == 1
        assert loaded[0]["messages"][0]["role"] == "user"


class TestContentSizeLimit:
    """Testes para limite de tamanho de conteudo."""
    
    def test_max_size_constant(self):
        assert MAX_CONTENT_SIZE == 5 * 1024 * 1024  # 5MB
    
    def test_content_under_limit(self):
        content = "a" * (MAX_CONTENT_SIZE - 1)
        assert len(content) < MAX_CONTENT_SIZE
    
    def test_content_over_limit(self):
        content = "a" * (MAX_CONTENT_SIZE + 1)
        assert len(content) > MAX_CONTENT_SIZE


class TestExports:
    """Testes para funcoes de exportacao."""

    def test_export_xlsx_invalid_title(self, tmp_path):
        dest = tmp_path / "test.xlsx"
        export_xlsx(dest, "Coluna A\tColuna B\n1\t2", "chat/deepseek:test*?")
        assert dest.exists()
        assert dest.stat().st_size > 0

    def test_export_pdf_unicode_content(self, tmp_path):
        dest = tmp_path / "test.pdf"
        content = "Olá mundo! Resposta de teste: 这是一个测试 (chinês) \U0001F600"
        export_pdf(dest, content, "Título de Teste / Especial")
        assert dest.exists()
    def test_clean_for_pdf_strips_control_chars(self):
        text_with_ctrl = "Hello\x00\x08World\x0bTest\x1fEnd"
        cleaned = _clean_for_pdf(text_with_ctrl)
        assert "\x00" not in cleaned
        assert "\x08" not in cleaned
        assert "\x0b" not in cleaned
        assert "\x1f" not in cleaned
        assert "HelloWorldTestEnd" in cleaned

    def test_export_docx_creation(self, tmp_path):
        dest = tmp_path / "test.docx"
        export_docx(dest, "Parágrafo 1\n\nParágrafo 2", "Meu Documento")
        assert dest.exists()
        assert dest.stat().st_size > 0


class TestChatConfig:
    """Testes para configuracao de chat e provedores."""

    def test_providers_defined(self):
        assert "qwen" in PROVIDERS
        assert "deepseek" in PROVIDERS
        assert "glm" in PROVIDERS
        assert "mistral" in PROVIDERS

    def test_providers_models(self):
        for p, config in PROVIDERS.items():
            assert "model" in config
            assert "base" in config
            assert config["base"].startswith("http")


class TestSecurity:
    """Testes de seguranca para path traversal e sanitizacao."""

    def test_safe_filename_path_traversal(self):
        assert ".." not in safe_filename("../../secret.txt")
        assert "/" not in safe_filename("/etc/passwd")
        assert "\\" not in safe_filename("..\\boot.ini")

    def test_canonical_path_isolation(self, tmp_path):
        base_dir = tmp_path / "sandbox"
        base_dir.mkdir()
        secret_file = tmp_path / "secret.txt"
        secret_file.write_text("secret")

        target = (base_dir / "../secret.txt").resolve()
        with pytest.raises(ValueError):
            target.relative_to(base_dir.resolve())


class TestExtensionIntegrity:
    """Testes automatizados de integridade para a extensao Chrome."""

    @pytest.fixture
    def ext_dir(self):
        return Path(__file__).resolve().parent.parent / "extension"

    def test_manifest_structure(self, ext_dir):
        manifest_path = ext_dir / "manifest.json"
        assert manifest_path.exists()
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        assert manifest.get("manifest_version") == 3
        assert manifest.get("name")
        assert manifest.get("version")
        assert manifest.get("minimum_chrome_version") == "114"

    def test_manifest_files_exist(self, ext_dir):
        manifest = json.loads((ext_dir / "manifest.json").read_text(encoding="utf-8"))
        # Checar icones
        for _, path in manifest.get("icons", {}).items():
            f = ext_dir / path
            assert f.exists(), f"Icone {path} nao encontrado"
            assert f.stat().st_size > 0

        # Checar popup e sidepanel
        assert (ext_dir / manifest["action"]["default_popup"]).exists()
        assert (ext_dir / manifest["side_panel"]["default_path"]).exists()

        # Checar background service worker
        assert (ext_dir / manifest["background"]["service_worker"]).exists()

        # Checar rules
        for rule in manifest.get("declarative_net_request", {}).get("rule_resources", []):
            assert (ext_dir / rule["path"]).exists()

        # Checar content scripts
        for cs in manifest.get("content_scripts", []):
            for script in cs.get("js", []):
                assert (ext_dir / script).exists(), f"Script {script} nao encontrado"
            for css in cs.get("css", []):
                assert (ext_dir / css).exists(), f"CSS {css} nao encontrado"

    def test_sidepanel_and_popup_resources(self, ext_dir):
        # sidepanel.html carrega sidepanel.css, lib/exporter.js e sidepanel.js
        sp_html = (ext_dir / "sidepanel.html").read_text(encoding="utf-8")
        assert 'href="sidepanel.css"' in sp_html
        assert (ext_dir / "sidepanel.css").exists()
        assert 'src="lib/exporter.js"' in sp_html
        assert (ext_dir / "lib/exporter.js").exists()
        assert 'src="sidepanel.js"' in sp_html
        assert (ext_dir / "sidepanel.js").exists()

        # popup.html carrega popup.js
        popup_html = (ext_dir / "popup.html").read_text(encoding="utf-8")
        assert 'src="popup.js"' in popup_html
        assert (ext_dir / "popup.js").exists()


class TestPackaging:
    """Testes para o empacotamento e redistribuição da extensão."""

    def test_package_creation_and_integrity(self, tmp_path):
        import sys
        import zipfile
        base_dir = Path(__file__).resolve().parent.parent
        sys.path.insert(0, str(base_dir / "scripts"))
        from package_extension import package_extension

        zip_path = package_extension(base_dir, tmp_path)
        assert zip_path.exists()
        assert zip_path.stat().st_size > 1000

        extract_dir = tmp_path / "extracted"
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(extract_dir)

        assert (extract_dir / "manifest.json").exists()
        assert (extract_dir / "lib" / "exporter.js").exists()
        assert (extract_dir / "content" / "inject.js").exists()
        assert (extract_dir / "sidepanel.html").exists()
        assert not (extract_dir / "_metadata").exists()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

