# D Hotels & Apartments — цифровая платформа гостя

Монорепозиторий платформы для гостей сети D Hotels & Apartments (СПб, РФ):
веб-личный кабинет и booking engine, мобильные приложения, программа лояльности,
онлайн-регистрация и цифровой ключ TTLock. Полное ТЗ и правила — в [CLAUDE.md](./CLAUDE.md),
план реализации — в `~/.claude/plans`.

## Стек

- **Backend:** NestJS (Node.js, TypeScript) — ядро + прокси ко всем интеграциям.
- **Web / Admin:** Next.js (React).
- **Mobile:** React Native (Expo + dev client) — этап 2.
- **БД/инфра:** PostgreSQL, Redis, S3 Object Storage — Yandex Cloud (РФ, 152-ФЗ).
- **PMS:** собственный (Путь B / DHP) — PMS, Booking/Rate Engine, Channel Manager в `apps/api`.
  Bnovo — опциональный импорт/легаси. **Платежи:** YooKassa (54-ФЗ). **CRM:** Bitrix24. **Ключ:** TTLock.
- **Путь B (собственный PMS):** как поднять и прокликать под каждой ролью — [DHP.md](./DHP.md).

## Структура

```
apps/
  api/      NestJS backend (ядро + интеграции)
  web/      Next.js — личный кабинет + booking engine
  admin/    Next.js — административная панель
  mobile/   React Native (этап 2)
packages/
  domain/     доменные типы, enums, бизнес-правила (лояльность, ключ, брони)
  api-client/ типизированный клиент к API
  ui/         дизайн-система (бренд-токены) и общие компоненты
  config/     общие tsconfig / eslint / prettier
infra/        Terraform (Yandex Cloud), Docker, CI/CD
```

## Команды

Менеджер пакетов — pnpm 9 (через `corepack pnpm` либо установленный `pnpm`).

```bash
corepack pnpm install      # установка зависимостей всего workspace
corepack pnpm dev          # запуск всех приложений в dev-режиме
corepack pnpm build        # сборка
corepack pnpm lint         # линтинг
corepack pnpm test         # тесты
corepack pnpm typecheck    # проверка типов
```

## Принципы

- Клиенты **никогда** не обращаются к Bnovo/Bitrix24/TTLock напрямую — только через `apps/api`.
- Источники истины: номерной фонд/доступность/тарифы/брони → **собственный PMS (Путь B)**;
  лояльность → backend; коммуникации → Bitrix24. Bnovo — опциональный импорт/легаси.
- ПДн и сканы документов — только в инфраструктуре РФ, с шифрованием и логом доступа (152-ФЗ).
