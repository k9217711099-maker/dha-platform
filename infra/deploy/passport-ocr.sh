#!/usr/bin/env bash
# Идемпотентно поднимает self-hosted OCR-сайдкар паспорта (services/passport-ocr).
#
# Запускается из deploy.yml ПОСЛЕ основного деплоя. ГЛАВНОЕ ПРАВИЛО: никогда не
# роняет основной деплой — нет `set -e`, каждый рискованный шаг завершает скрипт
# с кодом 0 (`exit 0`), а вызов в deploy.yml обёрнут в `|| true`.
#
# Поднимается ТОЛЬКО когда OCR реально используется, т.е. в apps/api/.env стоит
# PASSPORT_PROVIDER=http (или явно задан PASSPORT_OCR_ENABLE=1) И на сервере есть
# docker. По умолчанию (mock) — тихий пропуск, ноль влияния на прод.
#
# Образ пересобирается только при изменении исходников сайдкара (по хэшу) — обычный
# деплой его не трогает. Контейнер слушает только 127.0.0.1 (наружу не публикуем).
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="$REPO_ROOT/apps/api/.env"
DIR="$REPO_ROOT/services/passport-ocr"
IMAGE="dha-passport-ocr"
NAME="dha-passport-ocr"
PORT="${PASSPORT_OCR_PORT:-8077}"

PROVIDER="$(grep -E '^PASSPORT_PROVIDER=' "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"'\'' ')"
if [ "${PASSPORT_OCR_ENABLE:-0}" != "1" ] && [ "$PROVIDER" != "http" ]; then
  echo "==> passport-ocr: не используется (PASSPORT_PROVIDER='${PROVIDER:-mock}') — пропуск"
  exit 0
fi
if ! command -v docker >/dev/null 2>&1; then
  echo "==> passport-ocr: docker не найден — пропуск. Поставьте docker или поднимите сайдкар вручную (services/passport-ocr/README.md)."
  exit 0
fi

# Пересборка только при изменении исходников (метка src_hash на образе).
HASH="$( { cat "$DIR/app.py" "$DIR/requirements.txt" "$DIR/Dockerfile" 2>/dev/null | sha1sum 2>/dev/null || true; } | awk '{print $1}')"
CUR="$(docker image inspect "$IMAGE" --format '{{ index .Config.Labels "src_hash" }}' 2>/dev/null || true)"
if [ -z "$CUR" ] || [ "$HASH" != "$CUR" ]; then
  echo "==> passport-ocr: сборка образа (первый раз тянет модели PaddleOCR — несколько минут)"
  if ! docker build --label "src_hash=$HASH" -t "$IMAGE" "$DIR"; then
    echo "!! passport-ocr: сборка не удалась — деплой продолжаем без OCR"
    exit 0
  fi
else
  echo "==> passport-ocr: образ актуален ($HASH) — без пересборки"
fi

docker rm -f "$NAME" >/dev/null 2>&1 || true
if ! docker run -d --restart=unless-stopped --name "$NAME" -p "127.0.0.1:${PORT}:8077" "$IMAGE"; then
  echo "!! passport-ocr: запуск контейнера не удался — деплой продолжаем без OCR"
  exit 0
fi

# Мягкая проверка здоровья (не фатально: модель может ещё грузиться).
sleep 3
if curl -fsS "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
  echo "==> passport-ocr: healthy на 127.0.0.1:${PORT}"
else
  echo "==> passport-ocr: /health пока молчит (модель грузится) — проверьте через минуту"
fi
exit 0
