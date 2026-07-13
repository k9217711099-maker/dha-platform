#!/usr/bin/env bash
# Деплой D H&A на сервере. Запускается GitHub Actions по SSH (или вручную).
# Использование: bash infra/deploy/deploy.sh <ветка>
#   staging-сервер получает ветку develop, production-сервер — main.
set -euo pipefail

BRANCH="${1:-main}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

echo "==> Деплой ветки '$BRANCH' в $REPO_ROOT"

# 1. Свежий код из репозитория (жёстко под удалённую ветку)
git fetch --all --prune
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"

# 2. Зависимости строго по lock-файлу
corepack enable
pnpm install --frozen-lockfile

# 3. Prisma: клиент + миграции БД (deploy — безопасный прод-режим, без потери данных)
pnpm --filter @dha/api prisma:generate
pnpm --filter @dha/api prisma:deploy

# 4. Сборка всех веб-приложений
pnpm --filter @dha/api build
pnpm --filter @dha/web build
pnpm --filter @dha/admin build

# 5. Перезапуск процессов (startOrReload — поднимет, если ещё не запущены)
pm2 startOrReload infra/deploy/ecosystem.config.js --update-env
pm2 save

echo "==> Готово: api :3001 · web :3000 · admin :3002"
