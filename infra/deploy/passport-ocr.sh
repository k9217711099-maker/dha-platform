#!/usr/bin/env bash
# Поднимает self-hosted OCR-сайдкар паспорта (services/passport-ocr) И, если он
# реально стал здоров, САМ включает распознавание: пишет PASSPORT_PROVIDER=http в
# apps/api/.env и перезапускает dha-api. Так «включай OCR» = один флаг, а не ручные
# правки на сервере.
#
# ГЛАВНОЕ ПРАВИЛО: никогда не роняет основной деплой — нет `set -e`, каждый шаг
# завершает скрипт кодом 0, а вызов в deploy.yml обёрнут в `|| true`.
#
# Условия включения:
#   PASSPORT_OCR_ENABLE=1 (задаётся в deploy.yml) И на сервере есть docker.
# Нет docker / сайдкар не поднялся → провайдер НЕ трогаем (остаётся текущий, обычно
# mock — гость заполняет поля вручную), в лог пишем причину. Никакой деградации UX.
#
# Образ пересобирается только при изменении исходников сайдкара (по хэшу).
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="$REPO_ROOT/apps/api/.env"
DIR="$REPO_ROOT/services/passport-ocr"
IMAGE="dha-passport-ocr"
NAME="dha-passport-ocr"
PORT="${PASSPORT_OCR_PORT:-8077}"

if [ "${PASSPORT_OCR_ENABLE:-0}" != "1" ]; then
  echo "==> passport-ocr: выключен (PASSPORT_OCR_ENABLE!=1) — пропуск"
  exit 0
fi
if ! command -v docker >/dev/null 2>&1; then
  echo "!! passport-ocr: docker не найден — OCR НЕ включён (остаётся текущий провайдер). Поставьте docker на сервере."
  exit 0
fi

# Пересборка только при изменении исходников (метка src_hash на образе).
HASH="$( { cat "$DIR/app.py" "$DIR/requirements.txt" "$DIR/Dockerfile" 2>/dev/null | sha1sum 2>/dev/null || true; } | awk '{print $1}')"
CUR="$(docker image inspect "$IMAGE" --format '{{ index .Config.Labels "src_hash" }}' 2>/dev/null || true)"
RECREATE=1
if [ -z "$CUR" ] || [ "$HASH" != "$CUR" ]; then
  echo "==> passport-ocr: сборка образа (Tesseract; apt/pip через зеркала — 1–2 минуты)"
  if ! docker build --label "src_hash=$HASH" -t "$IMAGE" "$DIR"; then
    echo "!! passport-ocr: сборка не удалась — OCR не включаем, деплой продолжаем"
    exit 0
  fi
else
  echo "==> passport-ocr: образ актуален ($HASH) — без пересборки"
  # Образ не менялся и контейнер уже поднят и здоров → НЕ пересоздаём. Пересоздание =
  # холодный старт, который может не уложиться в окно health и оставить провайдер на mock.
  if docker ps --filter "name=^${NAME}$" --filter status=running -q | grep -q . \
     && curl -fsS "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
    RECREATE=0
    echo "==> passport-ocr: контейнер уже поднят и здоров — переиспользуем без рестарта"
  fi
fi

if [ "$RECREATE" = "1" ]; then
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  if ! docker run -d --restart=unless-stopped --name "$NAME" -p "127.0.0.1:${PORT}:8077" "$IMAGE"; then
    echo "!! passport-ocr: запуск контейнера не удался — OCR не включаем, деплой продолжаем"
    exit 0
  fi
fi

# Ждём здоровья до ~90 c: холодный старт (uvicorn + импорт pytesseract/PIL, 2 воркера)
# может превышать минуту — иначе авто-включение не успевает и провайдер остаётся mock.
HEALTHY=0
for _ in $(seq 1 45); do
  if curl -fsS "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then HEALTHY=1; break; fi
  sleep 2
done
if [ "$HEALTHY" != "1" ]; then
  echo "!! passport-ocr: сайдкар не ответил на /health — OCR не включаем (провайдер без изменений)"
  exit 0
fi
echo "==> passport-ocr: healthy на 127.0.0.1:${PORT}"

# Сайдкар жив → включаем распознавание, если ещё не включено.
CURPROV="$(grep -E '^PASSPORT_PROVIDER=' "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"'\'' ')"
if [ "$CURPROV" = "http" ]; then
  echo "==> passport-ocr: распознавание уже включено (PASSPORT_PROVIDER=http)"
  exit 0
fi
touch "$ENV_FILE"
if grep -qE '^PASSPORT_PROVIDER=' "$ENV_FILE"; then
  sed -i 's|^PASSPORT_PROVIDER=.*|PASSPORT_PROVIDER=http|' "$ENV_FILE"
else
  printf 'PASSPORT_PROVIDER=%s\n' http >> "$ENV_FILE"
fi
# Задаём адрес сайдкара, если не задан (по умолчанию совпадает с портом контейнера).
if ! grep -qE '^PASSPORT_OCR_URL=' "$ENV_FILE"; then
  printf 'PASSPORT_OCR_URL=%s\n' "http://127.0.0.1:${PORT}" >> "$ENV_FILE"
fi
echo "==> passport-ocr: PASSPORT_PROVIDER=http записан — перезапускаю dha-api"
pm2 restart dha-api --update-env >/dev/null 2>&1 || true
echo "==> passport-ocr: OCR включён. Для проверки МВД добавьте DADATA_API_KEY/DADATA_SECRET в apps/api/.env."
exit 0
