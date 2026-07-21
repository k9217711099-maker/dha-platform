# OCR-сайдкар для распознавания паспорта (self-hosted, 152-ФЗ).
# Слушает :8077, ходит только внутри сервера (за nginx НЕ публикуем).
FROM python:3.11-slim

# Системные зависимости PaddleOCR/OpenCV.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Прогреваем модели в образ, чтобы первый запрос не качал их (модели РФ/лат.).
RUN python -c "from paddleocr import PaddleOCR; PaddleOCR(use_angle_cls=True, lang='ru', show_log=False)"

COPY app.py .

EXPOSE 8077
# 1 воркер: модель тяжёлая, держим один инстанс; масштабируем репликами при нужде.
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8077", "--workers", "1"]
