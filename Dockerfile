# Dockerfile para AI Hub Local Server
# Versao: 1.3.0

FROM python:3.11-slim AS base

WORKDIR /app

# Variaveis de ambiente para o servidor
ENV HOST=0.0.0.0 \
    PORT=8765 \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Instala dependencias do sistema
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copia requirements primeiro para cache de camadas
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copia codigo da aplicacao
COPY local/ ./local/

# Cria utilizador sem privilégios e directorias para dados e exports
RUN useradd -m -u 1000 appuser \
    && mkdir -p /app/local/data /app/local/exports \
    && chown -R appuser:appuser /app

USER appuser

# Expoe porta default
EXPOSE 8765

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8765/api/health')" || exit 1

# Comando para iniciar o servidor
CMD ["python", "local/server.py"]


# Stage de desenvolvimento (opcional)
FROM base AS dev

USER root
# Instala ferramentas de desenvolvimento
RUN pip install --no-cache-dir pytest pytest-cov flake8 black

USER appuser

# Mount de volume para desenvolvimento
VOLUME ["/app/local/data", "/app/local/exports"]

ENV PYTHONFAULTHANDLER=1

CMD ["python", "local/server.py"]
