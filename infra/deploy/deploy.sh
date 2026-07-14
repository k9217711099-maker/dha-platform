#!/usr/bin/env bash
# Деплой D H&A на сервере. Запускается GitHub Actions по SSH (или вручную).
# Использование: bash infra/deploy/deploy.sh <ветка>
#   staging-сервер получает ветку develop, production-сервер — main.
set -euo pipefail

BRANCH="${1:-main}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

echo "==> Деплой ветки '$BRANCH' в $REPO_ROOT"

# 1. Свежий код из репозитория (жёстко под удалённую ветку).
# ВАЖНО: fetch ИМЕННО из origin по ветке — падает non-zero, если GitHub недоступен
# (в отличие от `git fetch --all`, который глотает ошибку remote и возвращает 0 →
# деплой раньше «успешно» пересобирал старый код). checkout -B форс-переводит
# локальную ветку на origin (устойчиво к detached HEAD / разошедшейся ветке).
git fetch origin "$BRANCH" --prune
git checkout -B "$BRANCH" "origin/$BRANCH"
git reset --hard "origin/$BRANCH"
echo "==> Код на коммите: $(git rev-parse --short HEAD) $(git log -1 --pretty=%s)"

# 2. Зависимости строго по lock-файлу
corepack enable
pnpm install --frozen-lockfile

# 3. Prisma: генерируем клиент и синхронизируем схему с БД
pnpm --filter @dha/api prisma:generate
pnpm --filter @dha/api exec prisma db push --accept-data-loss

# 3b. Публичный адрес API для сборки фронта.
# ВАЖНО: NEXT_PUBLIC_* запекается в бандл на этапе build (а не в рантайме pm2),
# поэтому web/admin надо собирать с реальным адресом API. Иначе браузер гостя
# стучится в дефолтный localhost:3001 → "Load failed". Переопределяется на сервере
# переменной PUBLIC_API_URL (напр. когда появится домен/https).
if [ "$BRANCH" = "main" ]; then
  API_URL="${PUBLIC_API_URL:-http://83.166.247.226:3001/api}"
else
  API_URL="${PUBLIC_API_URL:-http://localhost:3001/api}"
fi
# Обновляем ТОЛЬКО ключ NEXT_PUBLIC_API_URL, не трогая прочие (Яндекс.Карты/Метрика).
upsert_env() { # <файл> <КЛЮЧ> <значение>
  local file="$1" key="$2" val="$3"
  touch "$file"
  if grep -q "^${key}=" "$file"; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$file"
  else
    printf '%s=%s\n' "$key" "$val" >> "$file"
  fi
}
upsert_env apps/web/.env.local   NEXT_PUBLIC_API_URL "$API_URL"
upsert_env apps/admin/.env.local NEXT_PUBLIC_API_URL "$API_URL"
# Экспортируем в окружение сборки: turbo включает значение в ключ кэша (объявлено в
# turbo.json → env), Next встраивает его в бандл. Иначе turbo отдаёт старую сборку.
export NEXT_PUBLIC_API_URL="$API_URL"
echo "==> NEXT_PUBLIC_API_URL=$API_URL (web + admin)"

# 4. Сборка (turbo соблюдает порядок: пакеты → apps).
# TURBO_FORCE + чистка .next: гарантируем пересборку фронта на деплое (не полагаемся
# на кэш turbo — при смене адреса API кэш мог отдать старый бандл). Для деплоя
# корректность важнее скорости.
export TURBO_FORCE=true
rm -rf apps/web/.next apps/admin/.next
pnpm build

# 5. Перезапуск процессов (startOrReload — поднимет, если ещё не запущены)
pm2 startOrReload infra/deploy/ecosystem.config.js --update-env
pm2 save

echo "==> Готово: api :3001 · web :3000 · admin :3002"
