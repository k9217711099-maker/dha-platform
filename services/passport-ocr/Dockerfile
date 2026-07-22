# OCR-сайдкар распознавания паспорта (self-hosted, 152-ФЗ). Движок Tesseract —
# лёгкий, работает на VPS. Слушает :8077 локально (за nginx НЕ публикуем).
FROM python:3.11-slim

# deb.debian.org (CDN fastly) недоступен с сервера в РФ — apt через зеркало Яндекса
# (поддержка deb822 /etc/apt/sources.list.d/debian.sources и классического sources.list).
RUN sed -i 's|http://deb.debian.org|http://mirror.yandex.ru|g; s|https://deb.debian.org|http://mirror.yandex.ru|g; s|http://security.debian.org|http://mirror.yandex.ru|g; s|https://security.debian.org|http://mirror.yandex.ru|g' \
      /etc/apt/sources.list.d/debian.sources /etc/apt/sources.list 2>/dev/null || true; \
    apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr tesseract-ocr-rus \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir --retries 5 --timeout 120 -r requirements.txt

COPY app.py .

# Один поток OCR (OpenMP) — чтобы одно распознавание не захватывало оба ядра VPS.
ENV OMP_THREAD_LIMIT=1

EXPOSE 8077
# 1 воркер: на 2-ядерном VPS без swap это сериализует распознавания и не даёт
# нескольким OCR разом задушить сервер (лимиты CPU/RAM ещё и в docker run).
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8077", "--workers", "1"]
