# Gerador das falas locais (scripts/generate-voices.ps1). Roda isolado: lê o catálogo e grava só em /saida.
FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends espeak-ng ffmpeg && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir "kokoro==0.9.4" soundfile==0.13.1
ENV HF_HOME=/cache
WORKDIR /work
