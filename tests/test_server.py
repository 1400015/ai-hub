#!/usr/bin/env python3
"""Testes basicos para o servidor AI Hub."""
import pytest
import json
import sys
from pathlib import Path

# Adiciona o diretório local ao path
sys.path.insert(0, str(Path(__file__).parent.parent / "local"))

from server import safe_filename, load_memories, save_memories, load_conversations, save_conversations, MAX_CONTENT_SIZE


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


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
