# AI Hub Local

Servidor Python em `http://127.0.0.1:8765` com memoria, proxy API e exportacao DOCX / XLSX / PDF / codigo.

```bash
cd local
pip install -r ../requirements.txt
python3 server.py
```

Abre http://127.0.0.1:8765

A extensao Chrome em `../extension` envia Chat → DOCX/PDF/XLSX para `POST /api/export`.
