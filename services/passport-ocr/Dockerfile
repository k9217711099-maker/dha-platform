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

EXPOSE 8077
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8077", "--workers", "2"]
