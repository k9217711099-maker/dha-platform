# Путь B — собственный PMS (D Hospitality Platform)

Демо-runbook: как поднять ядро **Пути B** локально и прокликать под каждой ролью.
Путь B — это собственные **PMS, Booking Engine, Rate Engine и Channel Manager** внутри
[apps/api](apps/api): бронями, доступностью, тарифами и гостями владеет наша система, а не Bnovo.
Требования — [CLAUDE.md](CLAUDE.md), спека-референс — [DHP-claude-code-start/](DHP-claude-code-start/).

## Что где живёт

```
Гость / OTA / админ → apps/api (ядро DHP)
   apps/api/src/pms/rooms         Номерной фонд (юниты Room + статусы)
   apps/api/src/pms/availability  Доступность, инвентарные локи, блокировки — анти-овербукинг
   apps/api/src/pms/rates         Тарифы, цены, ограничения, расчёт quote (Rate Engine)
   apps/api/src/pms/bookings      Брони PMS: create (Idempotency-Key) + lifecycle
   apps/api/src/ops               Задачи и Уборка (TASKS-HOUSEKEEPING-TZ, Operations 2.0 по TeamJet)
   apps/api/src/booking-engine    Гостевой флоу: search → quote → бронь → оплата
   apps/api/src/channel           Channel Manager: каналы, маппинги, синк-джобы, приём OTA
admin (Next.js)  apps/admin/src/app/pms/*   Бронирования, Шахматка, Тарифы, Каналы
                 apps/admin/src/app/ops/*   Задачи, План уборок, Чек-листы, Отчёты, Настройки, Мои задачи
```

Клиенты (web/mobile/admin) **никогда** не ходят в Bnovo/Bitrix24/TTLock напрямую — только через `apps/api`.

## Как поднять локально (без Docker)

БД — встроенный Postgres на `localhost:5433` (данные в `apps/api/.pgdata`, кластер `postgres/password`,
база `dha`). Четыре терминала из корня репозитория:

```bash
# 0. один раз — зависимости
corepack pnpm install

# 1. БД (держать запущенным)
node apps/api/scripts/dev-db.mjs

# 2. схема + демо-данные (во второй терминал, разово или после изменений схемы)
cd apps/api
corepack pnpm exec prisma generate
corepack pnpm exec prisma db push          # применить схему на дев-БД
corepack pnpm exec prisma db seed          # арендатор, роли, демо-объект, тарифы, СЦЕНАРИИ

# 3. API (:3001)
corepack pnpm --filter @dha/api build && node apps/api/dist/main.js
#   dev-режим с автоперезапуском: corepack pnpm --filter @dha/api dev

# 4. Админка (:3002)
corepack pnpm --filter @dha/admin dev
```

Открыть админку: <http://localhost:3002> → войти. Swagger по API: <http://localhost:3001/api/docs>.

## Учётные записи (роли DHP §5)

Все создаются сидом ([apps/api/prisma/seed.ts](apps/api/prisma/seed.ts)). Пароли — демо, только для дева.

| Роль | Логин | Пароль | Видит в PMS |
| --- | --- | --- | --- |
| Суперадмин | `admin@dha.local` | `admin12345` | всё |
| Владелец / Управляющий | `owner@dha.local` | `owner12345` | весь контур PMS |
| General Manager | `gm@dha.local` | `gm12345` | брони, доступность, фонд, задачи/уборка (без тарифов/каналов) |
| Front Desk | `frontdesk@dha.local` | `front12345` | брони, доступность, фонд |
| Revenue Manager | `revenue@dha.local` | `rev12345` | тарифы, доступность, каналы, категории |
| Housekeeping Supervisor | `hk@dha.local` | `hk12345` | задачи группы, план уборок, инспекция, чек-листы, отчёты |
| Инженер (Maintenance) | `pmsengineer@dha.local` | `eng12345` | задачи группы (инженерные), фонд |

Матрица прав — [apps/api/src/admin/permissions.ts](apps/api/src/admin/permissions.ts) (`DEFAULT_ROLES`).
Сайдбар и страницы гейтятся по `pms_*`/`ops_*`-правам, поэтому у каждой роли — только свои разделы.

## Что кладёт сид (демо-сценарии)

- Объект **«Апартаменты на Рубинштейна»**, категория «Апартаменты с одной спальней», 4 номера (101/102/201/202).
- Тарифы: **Гибкий** (8000 ₽/ночь, год вперёд) + производный **Невозвратный** (−10% → 7200 ₽).
- Ограничение: **min-stay 2** на дату-пятницу (демонстрация 422 в quote при 1 ночи).
- Канал **Ostrovok** (mock) + маппинги объекта/категории/тарифа; готов к синку и приёму OTA-броней.
- Демо-гость `guest.demo@dha.local` и брони во всех 4 состояниях раздела «Мои бронирования»:
  текущая (CHECKED_IN), предстоящая (CONFIRMED), прошлая (CHECKED_OUT), отменённая (CANCELLED).
- Задачи и Уборка: пресеты типов уборок (Выездная/Текущая/Жилая), правило «сегодня выезд → Выездная»,
  демо-уборка (№201) и закрытая инженерная задача (№202).

Сид идемпотентный — повторный запуск не плодит дубли.

## Прокликать под каждой ролью

- **Owner / GM** → `PMS · Бронирования`: карточка брони, lifecycle (подтвердить/заезд/выезд/отмена/no-show).
  `PMS · Шахматка`: сетка номера×даты, занятость и блокировки. На выезде в `Операции · Задачи`
  автоматически появляется уборка «Выездная», номер становится `DIRTY`.
- **Revenue Manager** → `PMS · Тарифы и цены`: календарь цен, правка цены базового тарифа (производный
  пересчитывается −10%), ограничения (min-stay/stop-sell/CTA/CTD). `PMS · Каналы`: канал Ostrovok, маппинги,
  кнопка синка, журнал синк-джобов и логов.
- **Front Desk** → `PMS · Бронирования` (создать/найти), `PMS · Шахматка`. Тарифы/каналы ему недоступны
  (нет `pms_rates`/`pms_channels`) — пункты скрыты, а API вернёт 403.
- **Housekeeping Supervisor** → `Операции · План уборок`: «Сгенерировать по правилам», распределение
  drag&drop или автораспределение, «Отправить задания». `Операции · Задачи` (таб «Уборки»): статусы
  Новая → Принята → В работе → Сделана (номер `CLEAN`), «Проверено (инспекция)» → `INSPECTED`;
  чек-листы блокируют завершение. `Операции · Отчёты`: факт vs норматив, ошибки чек-листов.
- **Инженер** → `Операции · Задачи`: инженерная задача с «снять с продажи» → номер `OUT_OF_ORDER`
  (выбывает из доступности), «Сделана» → номер снова в продаже.
- **Горничная** (роль «Операции · Горничная») → `Операции · Мои задачи` (mobile-first): переключатель
  «В смене», крупные кнопки статусов, чек-листы с фото-подтверждениями.

## Контракт DHP ↔ наши маршруты

Референс-контракт — [DHP-claude-code-start/openapi/dhp-mvp.openapi.yaml](DHP-claude-code-start/openapi/dhp-mvp.openapi.yaml)
(база `/api/v1`). Живой контракт — Swagger `/api/docs`. Соответствие:

| DHP контракт | Наш маршрут | Где |
| --- | --- | --- |
| `GET /health` | `GET /api/health` | [health.controller.ts](apps/api/src/health/health.controller.ts) |
| `GET/POST /rooms` | `/api/v1/rooms` | [rooms.controller.ts](apps/api/src/pms/rooms/rooms.controller.ts) |
| `GET/POST /bookings` | `/api/v1/bookings` (+ `Idempotency-Key`) | [pms-bookings.controller.ts](apps/api/src/pms/bookings/pms-bookings.controller.ts) |
| `GET /availability/search` | `GET /api/v1/availability/search` | [availability.controller.ts](apps/api/src/pms/availability/availability.controller.ts) |
| `GET /rates/quote` | `GET /api/v1/rates/quote` | [rates.controller.ts](apps/api/src/pms/rates/rates.controller.ts) |
| `POST /channel-bookings` | `POST /api/v1/channels/:id/ingest/booking` (токен канала) | [channel-ingestion.controller.ts](apps/api/src/channel/channel-ingestion.controller.ts) |

Отклонения согласованы (см. [CLAUDE.md](CLAUDE.md)): приём OTA — per-channel с токеном вместо одного
`/channel-bookings`; `/properties` и `/room-types` — под гостевым каталогом `/api/*`, PMS их эволюционирует.

## Обязательные правила DHP ↔ где обеспечены

| # | Правило | Где |
| --- | --- | --- |
| 1 | Овербукинг невозможен (`SELECT … FOR UPDATE` + peak-night) | [availability.service.ts](apps/api/src/pms/availability/availability.service.ts) |
| 2 | `Idempotency-Key` обязателен для POST брони | [idempotency.service.ts](apps/api/src/pms/bookings/idempotency.service.ts), контроллеры броней |
| 3–4 | Итоговая доступность — только в PG-транзакции | `assertAndLockForBooking` в [availability.service.ts](apps/api/src/pms/availability/availability.service.ts) |
| 5 | Дата выезда ночь не занимает | [availability.util.ts](apps/api/src/pms/availability/availability.util.ts) (`[from, to)`) |
| 6 | Инвентарный лок авто-истекает (TTL) | [availability.scheduler.ts](apps/api/src/pms/availability/availability.scheduler.ts) |
| 7 | Критичные изменения → audit log (с `tenantId`) | сервисы PMS/операций через `AuditService` |
| 8 | Сбой синка канала не ломает создание брони | `enqueueForProperty` (fire-and-forget) в [channel-sync.service.ts](apps/api/src/channel/channel-sync.service.ts) |
| 9 | Синк на джобах с ретраями/dead-letter | [channel-sync.service.ts](apps/api/src/channel/channel-sync.service.ts) |
| 10 | Дедуп OTA по `channel_id + external_booking_id` | [channel-ingestion.service.ts](apps/api/src/channel/channel-ingestion.service.ts) + `@@unique` |
| 11–12 | Цену считает Rate Engine и пересчитывает перед бронью | [rate.service.ts](apps/api/src/pms/rates/rate.service.ts), [booking-engine.service.ts](apps/api/src/booking-engine/booking-engine.service.ts) |
| 13 | Техблок номера уменьшает доступность | `maintenanceStatus=OUT_OF_ORDER` в [maintenance.service.ts](apps/api/src/pms/operations/maintenance.service.ts) |
| 14 | Check-out создаёт задачу уборки | `checkOut` в [pms-booking.service.ts](apps/api/src/pms/bookings/pms-booking.service.ts) |
| 15 | Адаптеры каналов создают брони только через BookingService | [channel-ingestion.service.ts](apps/api/src/channel/channel-ingestion.service.ts) |

## Автопроверка

```bash
# юнит-тесты API (vitest)
corepack pnpm --filter @dha/api exec vitest run

# сквозной E2E по всему Пути B на живом стеке (нужны БД + API :3001)
node apps/api/scripts/e2e-dhp.mjs
```

`e2e-dhp.mjs` — единый прогон: health → логин → доступность → quote → бронь (идемпотентно) →
анти-овербукинг (409) → ограничение (422 с кодом) → гостевой флоу с оплатой (webhook → CONFIRMED) →
канал (синк с ретраем/dead-letter, приём OTA + дедуп) → операции (выезд → задача уборки; техблок → −1
к доступности → закрытие). Печатает PASS/FAIL по шагам, ненулевой код выхода при любом провале.
