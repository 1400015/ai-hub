# Dockerfile para AI Hub Local Server
# Versao: 1.2.0

FROM python:3.11-slim as base

WORKDIR /app

# Instala dependencias do sistema
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copia requirements primeiro para cache de camadas
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copia codigo da aplicacao
COPY local/ ./local/

# Cria directorias para dados e exports
RUN mkdir -p /app/local/data /app/local/exports && chmod 755 /app/local/data /app/local/exports

# Expoe porta default
EXPOSE 8765

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8765/api/health')" || exit 1

# Comando para iniciar o servidor
CMD ["python", "local/server.py"]


# Stage de desenvolvimento (opcional)
FROM base as dev

# Instala ferramentas de desenvolvimento
RUN pip install pytest pytest-cov flake8 black

# Mount de volume para desenvolvimento
VOLUME ["/app/local/data", "/app/local/exports"]

# Porta para debug
ENV PYTHONDEBUG=1

CMD ["python", "local/server.py"]
