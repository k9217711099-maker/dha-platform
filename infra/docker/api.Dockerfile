# Многостадийная сборка backend (apps/api) из монорепозитория.
# Контекст сборки — корень репозитория: docker build -f infra/docker/api.Dockerfile .

FROM node:22-slim AS base
RUN corepack enable
WORKDIR /repo

# --- Зависимости (кэшируется по манифестам) ---
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc ./
COPY packages/config/package.json packages/config/
COPY packages/domain/package.json packages/domain/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile

# --- Сборка ---
FROM deps AS build
COPY . .
RUN pnpm --filter @dha/domain build \
  && pnpm --filter @dha/api prisma:generate \
  && pnpm --filter @dha/api build \
  && pnpm --filter @dha/api --prod deploy /app

# --- Рантайм ---
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app ./
EXPOSE 3001
CMD ["node", "dist/main.js"]
