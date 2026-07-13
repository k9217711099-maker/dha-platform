# DHP MVP PMS + Channel Manager FULL SPEC

Сводный документ для передачи разработчикам на discovery и оценку.




---


# 000_MVP_Scope.md

# MVP Development Specification

## 1. Назначение документа

Документ определяет состав первой версии продукта D Hospitality Platform, достаточной для начала разработки и оценки проекта командой.

MVP не должен включать весь будущий enterprise-функционал. Его задача — создать работоспособное ядро:

- PMS Core;
- собственный Booking Engine;
- базовый Channel Manager;
- базовая программа лояльности;
- базовые платежи;
- интеграции с внешними сервисами;
- операционные модули housekeeping и maintenance в минимальном объеме.

## 2. Цель MVP

Создать систему, которая позволяет:

1. вести номерной фонд;
2. создавать и управлять бронированиями;
3. рассчитывать availability;
4. рассчитывать цены;
5. принимать прямые бронирования через собственный модуль;
6. создавать бронирования через API;
7. синхронизировать наличие и цены с каналами;
8. принимать бронирования из каналов;
9. исключать овербукинг;
10. вести гостей;
11. фиксировать оплаты;
12. создавать задачи уборки;
13. создавать инженерные заявки;
14. использовать базовую лояльность.

## 3. Что входит в MVP

### 3.1. PMS Core

Входит:

- объекты размещения;
- типы номеров;
- конкретные номера/апартаменты;
- статусы номеров;
- шахматка;
- бронирования;
- карточка брони;
- ручное создание брони;
- изменение брони;
- отмена брони;
- check-in;
- check-out;
- no-show;
- базовые гости;
- комментарии;
- история изменений.

### 3.2. Availability Engine

Входит:

- расчет доступности по room type;
- расчет доступности по конкретному room;
- inventory lock;
- блокировки номеров;
- out of order;
- пересчет после брони/отмены/изменения;
- защита от двойной продажи.

### 3.3. Rate Engine

Входит:

- тарифные планы;
- цены по датам;
- min stay;
- stop sell;
- closed to arrival;
- closed to departure;
- расчет цены брони;
- derived rate в базовом виде;
- скидка/промокод;
- списание баллов.

### 3.4. Booking Engine

Входит:

- поиск доступных вариантов;
- фильтры;
- карточка объекта/номера;
- выбор тарифа;
- расчет итоговой цены;
- применение промокода;
- списание баллов;
- создание брони через API;
- переход к оплате;
- подтверждение брони.

### 3.5. Channel Manager MVP

Входит:

- список каналов;
- подключение канала;
- OTA-маппинг;
- выгрузка availability;
- выгрузка rates;
- выгрузка restrictions;
- прием брони;
- прием отмены;
- журнал синхронизации;
- ручной retry;
- ошибки интеграций.

### 3.6. Loyalty MVP

Входит:

- аккаунт лояльности;
- баланс баллов;
- уровни Member/Silver/Gold/Platinum;
- начисление после выезда;
- списание при бронировании;
- возврат при отмене;
- ручная корректировка.

### 3.7. Finance MVP

Входит:

- счет брони;
- оплаты;
- платежный статус;
- баланс;
- возврат вручную;
- депозит как поле/операция;
- базовая интеграция с платежным провайдером.

### 3.8. Housekeeping MVP

Входит:

- статусы clean/dirty/inspected/in_progress;
- задача уборки после check-out;
- назначение исполнителя;
- чек-лист уборки;
- завершение уборки;
- приемка супервайзером.

### 3.9. Maintenance MVP

Входит:

- создание инженерной заявки;
- назначение исполнителя;
- приоритеты;
- статусы;
- фото;
- техническая блокировка номера;
- снятие блокировки.

### 3.10. Integrations MVP

Входит:

- Bitrix24: создание сделки/контакта/задачи;
- TTLock: создание PIN-кода;
- Email/SMS/push: подтверждение брони;
- внешние PMS/Channel adapters как архитектурная возможность.

## 4. Что НЕ входит в MVP

Не входит:

- полноценный AI Revenue Management;
- marketplace;
- plugin SDK;
- сложные корпоративные тарифы;
- динамическое ценообразование на базе ML;
- полноценная фискализация в первой итерации;
- сложная BI-платформа;
- мобильное приложение сотрудника в полном объеме;
- многоязычная админка;
- сложные цепочки согласований;
- собственная телефония;
- полноценный contact center.

## 5. Роли MVP

### Owner / Управляющий

- видит отчеты;
- управляет объектами;
- управляет пользователями;
- видит финансы;
- видит загрузку.

### General Manager

- видит все операционные процессы;
- управляет бронированиями;
- управляет задачами;
- контролирует сотрудников.

### Front Desk / Администратор

- создает брони;
- меняет статусы;
- работает с гостями;
- проводит заезд/выезд;
- видит платежи.

### Revenue Manager

- управляет тарифами;
- управляет ограничениями;
- видит загрузку;
- запускает синхронизацию с каналами.

### Housekeeping Supervisor

- видит задачи уборки;
- назначает горничных;
- принимает уборку;
- меняет статусы номеров.

### Maintenance Manager / Engineer

- видит инженерные заявки;
- меняет статусы;
- блокирует номера;
- добавляет фото/комментарии.

### Guest

- ищет номер;
- бронирует;
- оплачивает;
- проходит online check-in;
- использует баллы;
- получает подтверждение.

## 6. Основные экраны MVP

### Admin Web

- Dashboard;
- Шахматка;
- Бронирования;
- Карточка брони;
- Гости;
- Номерной фонд;
- Тарифы и ограничения;
- Channel Manager;
- Housekeeping;
- Maintenance;
- Payments;
- Loyalty;
- Users & Roles;
- Settings.

### Guest Web / Booking Engine

- поиск;
- список объектов;
- карточка объекта;
- выбор тарифа;
- корзина;
- авторизация/регистрация;
- применение баллов;
- оплата;
- подтверждение.

## 7. Основные API MVP

- POST /api/v1/bookings
- GET /api/v1/bookings
- GET /api/v1/bookings/{id}
- PATCH /api/v1/bookings/{id}
- POST /api/v1/bookings/{id}/cancel
- POST /api/v1/bookings/{id}/check-in
- POST /api/v1/bookings/{id}/check-out
- GET /api/v1/availability/search
- POST /api/v1/availability/lock
- POST /api/v1/availability/release
- GET /api/v1/rates/quote
- POST /api/v1/payments/intents
- POST /api/v1/loyalty/redeem
- POST /api/v1/channel-sync/jobs
- POST /api/v1/channel-bookings

## 8. Приоритет разработки

### Sprint Group 1: Platform Core

- auth;
- tenants;
- users;
- roles;
- properties;
- rooms;
- room types.

### Sprint Group 2: Booking Core

- bookings;
- availability;
- inventory lock;
- booking statuses;
- audit log.

### Sprint Group 3: Rates

- rate plans;
- prices;
- restrictions;
- price quote.

### Sprint Group 4: Admin UI

- dashboard;
- шахматка;
- booking card;
- rooms;
- rates.

### Sprint Group 5: Booking Engine

- search;
- quote;
- create booking;
- payment intent;
- confirmation.

### Sprint Group 6: Channel Manager

- mappings;
- inventory sync;
- rate sync;
- booking ingestion;
- sync logs.

### Sprint Group 7: Operations

- housekeeping;
- maintenance;
- TTLock;
- Bitrix24.

## 9. Definition of Done для MVP

MVP считается готовым, когда:

- можно создать объект и номерной фонд;
- можно задать тарифы и цены;
- можно найти доступный номер;
- можно создать бронь через API;
- можно создать бронь из админки;
- можно создать бронь из booking engine;
- availability пересчитывается;
- овербукинг предотвращается;
- шахматка отображает брони;
- можно заселить и выселить гостя;
- после выезда создается задача уборки;
- техническая блокировка влияет на availability;
- Channel Manager может выгрузить цены/наличие;
- Channel Manager может принять бронь;
- система логирует ошибки;
- есть базовые роли и права;
- есть базовые тесты.



---


# 000_Vision.md

# Видение D Hospitality Platform

## 1. Назначение

D Hospitality Platform — единая гостиничная платформа для управления апартаментами, мини-отелями, бутик-отелями и распределенными объектами размещения.

Платформа объединяет:

- PMS;
- Channel Manager;
- CRS;
- Booking Engine;
- программу лояльности;
- CRM;
- guest app;
- web cabinet;
- housekeeping;
- maintenance;
- finance;
- revenue management;
- analytics;
- AI;
- integrations.

## 2. Ключевая идея

PMS не является центром всей системы.

Центром является **Hospitality Platform**, которая владеет доменной логикой, гостевым профилем, бронированиями, лояльностью, событиями и API.

```text
Guest App / Website
        ↓
Booking Engine
        ↓
D Hospitality Platform
        ↓
PMS / Channel Manager / CRM / Loyalty / TTLock / AI / BI
```

## 3. Проблема рынка

На рынке много PMS и Channel Manager, но часто они:

- ограничивают внешний API;
- не дают создать бронь из собственного booking engine;
- плохо поддерживают программу лояльности;
- не дают гибко списывать баллы;
- не имеют единого профиля гостя;
- не являются AI-native;
- плохо подходят для распределенных апартаментов;
- требуют ручных процессов.

DHP должна решить эти проблемы.

## 4. Целевой сегмент

- управляющие компании апартаментов;
- мини-отели;
- бутик-отели;
- апарт-отели;
- малые сети;
- объекты до 100 номеров;
- распределенный номерной фонд;
- объекты без постоянного персонала на месте.

## 5. Продуктовые принципы

### API First

Любое действие должно быть доступно через API.

### Event Driven

Ключевые действия должны создавать события.

### AI Native

AI должен быть встроен в платформу, а не быть внешним чатом.

### Multi Tenant

Одна платформа должна обслуживать несколько брендов, объектов и юридических лиц.

### Modular Monolith First

Для MVP — модульный монолит. Для роста — возможность выделения микросервисов.

## 6. Долгосрочная цель

Через 3–5 лет платформа должна позволить компании:

- снизить зависимость от внешней PMS;
- снизить зависимость от внешнего Channel Manager;
- увеличить долю прямых продаж;
- запустить собственную программу лояльности;
- автоматизировать guest journey;
- улучшить контроль качества;
- создать технологический актив компании.



---


# 001_Product_Strategy.md

# Продуктовая стратегия

## 1. Позиционирование

DHP — гостиничная платформа нового поколения для сетей апартаментов, мини-отелей и бутик-отелей.

Это не просто PMS, а единая операционная и коммерческая система.

## 2. Ориентиры

В качестве ориентиров рассматриваются:

- TravelLine — Channel Manager и модуль бронирования;
- Bnovo — PMS для российского рынка;
- Mews — современная PMS-архитектура;
- Cloudbeds — API и интеграции;
- Oracle Opera — зрелость бизнес-процессов;
- Bitrix24 — CRM и коммуникации;
- TTLock — цифровые ключи.

## 3. Что должно быть лучше

### Полноценный Booking API

Обязательное требование:

```http
POST /api/v1/bookings
```

Платформа должна позволять создавать бронь из собственного сайта, приложения, CRM, партнера или OTA.

### Лояльность внутри ядра

Баллы, уровни, промокоды и персональные предложения должны быть частью платформы.

### Единый профиль гостя

Один гость должен иметь:

- историю проживаний;
- бронирования;
- баллы;
- коммуникации;
- предпочтения;
- документы;
- отзывы;
- обращения.

### AI-контроль качества

AI должен анализировать:

- чаты;
- звонки;
- скорость ответа;
- стандарты;
- апселлы;
- жалобы;
- отзывы.

## 4. Этапы продукта

### MVP

- PMS Core;
- Booking Engine;
- Channel Manager MVP;
- базовая лояльность;
- Bitrix24 integration;
- TTLock integration;
- базовая аналитика.

### Commercial Launch

- полноценный Channel Manager;
- OTA integrations;
- guest app;
- web cabinet;
- housekeeping;
- maintenance;
- payments;
- AI concierge.

### Platform

- публичный API;
- Plugin SDK;
- marketplace;
- SaaS model;
- Revenue Management;
- advanced BI.

## 5. Главные KPI

- доля прямых бронирований;
- конверсия сайта и приложения;
- повторные гости;
- RevPAR;
- ADR;
- снижение комиссий OTA;
- снижение ручного труда;
- скорость ответа гостю;
- количество ошибок бронирования.



---


# 002_System_Architecture.md

# Системная архитектура

## 1. Общая схема

```text
Frontend:
- Admin Web
- Guest Web
- Mobile App
- Staff App

Backend:
- API Gateway
- Identity
- PMS Core
- Booking
- Inventory
- Rates
- Channel Manager
- Booking Engine
- Loyalty
- Payments
- Messaging
- AI
- Analytics

Infrastructure:
- PostgreSQL
- Redis
- Message Broker
- Object Storage
- Search
- Monitoring
```

## 2. Рекомендуемый подход

На старте — модульный монолит:

- один backend;
- четкие доменные границы;
- единая PostgreSQL;
- внутренние события;
- внешний REST API;
- подготовка к выделению сервисов.

## 3. Ключевые домены

- Identity;
- Booking;
- Inventory;
- Rates;
- Channel Manager;
- Booking Engine;
- Loyalty;
- Payments;
- Messaging;
- AI;
- Analytics.

## 4. Event Bus

События:

- booking.created;
- booking.updated;
- booking.cancelled;
- payment.succeeded;
- loyalty.points_redeemed;
- inventory.changed;
- rate.changed;
- channel.sync_failed;
- message.received;
- lock.key_created.

## 5. Защита от овербукинга

Критические механизмы:

- transactional availability check;
- inventory lock;
- idempotency key;
- repeated availability check before payment;
- fast channel sync;
- conflict detection;
- audit log.

## 6. Интеграции

- OTA;
- Bnovo;
- TravelLine;
- Bitrix24;
- TTLock;
- payment providers;
- messaging;
- telephony;
- 1C;
- BI.

## 7. Технологический стек

Рекомендуемый стек:

- Backend: Node.js/NestJS или Python/FastAPI;
- Database: PostgreSQL;
- Cache: Redis;
- Queue: RabbitMQ/NATS/Kafka;
- Frontend: React;
- Mobile: React Native или Flutter;
- Infrastructure: Docker/Kubernetes;
- Monitoring: Prometheus/Grafana;
- Logs: ELK/Loki.



---


# API/004_API_Standards.md

# API-стандарты

## 1. Принципы

API должно быть:

- открытым;
- документированным;
- версионированным;
- безопасным;
- единообразным;
- пригодным для внешних интеграций.

## 2. Версионирование

```http
/api/v1/...
```

## 3. Основные endpoints

```http
POST   /api/v1/bookings
GET    /api/v1/bookings
GET    /api/v1/bookings/{id}
PATCH  /api/v1/bookings/{id}
POST   /api/v1/bookings/{id}/cancel

GET    /api/v1/availability/search
GET    /api/v1/rates
POST   /api/v1/payments
POST   /api/v1/loyalty/redeem
POST   /api/v1/locks/keys
```

## 4. Создание бронирования

```http
POST /api/v1/bookings
```

### Request

```json
{
  "idempotency_key": "uuid",
  "source": "direct_app",
  "property_id": "property_001",
  "room_type_id": "studio_standard",
  "room_id": "room_101",
  "rate_plan_id": "flexible",
  "arrival_date": "2026-08-01",
  "departure_date": "2026-08-05",
  "adults": 2,
  "children": 0,
  "guest": {
    "first_name": "Ivan",
    "last_name": "Ivanov",
    "phone": "+79990000000",
    "email": "ivan@example.com"
  },
  "pricing": {
    "base_amount": 40000,
    "discount_amount": 5000,
    "loyalty_points_redeemed": 5000,
    "total_amount": 35000,
    "currency": "RUB"
  },
  "payment": {
    "payment_required": true,
    "payment_status": "pending"
  }
}
```

### Response

```json
{
  "data": {
    "booking_id": "booking_123",
    "booking_number": "DHP-2026-000123",
    "status": "pending_payment",
    "total_amount": 35000,
    "currency": "RUB"
  }
}
```

## 5. Idempotency

Все критические POST-запросы должны поддерживать Idempotency-Key.

## 6. Ошибки

```json
{
  "error": {
    "code": "availability_not_found",
    "message": "Selected room is not available",
    "details": {}
  }
}
```

## 7. Webhooks

Платформа должна поддерживать webhooks:

- booking.created;
- booking.cancelled;
- payment.succeeded;
- guest.created;
- loyalty.updated;
- lock.key_issued.



---


# PMS/010_PMS_Core.md

# PMS Core

## 1. Назначение

PMS Core управляет объектами, номерным фондом, бронированиями, гостями, заездами, выездами, счетами, оплатами и операционными статусами.

## 2. Сущности

- Property;
- Building;
- Floor;
- Room;
- RoomType;
- RatePlan;
- Booking;
- Guest;
- Invoice;
- Payment;
- Service;
- Task;
- User;
- Role.

## 3. Статусы бронирования

- draft;
- pending_payment;
- confirmed;
- checked_in;
- checked_out;
- cancelled;
- no_show;
- conflict;
- waitlist.

## 4. Создание бронирования

PMS должна поддерживать создание брони из:

- админ-панели;
- API;
- Booking Engine;
- Channel Manager;
- мобильного приложения;
- Bitrix24;
- партнера.

## 5. Проверки перед созданием

- availability;
- restrictions;
- stop-sale;
- min stay;
- capacity;
- price calculation;
- guest validation;
- payment policy.

## 6. Защита от овербукинга

- inventory lock;
- transaction isolation;
- idempotency;
- audit log;
- event publication;
- immediate channel sync.

## 7. Интеграции

PMS публикует события для:

- Channel Manager;
- Loyalty;
- CRM;
- TTLock;
- AI;
- Housekeeping;
- Maintenance;
- Analytics.



---


# PMS/011_Bookings_Domain.md

# Домен бронирований

## 1. Назначение

Booking Domain управляет жизненным циклом бронирования: создание, подтверждение, изменение, отмена, заезд, выезд.

## 2. Источники

- direct_web;
- direct_app;
- ota;
- phone;
- email;
- walk_in;
- bitrix24;
- partner;
- import.

## 3. Жизненный цикл

```text
draft → pending_payment → confirmed → checked_in → checked_out
```

Альтернативные статусы:

```text
cancelled
no_show
conflict
waitlist
```

## 4. Обязательные операции

- create;
- confirm;
- cancel;
- check_in;
- check_out;
- no_show;
- modify_dates;
- modify_room;
- modify_guest;
- add_service;
- add_payment;
- add_note.

## 5. Структура брони

- booking_id;
- booking_number;
- tenant_id;
- property_id;
- room_type_id;
- room_id;
- rate_plan_id;
- arrival_date;
- departure_date;
- nights;
- adults;
- children;
- status;
- source;
- total_amount;
- paid_amount;
- balance_due;
- currency;
- guest_id;
- customer_id;
- created_at;
- updated_at.

## 6. Audit log

Фиксировать:

- user_id;
- source;
- action;
- old_value;
- new_value;
- timestamp.

## 7. Events

- booking.created;
- booking.confirmed;
- booking.updated;
- booking.cancelled;
- booking.checked_in;
- booking.checked_out;
- booking.no_show;
- booking.conflict_detected.



---


# PMS/012_Rooms_Inventory.md

# Номерной фонд и Inventory

## 1. Назначение

Модуль Rooms & Inventory управляет объектами размещения, корпусами, этажами, номерами, апартаментами, типами номеров, статусами доступности, блокировками и техническими ограничениями продаж.

## 2. Поддерживаемые типы объектов

Платформа должна поддерживать:

- классический отель;
- мини-отель;
- бутик-отель;
- апарт-отель;
- отдельные квартиры;
- распределенные апартаменты по разным адресам;
- гибридные объекты.

## 3. Иерархия номерного фонда

```text
Tenant
  ↓
Brand
  ↓
Property
  ↓
Building / Address
  ↓
Floor
  ↓
Room / Apartment
  ↓
Bed / Space, если требуется
```

## 4. Основные сущности

### Property

Объект размещения.

Поля:

- id;
- tenant_id;
- name;
- legal_name;
- property_type;
- address;
- timezone;
- status;
- check_in_time;
- check_out_time;
- currency;
- created_at;
- updated_at.

### RoomType

Категория размещения.

Поля:

- id;
- property_id;
- name;
- description;
- base_capacity;
- max_capacity;
- adults_max;
- children_max;
- area;
- bed_configuration;
- amenities;
- status.

### Room

Конкретный номер или апартамент.

Поля:

- id;
- property_id;
- room_type_id;
- name;
- number;
- floor;
- address;
- status;
- housekeeping_status;
- maintenance_status;
- lock_id;
- is_sellable;
- created_at;
- updated_at.

## 5. Статусы номера

### Операционный статус

- active;
- inactive;
- archived.

### Продажный статус

- sellable;
- not_sellable;
- blocked;
- out_of_order;
- out_of_service.

### Housekeeping status

- clean;
- dirty;
- inspected;
- in_progress;
- do_not_disturb;
- linen_required.

### Maintenance status

- ok;
- minor_issue;
- major_issue;
- out_of_order;
- inspection_required.

## 6. Availability

Availability рассчитывается на уровне:

- room type;
- конкретного room;
- property;
- channel;
- rate plan.

## 7. Блокировки

Система должна поддерживать:

- ручная блокировка;
- техническая блокировка;
- блокировка под ремонт;
- блокировка под собственника;
- блокировка под оплату;
- временная блокировка корзины;
- блокировка из-за уборки;
- блокировка из-за неисправности.

## 8. Inventory Lock

При бронировании из Booking Engine система должна создать временный lock:

```text
inventory.locked
```

Параметры:

- booking_draft_id;
- property_id;
- room_type_id;
- room_id, если выбран конкретный номер;
- date range;
- expires_at;
- idempotency_key.

## 9. Защита от овербукинга

Обязательные механизмы:

- расчет availability внутри транзакции;
- блокировка строк inventory;
- idempotency key;
- запрет двойной продажи одного room_id на пересекающиеся даты;
- проверка после оплаты;
- автоматическая публикация inventory.changed.

## 10. Критерии приемки

- можно создать объект;
- можно создать тип номера;
- можно создать номер;
- можно присвоить room type;
- можно заблокировать номер на даты;
- блокировка уменьшает availability;
- отмена блокировки возвращает availability;
- статусы уборки и ремонта влияют на доступность согласно правилам.



---


# PMS/013_Frontdesk_Calendar.md

# Шахматка и Front Desk

## 1. Назначение

Шахматка — основной интерфейс операционного управления бронированиями, номерным фондом, заездами, выездами и загрузкой.

## 2. Пользователи

- администратор;
- менеджер бронирования;
- генеральный менеджер;
- директор номерного фонда;
- хаускипинг;
- инженер;
- revenue manager.

## 3. Режимы отображения

Шахматка должна поддерживать:

- день;
- неделя;
- месяц;
- произвольный диапазон;
- группировка по объектам;
- группировка по адресам;
- группировка по категориям;
- фильтр по статусу брони;
- фильтр по источнику;
- фильтр по уборке;
- фильтр по ремонту.

## 4. Цветовая логика

Цвета должны показывать:

- confirmed;
- pending_payment;
- checked_in;
- checked_out;
- cancelled;
- no_show;
- conflict;
- technical block;
- owner block;
- maintenance block.

## 5. Основные действия

Из шахматки пользователь должен иметь возможность:

- создать бронь;
- открыть карточку брони;
- перенести бронь;
- изменить номер;
- заселить гостя;
- выселить гостя;
- отменить бронь;
- добавить оплату;
- создать счет;
- добавить комментарий;
- создать задачу housekeeping;
- создать инженерную задачу;
- выдать цифровой ключ.

## 6. Drag & Drop

Перетаскивание брони допускается только если:

- новый номер доступен;
- тип номера подходит;
- нет пересечения с другой бронью;
- нет технической блокировки;
- у пользователя есть право.

После изменения публикуется событие:

```text
booking.room_changed
```

## 7. Карточка брони

Карточка должна включать:

- номер брони;
- статус;
- источник;
- даты;
- номер/тип номера;
- гость;
- проживающие;
- контакты;
- сумма;
- оплаты;
- баланс;
- услуги;
- комментарии;
- история изменений;
- документы;
- ключи;
- задачи;
- коммуникации.

## 8. Быстрые статусы

Для текущего дня:

- arriving today;
- in house;
- departing today;
- overdue checkout;
- unpaid;
- no documents;
- no key issued;
- room dirty;
- maintenance issue.

## 9. Конфликты

Шахматка должна явно показывать:

- овербукинг;
- пересечение броней;
- бронь без номера;
- бронь с неоплаченной суммой;
- бронь без документов;
- номер грязный перед заездом;
- номер в ремонте перед заездом.

## 10. Критерии приемки

- бронь видна в шахматке;
- можно открыть карточку;
- можно изменить номер;
- система блокирует некорректный перенос;
- видны заезды/выезды дня;
- видны конфликты;
- все изменения логируются.



---


# PMS/014_Rates_Restrictions.md

# Тарифы, цены и ограничения

## 1. Назначение

Модуль Rates & Restrictions управляет тарифными планами, ценами, правилами отмены, ограничениями продаж и условиями бронирования.

## 2. Основные сущности

- RatePlan;
- RatePrice;
- Restriction;
- CancellationPolicy;
- PaymentPolicy;
- Promotion;
- DerivedRateRule;
- ChannelMarkupRule.

## 3. RatePlan

Поля:

- id;
- property_id;
- name;
- code;
- description;
- meal_plan;
- cancellation_policy_id;
- payment_policy_id;
- is_refundable;
- is_active;
- parent_rate_plan_id;
- derived_rule;
- created_at;
- updated_at.

## 4. Типы тарифов

- flexible;
- non_refundable;
- breakfast_included;
- long_stay;
- corporate;
- loyalty_member;
- mobile_only;
- package;
- owner_rate;
- closed_user_group.

## 5. Цены

Цена может зависеть от:

- даты;
- дня недели;
- room type;
- rate plan;
- количества гостей;
- канала продаж;
- уровня лояльности;
- промокода;
- длительности проживания.

## 6. Ограничения

Система должна поддерживать:

- min stay;
- max stay;
- closed to arrival;
- closed to departure;
- stop sell;
- release period;
- advance booking min/max;
- min price;
- max occupancy;
- channel-specific stop sell.

## 7. Derived rates

Примеры правил:

```text
Non-refundable = Flexible - 10%
Breakfast = Flexible + 1500 RUB
OTA = Direct + 12%
Mobile App = Direct - 5%
```

## 8. Приоритет правил

При расчете цены применяется порядок:

1. базовая цена;
2. derived rate;
3. channel markup;
4. promotion;
5. loyalty discount;
6. promo code;
7. manual adjustment;
8. taxes and fees.

## 9. Rate Calendar

Интерфейс должен поддерживать:

- массовое изменение цен;
- копирование периода;
- изменение min stay;
- закрытие продаж;
- открытие продаж;
- фильтр по room type;
- фильтр по rate plan;
- подсветку ошибок.

## 10. Интеграция с Channel Manager

При изменении цены или ограничения публикуются события:

```text
rate.changed
restriction.changed
```

Channel Manager должен получить эти события и выгрузить изменения в каналы.

## 11. Критерии приемки

- можно создать тариф;
- можно задать цену по датам;
- можно задать min stay;
- можно закрыть продажу;
- derived rate рассчитывается корректно;
- цена уходит в Channel Manager;
- изменение логируется.



---


# PMS/015_Checkin_Checkout.md

# Заезд, проживание и выезд

## 1. Назначение

Модуль Check-in / Check-out управляет процессами заезда, проживания, выезда, онлайн-регистрации, документов, депозитов и цифровых ключей.

## 2. Типы заезда

- стандартный заезд;
- ранний заезд;
- самостоятельный заезд;
- онлайн-заезд;
- заезд через администратора;
- заезд по цифровому ключу.

## 3. Online Check-in

Гость должен иметь возможность до заезда:

- заполнить анкету;
- указать время прибытия;
- загрузить документы;
- принять правила проживания;
- оплатить остаток;
- внести депозит;
- заказать услуги;
- получить инструкцию по заселению.

## 4. Проверки перед заездом

Система должна проверить:

- бронь подтверждена;
- оплата внесена согласно правилам;
- документы загружены;
- номер назначен;
- номер готов;
- нет инженерной блокировки;
- ключ может быть выдан;
- депозит внесен, если требуется.

## 5. Check-in status

- not_ready;
- ready_for_checkin;
- online_checkin_started;
- online_checkin_completed;
- checked_in;
- checkin_blocked.

## 6. Выдача цифрового ключа

При успешном выполнении условий публикуется событие:

```text
checkin.ready_for_key
```

TTLock Adapter должен создать:

- PIN;
- eKey, если применимо;
- срок действия;
- объект доступа;
- лог операции.

## 7. Проживание

Во время проживания гость может:

- написать в чат;
- заказать услугу;
- продлить проживание;
- запросить уборку;
- создать инженерную заявку;
- запросить поздний выезд.

## 8. Check-out

Перед выездом:

- проверяется баланс;
- закрываются услуги;
- фиксируется факт выезда;
- номер получает статус dirty;
- создается задача уборки;
- ключ отзывается;
- публикуется booking.checked_out.

## 9. Late checkout

Система должна поддерживать:

- запрос гостя;
- проверку availability;
- расчет цены;
- оплату;
- обновление ключа;
- уведомление housekeeping.

## 10. Критерии приемки

- гость может пройти online check-in;
- система блокирует заезд при невыполненных условиях;
- ключ выдается только при выполненных условиях;
- check-out меняет статус номера;
- после выезда создается задача уборки;
- ключ отзывается после выезда.



---


# PMS/020_Booking_API_Detailed.md

# Подробная спецификация Booking API

## 1. Назначение

Booking API — ключевой публичный и внутренний интерфейс для создания, изменения и управления бронированиями.

API должен использоваться:

- админ-панелью;
- Booking Engine;
- мобильным приложением;
- Channel Manager;
- Bitrix24 Adapter;
- партнерскими интеграциями.

## 2. Принципы

- все операции идемпотентны;
- создание брони всегда проходит availability check;
- изменение брони всегда пересчитывает цену и availability;
- каждое изменение фиксируется в audit log;
- каждое ключевое действие публикует event;
- API не должен позволять создать овербукинг.

## 3. Создание брони

### Endpoint

```http
POST /api/v1/bookings
```

### Headers

```http
Authorization: Bearer <token>
Idempotency-Key: <uuid>
Content-Type: application/json
```

### Request

```json
{
  "source": "direct_app",
  "property_id": "property_001",
  "room_type_id": "rt_studio",
  "room_id": null,
  "rate_plan_id": "rp_flexible",
  "arrival_date": "2026-08-01",
  "departure_date": "2026-08-05",
  "adults": 2,
  "children": 0,
  "guest": {
    "first_name": "Ivan",
    "last_name": "Ivanov",
    "phone": "+79990000000",
    "email": "ivan@example.com"
  },
  "services": [
    {
      "service_id": "early_checkin",
      "quantity": 1
    }
  ],
  "loyalty": {
    "points_to_redeem": 5000
  },
  "promo_code": "DIRECT10",
  "payment_mode": "online_required",
  "comment": "Guest prefers quiet room"
}
```

### Response

```json
{
  "data": {
    "booking_id": "booking_123",
    "booking_number": "DHP-2026-000123",
    "status": "pending_payment",
    "property_id": "property_001",
    "room_type_id": "rt_studio",
    "room_id": null,
    "arrival_date": "2026-08-01",
    "departure_date": "2026-08-05",
    "total_amount": 35000,
    "currency": "RUB",
    "payment_due_at": "2026-07-01T10:15:00Z"
  }
}
```

## 4. Бизнес-правила создания

Перед созданием система обязана:

1. проверить права источника;
2. проверить существование property;
3. проверить room_type;
4. проверить rate_plan;
5. проверить даты;
6. проверить вместимость;
7. проверить availability;
8. проверить ограничения тарифа;
9. рассчитать цену;
10. проверить промокод;
11. проверить баланс баллов;
12. зарезервировать баллы;
13. создать inventory lock;
14. создать бронь;
15. создать счет;
16. создать payment intent, если требуется;
17. опубликовать событие booking.created.

## 5. Статусы брони

- draft;
- pending_payment;
- confirmed;
- checked_in;
- checked_out;
- cancelled;
- no_show;
- conflict;
- waitlist.

## 6. Получение брони

```http
GET /api/v1/bookings/{id}
```

Возвращает:

- данные брони;
- гостей;
- услуги;
- платежи;
- счет;
- баллы;
- комментарии;
- историю изменений;
- задачи;
- ключи.

## 7. Список броней

```http
GET /api/v1/bookings
```

Фильтры:

- property_id;
- date_from;
- date_to;
- status;
- source;
- guest_id;
- room_id;
- room_type_id;
- payment_status;
- created_at;
- updated_at.

## 8. Изменение брони

```http
PATCH /api/v1/bookings/{id}
```

Можно изменить:

- даты;
- room_type;
- room_id;
- гостей;
- тариф;
- услуги;
- комментарии;
- источник;
- статус оплаты, если права позволяют.

При изменении дат или room_type:

- выполняется новый availability check;
- старая доступность освобождается;
- новая доступность резервируется;
- цена пересчитывается.

## 9. Отмена брони

```http
POST /api/v1/bookings/{id}/cancel
```

Request:

```json
{
  "reason": "guest_request",
  "comment": "Guest cancelled via app",
  "refund_mode": "according_policy"
}
```

Система должна:

- проверить правило отмены;
- рассчитать штраф;
- отменить бронь;
- освободить inventory;
- вернуть/удержать баллы;
- создать refund, если применимо;
- отправить уведомление;
- опубликовать booking.cancelled.

## 10. Check-in

```http
POST /api/v1/bookings/{id}/check-in
```

Проверки:

- бронь confirmed;
- номер назначен;
- номер clean/inspected;
- нет maintenance block;
- документы загружены;
- оплата соответствует политике;
- депозит внесен, если нужен.

## 11. Check-out

```http
POST /api/v1/bookings/{id}/check-out
```

Система должна:

- проверить баланс;
- закрыть проживание;
- изменить статус номера на dirty;
- создать housekeeping task;
- отозвать ключ;
- опубликовать booking.checked_out.

## 12. No-show

```http
POST /api/v1/bookings/{id}/no-show
```

Система должна:

- применить политику no-show;
- освободить inventory согласно правилам;
- обработать оплату/штраф;
- опубликовать booking.no_show.

## 13. Ошибки

- availability_not_found;
- rate_plan_not_available;
- restriction_min_stay_failed;
- stop_sell_active;
- room_not_available;
- guest_invalid;
- payment_required;
- loyalty_points_not_enough;
- promo_code_invalid;
- booking_already_cancelled;
- booking_status_transition_forbidden.

## 14. Events

- booking.created;
- booking.updated;
- booking.cancelled;
- booking.confirmed;
- booking.checked_in;
- booking.checked_out;
- booking.no_show;
- booking.payment_status_changed.

## 15. Критерии приемки

- бронь создается через API;
- повторный Idempotency-Key не создает дубль;
- нельзя создать бронь без availability;
- изменение дат пересчитывает цену;
- отмена возвращает availability;
- check-out создает задачу уборки;
- все изменения видны в audit log.



---


# PMS/021_Availability_Engine.md

# Availability Engine

## 1. Назначение

Availability Engine отвечает за расчет доступности номеров/апартаментов, предотвращение овербукинга, временные блокировки, технические блокировки и синхронизацию доступности с Channel Manager.

Это один из наиболее критичных модулей платформы.

## 2. Термины

### Room

Конкретный номер или апартамент.

### RoomType

Категория размещения, объединяющая один или несколько room.

### Availability

Количество доступных единиц размещения на конкретную дату.

### Inventory Lock

Временная блокировка доступности на время оформления брони или оплаты.

### Block

Ручная или техническая блокировка номера.

## 3. Источник истины

Источник истины по доступности — DHP Inventory.

Channel Manager, Booking Engine и внешние каналы не должны самостоятельно рассчитывать availability.

## 4. Уровни расчета

Система должна рассчитывать availability:

- по property;
- по room_type;
- по конкретному room;
- по date;
- по rate_plan;
- по channel;
- с учетом restrictions.

## 5. Базовая формула

```text
Available = Total Sellable Rooms
            - Confirmed Bookings
            - Pending Payment Holds
            - Inventory Locks
            - Manual Blocks
            - Out of Order
            - Channel Allotment Holds
```

## 6. Даты проживания

Бронь с датами:

```text
arrival_date = 2026-08-01
departure_date = 2026-08-05
```

занимает ночи:

```text
2026-08-01
2026-08-02
2026-08-03
2026-08-04
```

Дата departure не занимает ночь.

## 7. Проверка доступности

Endpoint:

```http
GET /api/v1/availability/search
```

Параметры:

- property_id;
- arrival_date;
- departure_date;
- adults;
- children;
- room_type_id;
- rate_plan_id;
- channel;
- promo_code;
- loyalty_tier.

## 8. Inventory Lock

Endpoint:

```http
POST /api/v1/availability/lock
```

Назначение:

- временно зарезервировать room_type/room;
- не дать другому пользователю купить тот же inventory;
- дать время на оплату.

TTL по умолчанию:

```text
15 минут
```

## 9. Lock lifecycle

```text
created → active → converted_to_booking
created → active → expired
created → active → released
```

## 10. Создание брони с lock

Алгоритм:

1. пользователь выбирает вариант;
2. система повторно проверяет availability;
3. создает inventory lock;
4. создает booking в статусе pending_payment;
5. создает payment intent;
6. после оплаты lock конвертируется в confirmed booking;
7. если оплата не прошла — lock истекает и inventory возвращается.

## 11. Ручные блокировки

Типы:

- owner_block;
- maintenance_block;
- staff_block;
- sales_block;
- renovation_block;
- inspection_block;
- legal_block.

Блокировка должна:

- уменьшать availability;
- отображаться в шахматке;
- выгружаться в Channel Manager;
- иметь причину;
- иметь автора;
- иметь период.

## 12. Out of Order

Если номер не может продаваться из-за технической проблемы:

- maintenance создает out_of_order;
- availability уменьшается;
- Channel Manager отправляет stop/availability update;
- после ремонта номер возвращается в продажу.

## 13. Channel Allotment

Для будущих версий возможно выделение allotment под канал.

В MVP рекомендуется единый пул availability, чтобы снизить риск ошибок.

## 14. Защита от race conditions

Обязательные технические требования:

- транзакции PostgreSQL;
- row-level locking;
- unique constraints на пересекающиеся room bookings;
- idempotency keys;
- optimistic concurrency для rate/availability updates;
- transactional outbox для событий.

## 15. Запрет двойной продажи конкретного room

Для конкретного room система должна запрещать пересекающиеся периоды в статусах:

- pending_payment;
- confirmed;
- checked_in;
- owner_block;
- maintenance_block;
- out_of_order.

## 16. Availability cache

Можно использовать Redis cache для быстрого поиска, но cache не является источником истины.

Перед созданием брони всегда выполняется проверка в базе.

## 17. События

- inventory.changed;
- inventory.locked;
- inventory.lock_expired;
- inventory.released;
- room.blocked;
- room.unblocked;
- out_of_order.created;
- out_of_order.removed.

## 18. Интеграция с Channel Manager

При любом изменении availability создается событие `inventory.changed`.

Channel Manager должен:

- найти затронутые каналы;
- сформировать update;
- отправить в OTA;
- записать лог;
- повторить при ошибке.

## 19. Edge cases

### Оплата прошла, lock истек

Система должна:

1. проверить payment callback;
2. если оплата успешна, попытаться создать бронь;
3. если inventory уже продан — создать conflict;
4. уведомить администратора;
5. запустить сценарий ручного решения.

### OTA прислала бронь в момент оплаты direct-гостя

Приоритет зависит от времени создания lock и правил источника.

В MVP правило:

- если direct lock уже активен — OTA booking получает conflict;
- если OTA booking создан раньше — direct payment должен быть отклонен.

### Изменение дат подтвержденной брони

Система должна:

1. проверить новую доступность;
2. временно удержать новую доступность;
3. освободить старую только после успешного изменения;
4. пересчитать цену.

## 20. Критерии приемки

- availability считается по датам корректно;
- departure date не занимает ночь;
- lock уменьшает availability;
- expired lock возвращает availability;
- техническая блокировка уменьшает availability;
- отмена брони возвращает availability;
- нельзя создать две брони на один room и даты;
- Channel Manager получает inventory.changed;
- все изменения логируются.



---


# PMS/022_Rate_Calculation_Engine.md

# Rate Calculation Engine

## 1. Назначение

Rate Calculation Engine отвечает за расчет стоимости проживания, услуг, скидок, промокодов, баллов, ограничений тарифа, налогов и итоговой суммы бронирования.

## 2. Принципы

- расчет должен быть воспроизводимым;
- итоговая цена должна сохраняться в бронировании;
- изменение правил не должно менять цену уже созданной брони без явного действия;
- каждый расчет должен иметь breakdown;
- Booking Engine, PMS и Channel Manager должны использовать один и тот же Rate Engine.

## 3. Входные параметры

- property_id;
- room_type_id;
- room_id;
- rate_plan_id;
- arrival_date;
- departure_date;
- adults;
- children;
- channel;
- loyalty_tier;
- promo_code;
- services;
- currency.

## 4. Базовый расчет

Для каждой ночи:

```text
night_price = base_price(date, room_type, rate_plan)
```

Итог проживания:

```text
stay_amount = sum(night_price for each night)
```

## 5. Порядок применения правил

1. base price;
2. occupancy adjustment;
3. derived rate;
4. channel markup;
5. length of stay discount;
6. promotion;
7. promo code;
8. loyalty discount;
9. loyalty points redemption;
10. services;
11. taxes/fees;
12. rounding.

## 6. Ограничения

Перед расчетом подтвержденной цены система проверяет:

- тариф активен;
- room_type доступен;
- min stay;
- max stay;
- stop sell;
- closed to arrival;
- closed to departure;
- advance booking window;
- capacity;
- payment policy;
- cancellation policy.

## 7. Min stay

Если тариф требует min stay = 2, а гость выбрал 1 ночь:

Ошибка:

```text
restriction_min_stay_failed
```

## 8. Stop sell

Если на любую ночь периода включен stop sell:

Ошибка:

```text
stop_sell_active
```

## 9. Closed to arrival

Если arrival_date закрыт для заезда:

Ошибка:

```text
closed_to_arrival
```

## 10. Closed to departure

Если departure_date закрыт для выезда:

Ошибка:

```text
closed_to_departure
```

## 11. Derived rates

Пример:

```text
NonRefundable = Flexible - 10%
BreakfastIncluded = Flexible + 1500 RUB/night
OTA = Direct + 12%
MobileApp = Direct - 5%
```

Derived rate должен хранить ссылку на parent rate.

## 12. Промокоды

Промокод может быть:

- процентный;
- фиксированный;
- на конкретный объект;
- на конкретный тариф;
- на период;
- для конкретного гостя;
- одноразовый;
- многоразовый.

## 13. Лояльность

Rate Engine должен рассчитать:

- сколько баллов можно списать;
- лимит списания по уровню;
- доступный баланс;
- сумму скидки;
- сумму к оплате после списания.

Пример:

```text
total = 40 000 RUB
tier = Gold
max redemption = 20%
max points = 8 000
guest wants = 10 000
allowed = 8 000
final total = 32 000
```

## 14. Услуги

Услуги могут рассчитываться:

- one-time;
- per night;
- per guest;
- per room;
- per stay;
- per unit.

Примеры:

- ранний заезд;
- поздний выезд;
- парковка;
- завтрак;
- уборка;
- трансфер.

## 15. Breakdown

Каждый расчет должен возвращать breakdown:

```json
{
  "stay_amount": 40000,
  "services_amount": 3000,
  "promo_discount": 2000,
  "loyalty_discount": 5000,
  "taxes": 0,
  "total_amount": 36000,
  "currency": "RUB",
  "nights": [
    {
      "date": "2026-08-01",
      "base_price": 10000,
      "final_price": 9000
    }
  ]
}
```

## 16. Quote

Endpoint:

```http
GET /api/v1/rates/quote
```

Quote должен иметь TTL, например 15 минут.

Перед созданием брони цена пересчитывается.

## 17. Фиксация цены в брони

После создания брони сохраняются:

- nightly prices;
- applied rules;
- discounts;
- loyalty redemption;
- services;
- final amount;
- quote_id;
- calculation_version.

## 18. Изменение цены

Если администратор меняет бронь вручную:

- система показывает старую цену;
- рассчитывает новую;
- показывает разницу;
- требует подтверждения;
- пишет audit log.

## 19. Events

- rate.quote_created;
- rate.changed;
- restriction.changed;
- booking.price_calculated;
- booking.price_changed;
- promo.applied;
- loyalty.discount_applied.

## 20. Критерии приемки

- цена считается по ночам;
- min stay работает;
- stop sell работает;
- closed to arrival/departure работают;
- промокод применяется;
- лимит списания баллов работает;
- breakdown сохраняется;
- цена фиксируется в брони;
- quote истекает;
- перед созданием брони цена пересчитывается.



---


# ChannelManager/020_Channel_Manager.md

# Channel Manager

## 1. Назначение

Channel Manager синхронизирует цены, наличие, ограничения и бронирования между DHP и внешними каналами продаж.

## 2. Каналы

MVP должен учитывать:

- Ostrovok;
- Avito;
- Суточно;
- Яндекс Путешествия;
- Bronevik;
- OneTwoTrip;
- 101Hotels;
- собственный сайт;
- мобильное приложение;
- партнерские каналы.

## 3. Основные функции

- подключение канала;
- маппинг объектов;
- маппинг room types;
- маппинг тарифов;
- выгрузка availability;
- выгрузка prices;
- выгрузка restrictions;
- получение броней;
- получение отмен;
- получение изменений;
- журнал ошибок;
- ручной повтор синхронизации.

## 4. Сущности

- Channel;
- ChannelConnection;
- ChannelPropertyMapping;
- ChannelRoomTypeMapping;
- ChannelRatePlanMapping;
- ChannelSyncJob;
- ChannelSyncLog;
- ChannelBooking;
- ChannelError.

## 5. Критерии приемки MVP

- можно подключить канал;
- можно настроить маппинг;
- можно выгрузить цены;
- можно выгрузить наличие;
- можно получить бронь;
- можно получить отмену;
- можно увидеть ошибку;
- можно повторить sync вручную.



---


# ChannelManager/021_OTA_Mapping.md

# OTA-маппинг

## 1. Назначение

OTA-маппинг связывает внутренние сущности DHP с сущностями внешних каналов продаж.

Без маппинга невозможны:

- выгрузка цен;
- выгрузка наличия;
- прием бронирований;
- обработка отмен;
- аналитика источников.

## 2. Уровни маппинга

### Property Mapping

Связь внутреннего объекта с объектом в канале.

### Room Type Mapping

Связь внутреннего типа номера/апартамента с категорией размещения в OTA.

### Rate Plan Mapping

Связь внутреннего тарифа с тарифом в OTA.

### Restriction Mapping

Связь ограничений:

- min stay;
- max stay;
- closed to arrival;
- closed to departure;
- stop sale.

### Service Mapping

Связь допуслуг:

- завтрак;
- ранний заезд;
- поздний выезд;
- парковка;
- уборка;
- трансфер.

## 3. Требования к интерфейсу

Администратор должен:

- выбрать канал;
- выбрать объект;
- увидеть внутренние room types;
- сопоставить их с внешними room types;
- сопоставить тарифы;
- включить синхронизацию;
- выполнить тестовую выгрузку;
- увидеть ошибки.

## 4. Статусы

- draft;
- active;
- paused;
- invalid;
- error;
- archived.

## 5. Валидация

Проверить:

- внешний объект указан;
- room types указаны;
- rate plans указаны;
- нет дублей;
- все обязательные поля заполнены;
- тестовая выгрузка успешна.

## 6. Ошибки

- external_property_not_found;
- external_room_type_not_found;
- external_rate_plan_not_found;
- duplicate_mapping;
- missing_required_mapping;
- channel_auth_failed;
- channel_api_error.



---


# ChannelManager/022_Inventory_Sync.md

# Синхронизация наличия

## 1. Назначение

Inventory Sync передает доступность номерного фонда из DHP во внешние каналы продаж.

## 2. Источник истины

Источник истины — Inventory Service.

Channel Manager не рассчитывает availability самостоятельно.

## 3. События

- inventory.changed;
- booking.created;
- booking.cancelled;
- room.blocked;
- room.unblocked;
- out_of_order.created;
- out_of_order.removed.

## 4. Алгоритм

1. Inventory публикует `inventory.changed`.
2. Channel Manager определяет объект, даты, room types.
3. Находит активные каналы.
4. Формирует обновления.
5. Отправляет данные в OTA.
6. Логирует результат.
7. При ошибке ставит retry.

## 5. Формат

```json
{
  "property_id": "property_001",
  "room_type_id": "studio_standard",
  "date": "2026-08-01",
  "available": 4,
  "stop_sell": false
}
```

## 6. Защита от овербукинга

- transactional availability check;
- atomic inventory decrement;
- inventory lock during payment;
- idempotency key;
- repeat check before confirmation;
- fast channel sync;
- conflict report.

## 7. Retry policy

- 30 секунд;
- 2 минуты;
- 10 минут;
- 30 минут;
- dead-letter queue;
- alert.

## 8. Критерии приемки

- изменение брони меняет availability;
- availability уходит в канал;
- отмена возвращает availability;
- блокировка закрывает продажу;
- ошибки видны;
- sync можно повторить.



---


# ChannelManager/023_Rate_Sync.md

# Синхронизация цен и ограничений

## 1. Назначение

Rate Sync передает цены, тарифы и ограничения из DHP во внешние каналы.

## 2. Источник истины

Источник истины — Rate Service.

## 3. Типы цен

- базовая цена;
- динамическая цена;
- derived rate;
- цена по дням недели;
- цена по количеству гостей;
- пакетная цена;
- спеццена для канала.

## 4. Ограничения

- min stay;
- max stay;
- closed to arrival;
- closed to departure;
- stop sell;
- release period;
- advance booking window;
- cancellation policy;
- prepayment policy.

## 5. Формат

```json
{
  "property_id": "property_001",
  "room_type_id": "studio_standard",
  "rate_plan_id": "flexible",
  "date": "2026-08-01",
  "price": 12500,
  "currency": "RUB",
  "min_stay": 2,
  "closed_to_arrival": false,
  "closed_to_departure": false,
  "stop_sell": false
}
```

## 6. Derived rates

Примеры:

```text
Non-refundable = Flexible - 10%
Breakfast = Flexible + 1500 RUB
OTA markup = Direct + 12%
```

## 7. Проверка перед выгрузкой

- цена не нулевая;
- цена не ниже минимальной;
- валюта поддерживается;
- маппинг активен;
- канал принимает ограничения;
- нет конфликта правил.

## 8. Критерии приемки

- цена меняется в DHP;
- цена уходит в канал;
- ограничения уходят в канал;
- ошибки логируются;
- retry работает;
- есть ручная выгрузка.



---


# ChannelManager/024_Booking_Ingestion.md

# Прием бронирований из каналов

## 1. Назначение

Booking Ingestion принимает, валидирует и создает бронирования, поступающие из OTA и партнерских каналов.

## 2. Источники

- Ostrovok;
- Avito;
- Суточно;
- Яндекс Путешествия;
- Bronevik;
- OneTwoTrip;
- собственный сайт;
- мобильное приложение;
- партнеры.

## 3. Сценарий

1. Канал отправляет бронь.
2. Channel Manager принимает payload.
3. Проверяет подпись/токен.
4. Нормализует данные.
5. Проверяет маппинг.
6. Проверяет дубль.
7. Проверяет availability.
8. Создает бронь в PMS.
9. Публикует `booking.created`.
10. Канал получает подтверждение.
11. Остальные каналы получают обновленное availability.

## 4. Нормализованная модель

```json
{
  "external_booking_id": "OTA-123",
  "source": "ostrovok",
  "property_id": "property_001",
  "room_type_id": "studio_standard",
  "rate_plan_id": "flexible",
  "arrival_date": "2026-08-01",
  "departure_date": "2026-08-05",
  "adults": 2,
  "children": 0,
  "guest": {
    "first_name": "Ivan",
    "last_name": "Ivanov",
    "phone": "+79990000000",
    "email": "ivan@example.com"
  },
  "price": {
    "total": 40000,
    "currency": "RUB"
  },
  "payment": {
    "status": "paid_by_channel",
    "collect_method": "ota"
  }
}
```

## 5. Проверка дублей

Дубль определяется по:

- channel_id;
- external_booking_id;
- property_id.

## 6. Availability conflict

Если availability нет:

1. бронь создается в статусе conflict;
2. создается alert;
3. ответственному ставится задача;
4. конфликт попадает в отчет.

## 7. Отмена

При отмене:

1. создается `booking.cancelled`;
2. availability возвращается;
3. каналы получают обновление;
4. Loyalty отменяет pending points;
5. Payments запускает возврат, если применимо.

## 8. Ошибки

- unknown_channel;
- invalid_signature;
- mapping_not_found;
- duplicate_booking;
- availability_conflict;
- invalid_price;
- invalid_dates;
- guest_data_invalid;
- pms_create_failed.



---


# ChannelManager/025_Channel_Adapter_Spec.md

# Спецификация Channel Adapter

## 1. Назначение

Channel Adapter — стандартный интерфейс для подключения внешних каналов продаж к D Hospitality Platform.

Каждый OTA-канал должен реализовывать общий контракт, чтобы Channel Manager работал одинаково с разными интеграциями.

## 2. Поддерживаемые каналы

В MVP архитектура должна позволять подключить:

- Avito;
- Ostrovok;
- Yandex Travel;
- Sutochno;
- Bronevik;
- OneTwoTrip;
- собственный сайт;
- мобильное приложение;
- партнерские каналы.

## 3. Обязательные возможности адаптера

Каждый адаптер должен поддерживать, если канал предоставляет такую возможность:

- authenticate;
- test connection;
- fetch properties;
- fetch room types;
- fetch rate plans;
- push availability;
- push rates;
- push restrictions;
- receive booking;
- receive modification;
- receive cancellation;
- confirm booking;
- send error response;
- retry failed operation.

## 4. Интерфейс адаптера

```typescript
interface ChannelAdapter {
  authenticate(connection): Promise<AuthResult>;
  testConnection(connection): Promise<TestResult>;
  fetchRemoteInventory(connection): Promise<RemoteInventory>;
  pushAvailability(payload): Promise<SyncResult>;
  pushRates(payload): Promise<SyncResult>;
  pushRestrictions(payload): Promise<SyncResult>;
  parseBooking(payload): Promise<NormalizedBooking>;
  parseCancellation(payload): Promise<NormalizedCancellation>;
  confirmBooking(booking): Promise<ConfirmResult>;
}
```

## 5. Нормализованная бронь

Каждый канал должен приводить бронь к единой модели DHP:

```json
{
  "channel_id": "ostrovok",
  "external_booking_id": "EXT-123",
  "property_id": "property_001",
  "room_type_id": "rt_001",
  "rate_plan_id": "rp_001",
  "arrival_date": "2026-08-01",
  "departure_date": "2026-08-05",
  "adults": 2,
  "children": 0,
  "guest": {
    "first_name": "Ivan",
    "last_name": "Ivanov",
    "phone": "+79990000000",
    "email": "ivan@example.com"
  },
  "total_amount": 40000,
  "currency": "RUB",
  "payment_collect_mode": "channel"
}
```

## 6. Sync Job

Каждая отправка в канал оформляется как sync job.

Поля:

- id;
- channel_id;
- property_id;
- job_type;
- status;
- payload;
- response;
- error_code;
- retry_count;
- next_retry_at;
- created_at;
- updated_at.

## 7. Статусы sync job

- pending;
- processing;
- success;
- failed;
- retry_scheduled;
- dead_letter;
- cancelled.

## 8. Retry

Все адаптеры должны поддерживать retry:

- exponential backoff;
- max retry count;
- manual retry;
- dead-letter queue;
- alert.

## 9. Ошибки

Единый формат:

```json
{
  "code": "channel_auth_failed",
  "message": "Channel authentication failed",
  "details": {},
  "retryable": true
}
```

Коды:

- channel_auth_failed;
- mapping_not_found;
- remote_property_not_found;
- remote_room_type_not_found;
- remote_rate_plan_not_found;
- validation_failed;
- timeout;
- rate_limit;
- remote_server_error;
- unknown_error.

## 10. Idempotency

При получении брони из OTA адаптер должен использовать ключ:

```text
channel_id + external_booking_id
```

Повторный payload не должен создавать дубль.

## 11. Monitoring

Для каждого канала отображать:

- connection status;
- last successful sync;
- failed jobs;
- pending jobs;
- dead-letter jobs;
- last booking received;
- last availability update;
- last rate update.

## 12. Критерии приемки

- новый адаптер можно добавить без изменения ядра Channel Manager;
- sync jobs логируются;
- ошибки нормализуются;
- retry работает;
- бронь нормализуется;
- дубль не создается.



---


# ChannelManager/026_Avito_Integration.md

# Интеграция с Авито — спецификация

## 1. Назначение

Документ описывает требования к интеграции DHP с Авито как каналом продаж.

Фактическая реализация зависит от доступного API, партнерского доступа и условий Авито. Этот документ задает целевую архитектуру адаптера.

## 2. Цели интеграции

- выгружать объекты/юниты, если API позволяет;
- синхронизировать доступность;
- синхронизировать цены;
- получать заявки/бронирования;
- получать сообщения гостей;
- передавать статусы;
- исключать ручное дублирование данных.

## 3. Сценарии MVP

### Сценарий 1: Заявка из Авито

1. Гость оставляет заявку/бронь на Авито.
2. Авито отправляет событие или заявка забирается polling-ом.
3. DHP нормализует данные.
4. Создается бронь или заявка.
5. Availability пересчитывается.
6. Сделка передается в Bitrix24, если нужно.

### Сценарий 2: Обновление availability

1. В DHP создана бронь.
2. Availability изменился.
3. Channel Manager создает sync job.
4. Avito Adapter отправляет обновление.
5. Результат логируется.

### Сценарий 3: Сообщение гостя

1. Гость пишет в Авито.
2. Сообщение попадает в Messaging module.
3. Администратор отвечает из единого inbox.
4. История связывается с гостем/бронью.

## 4. Маппинг

Нужно сопоставить:

- DHP property ↔ Avito listing/account;
- DHP room/apartment ↔ Avito listing;
- DHP rate/price ↔ Avito price calendar;
- DHP availability ↔ Avito calendar.

## 5. Ограничения

Авито может иметь ограничения:

- не все операции доступны через API;
- API может быть доступен только партнерам;
- бронирование может быть представлено как заявка;
- сообщения могут идти через отдельный API;
- некоторые данные придется синхронизировать через партнерского провайдера.

## 6. Требования к данным

Минимальный набор для заявки:

- external_request_id;
- guest name;
- guest phone;
- guest message;
- dates;
- guests count;
- listing id;
- price, если доступна;
- status.

## 7. Ошибки

- avito_auth_failed;
- avito_listing_not_mapped;
- avito_calendar_update_failed;
- avito_message_sync_failed;
- avito_booking_payload_invalid.

## 8. Критерии приемки

- заявка из Авито попадает в DHP;
- маппинг объявления работает;
- availability обновляется или создается задача на ручное обновление;
- сообщения видны в едином inbox, если API доступен;
- ошибки видны в sync log.



---


# ChannelManager/027_Ostrovok_Integration.md

# Интеграция с Островок — спецификация

## 1. Назначение

Документ описывает целевую интеграцию с Островок как OTA-каналом.

Фактический набор методов зависит от партнерского доступа.

## 2. Цели

- выгрузка availability;
- выгрузка rates;
- выгрузка restrictions;
- получение новых бронирований;
- получение изменений;
- получение отмен;
- подтверждение обработки;
- журнал ошибок.

## 3. Маппинг

Обязательный маппинг:

- property;
- room type;
- rate plan;
- meal plan;
- cancellation policy;
- payment policy.

## 4. Availability Sync

DHP отправляет:

- date;
- room type;
- available count;
- stop sell.

## 5. Rate Sync

DHP отправляет:

- date;
- room type;
- rate plan;
- price;
- currency;
- min stay;
- closed to arrival;
- closed to departure.

## 6. Booking Ingestion

При получении брони:

1. проверить external_booking_id;
2. найти property mapping;
3. найти room type mapping;
4. найти rate plan mapping;
5. создать бронь;
6. обновить availability;
7. отправить подтверждение каналу.

## 7. Cancellation

При отмене:

- найти бронь по external_booking_id;
- применить cancellation policy;
- освободить availability;
- обновить каналы;
- записать событие.

## 8. Payment mode

Нужно поддержать варианты:

- оплата гостем в отеле;
- оплата OTA;
- виртуальная карта, если применимо;
- предоплата.

## 9. Ошибки

- ostrovok_auth_failed;
- ostrovok_mapping_not_found;
- ostrovok_rate_sync_failed;
- ostrovok_availability_sync_failed;
- ostrovok_booking_duplicate;
- ostrovok_booking_conflict.

## 10. Критерии приемки

- можно подключить канал;
- можно настроить маппинг;
- availability уходит;
- rates уходят;
- бронь создается;
- отмена обрабатывается;
- ошибки логируются.



---


# ChannelManager/028_Yandex_Travel_Integration.md

# Интеграция с Яндекс Путешествия — спецификация

## 1. Назначение

Документ описывает целевую интеграцию с Яндекс Путешествия.

Фактическая реализация зависит от доступных API и условий партнерства.

## 2. Цели

- синхронизация наличия;
- синхронизация цен;
- синхронизация ограничений;
- прием бронирований;
- прием отмен;
- передача статусов;
- контроль ошибок.

## 3. Данные объекта

Для интеграции требуется сопоставить:

- объект;
- адрес;
- категории номеров;
- тарифы;
- правила отмены;
- питание;
- услуги;
- фотографии, если управление контентом доступно.

## 4. Booking flow

1. Яндекс отправляет бронь.
2. Adapter нормализует payload.
3. Channel Manager проверяет маппинг.
4. PMS создает бронь.
5. Availability уменьшается.
6. DHP отправляет подтверждение.
7. Гость получает коммуникацию согласно правилам канала.

## 5. Availability / Rates

Минимальный payload:

- external_property_id;
- external_room_type_id;
- external_rate_plan_id;
- date;
- available;
- price;
- min_stay;
- stop_sell.

## 6. Особенности

Нужно учитывать:

- отличия модели тарифов;
- отличия модели предоплаты;
- правила передачи персональных данных;
- ограничения по частоте обновлений;
- формат подтверждения брони.

## 7. Ошибки

- yandex_auth_failed;
- yandex_mapping_not_found;
- yandex_rate_sync_failed;
- yandex_inventory_sync_failed;
- yandex_booking_invalid;
- yandex_cancellation_failed.

## 8. Критерии приемки

- канал подключается;
- маппинг настраивается;
- цены и наличие выгружаются;
- бронь принимается;
- отмена принимается;
- ошибки видны.



---


# ChannelManager/029_Sutochno_Integration.md

# Интеграция с Суточно — спецификация

## 1. Назначение

Документ описывает целевую интеграцию с Суточно как каналом продаж для апартаментов и краткосрочной аренды.

## 2. Цели

- синхронизировать календари;
- синхронизировать цены;
- получать бронирования/заявки;
- получать отмены;
- обновлять статусы;
- минимизировать ручную работу.

## 3. Модель размещения

Для Суточно важно поддержать специфику апартаментов:

- объект как отдельная квартира;
- календарь конкретного юнита;
- цена за сутки;
- залог;
- правила заселения;
- доплаты;
- вместимость;
- спальные места.

## 4. Маппинг

- DHP room/apartment ↔ Sutochno listing;
- DHP calendar ↔ Sutochno calendar;
- DHP price ↔ Sutochno daily price;
- DHP restrictions ↔ Sutochno restrictions.

## 5. Booking ingestion

Если канал присылает бронь:

1. найти listing mapping;
2. проверить external_booking_id;
3. проверить даты;
4. создать бронь;
5. обновить availability;
6. создать коммуникацию с гостем;
7. отправить подтверждение.

## 6. Calendar sync

Система должна отправлять:

- available/unavailable dates;
- price per date;
- min stay;
- check-in/out restrictions, если поддерживается.

## 7. Ошибки

- sutochno_auth_failed;
- sutochno_listing_not_mapped;
- sutochno_calendar_sync_failed;
- sutochno_booking_duplicate;
- sutochno_booking_conflict.

## 8. Критерии приемки

- объявление сопоставлено с апартаментом;
- календарь обновляется;
- цена обновляется;
- бронь создается;
- отмена обрабатывается;
- конфликт фиксируется.



---


# Finance/016_Invoices_Payments.md

# Счета, оплаты и возвраты

## 1. Назначение

Финансовый модуль управляет счетами, оплатами, возвратами, депозитами, начислениями, балансом бронирования и платежными интеграциями.

## 2. Основные сущности

- Invoice;
- InvoiceLine;
- Payment;
- PaymentIntent;
- Refund;
- Deposit;
- PaymentMethod;
- FiscalReceipt;
- BalanceTransaction.

## 3. Баланс бронирования

Для каждой брони система должна рассчитывать:

- total_amount;
- paid_amount;
- refunded_amount;
- balance_due;
- deposit_amount;
- loyalty_discount;
- promo_discount;
- ota_commission, если применимо.

## 4. Счет

Счет может включать:

- проживание;
- допуслуги;
- ранний заезд;
- поздний выезд;
- уборку;
- депозит;
- штрафы;
- возвраты.

## 5. Оплаты

Поддерживаемые типы:

- online card;
- bank transfer;
- cash;
- QR/SBP;
- payment by OTA;
- loyalty points;
- certificate;
- manual payment.

## 6. Payment Intent

Перед оплатой создается платежное намерение:

```text
payment.intent_created
```

После успешной оплаты:

```text
payment.succeeded
```

После ошибки:

```text
payment.failed
```

## 7. Возвраты

Возврат может быть:

- полный;
- частичный;
- автоматический;
- ручной;
- согласно правилу отмены;
- по решению менеджера.

## 8. Депозиты

Система должна поддерживать:

- депозит как оплату;
- депозит как холд;
- возврат депозита;
- удержание части депозита;
- привязку к претензии/задаче.

## 9. Фискализация

Для российского рынка предусмотреть интеграцию с:

- онлайн-кассой;
- фискальным регистратором;
- облачной кассой;
- отправкой чеков гостю.

## 10. Критерии приемки

- счет создается;
- платеж привязывается к брони;
- баланс пересчитывается;
- возврат работает;
- депозит учитывается;
- события публикуются;
- финансовые операции логируются.



---


# Housekeeping/017_Housekeeping.md

# Housekeeping

## 1. Назначение

Модуль Housekeeping управляет уборками, статусами номеров, задачами горничных, инспекциями, чек-листами и качеством подготовки номера.

## 2. Статусы номера

- clean;
- dirty;
- inspected;
- in_progress;
- out_of_service;
- do_not_disturb;
- linen_required.

## 3. Источники задач

Задачи housekeeping создаются:

- после check-out;
- перед check-in;
- вручную администратором;
- по запросу гостя;
- по расписанию;
- после инженерных работ;
- после жалобы.

## 4. Типы уборки

- выездная;
- поддерживающая;
- генеральная;
- экспресс;
- уборка после ремонта;
- проверка супервайзером;
- доставка белья;
- замена полотенец.

## 5. Задача уборки

Поля:

- id;
- property_id;
- room_id;
- booking_id;
- task_type;
- priority;
- status;
- assigned_to;
- checklist_id;
- planned_start_at;
- due_at;
- started_at;
- completed_at;
- inspected_at;
- photos;
- comments.

## 6. Workflow

```text
created → assigned → in_progress → completed → inspected → closed
```

Альтернативные статусы:

```text
blocked
rejected
reopened
cancelled
```

## 7. Чек-листы

Чек-лист должен включать:

- входная зона;
- санузел;
- кухня;
- спальня;
- гостиная;
- белье;
- полотенца;
- расходники;
- техника;
- запах;
- повреждения;
- фотофиксация.

## 8. Интеграция с PMS

После check-out:

1. booking.checked_out;
2. room.status = dirty;
3. housekeeping.task_created.

Перед check-in:

- если room not clean — система показывает конфликт;
- если room inspected — заезд разрешен.

## 9. KPI

- среднее время уборки;
- процент уборок вовремя;
- процент возвратов на доработку;
- количество жалоб;
- качество фотофиксации;
- загрузка сотрудников.

## 10. Критерии приемки

- задача создается после выезда;
- горничная видит задачу;
- статус меняется;
- чек-лист заполняется;
- фото добавляются;
- супервайзер принимает уборку;
- номер становится clean/inspected.



---


# Maintenance/018_Maintenance.md

# Инженерные заявки и техническое обслуживание

## 1. Назначение

Модуль Maintenance управляет инженерными заявками, плановыми обходами, авариями, техническими блокировками номеров, профилактикой и паспортами обслуживания.

## 2. Источники заявок

- гость;
- администратор;
- горничная;
- супервайзер;
- инженер;
- плановый обход;
- AI-анализ отзывов;
- датчики/IoT, если применимо.

## 3. Типы заявок

- сантехника;
- электрика;
- мебель;
- замки;
- интернет;
- бытовая техника;
- отопление;
- кондиционер;
- канализация;
- безопасность;
- косметический ремонт;
- авария.

## 4. Приоритеты

- P1 авария;
- P2 критично до заезда;
- P3 важно;
- P4 планово;
- P5 улучшение.

## 5. Workflow

```text
created → assigned → in_progress → waiting_parts → completed → verified → closed
```

Альтернативные:

```text
cancelled
reopened
blocked
```

## 6. Заявка

Поля:

- id;
- property_id;
- room_id;
- booking_id;
- category;
- priority;
- status;
- description;
- photos;
- assigned_to;
- due_at;
- started_at;
- completed_at;
- cost;
- parts_used;
- guest_visible;
- out_of_order_required.

## 7. Техническая блокировка

Если проблема влияет на продажу номера, создается блокировка:

```text
room.blocked
```

После устранения:

```text
room.unblocked
```

Channel Manager должен получить обновление availability.

## 8. Плановые обходы

Система должна поддерживать ежемесячные чек-листы:

- сантехника;
- электрика;
- замки;
- окна;
- двери;
- техника;
- мебель;
- расходники;
- безопасность;
- интернет;
- визуальные дефекты.

## 9. Паспорт технического обслуживания

Для каждого объекта/номера хранить:

- оборудование;
- серийные номера;
- гарантийные сроки;
- регламент обслуживания;
- история ремонтов;
- расходы;
- ответственные;
- фото.

## 10. KPI

- время реакции;
- время устранения;
- повторные заявки;
- аварии;
- стоимость обслуживания;
- количество блокировок;
- влияние на revenue.

## 11. Критерии приемки

- заявку можно создать;
- заявку можно назначить;
- статус меняется;
- фото добавляются;
- номер можно заблокировать;
- блокировка влияет на availability;
- после закрытия availability возвращается;
- есть история обслуживания.



---


# Revenue/019_Revenue_Management.md

# Revenue Management

## 1. Назначение

Модуль Revenue Management помогает управлять ценами, загрузкой, ограничениями, прогнозом спроса и рекомендациями по тарифам.

## 2. Основные метрики

- Occupancy;
- ADR;
- RevPAR;
- Pickup;
- Lead Time;
- Cancellation Rate;
- No-show Rate;
- Direct Share;
- OTA Share;
- Length of Stay;
- Revenue by Channel.

## 3. Источники данных

- бронирования;
- availability;
- цены;
- OTA;
- сайт;
- приложение;
- события в городе;
- конкуренты;
- история прошлых лет;
- праздники;
- школьные каникулы.

## 4. Rate Calendar

Revenue Manager должен видеть:

- загрузку по дням;
- цену по room type;
- min stay;
- stop sell;
- pickup;
- прогноз;
- рекомендации.

## 5. Правила ценообразования

Система должна поддерживать:

- ручное управление;
- шаблоны сезонности;
- правила по загрузке;
- правила по lead time;
- правила по дням недели;
- события;
- минимальную цену;
- максимальную цену;
- канал-специфичную наценку.

## 6. Пример правила

```text
Если occupancy > 80% за 14 дней до даты, увеличить цену на 12%.
Если occupancy < 30% за 7 дней до даты, снизить цену на 8%, но не ниже min_price.
```

## 7. AI Revenue

AI может предлагать:

- поднять цену;
- снизить цену;
- закрыть скидочный тариф;
- увеличить min stay;
- открыть спецпредложение;
- усилить прямой канал.

## 8. Интеграция

При изменении цены публикуется:

```text
rate.changed
```

Channel Manager выгружает изменения в OTA.

## 9. Критерии приемки

- видна загрузка;
- виден ADR/RevPAR;
- можно изменить цену;
- можно задать правило;
- правило применяет цену;
- изменения уходят в Channel Manager;
- рекомендации AI сохраняются.



---


# Database/080_Data_Model_Overview.md

# Обзор модели данных

## 1. Identity

- users;
- roles;
- permissions;
- user_roles;
- api_clients;
- api_tokens.

## 2. Hospitality

- properties;
- buildings;
- floors;
- rooms;
- room_types;
- room_amenities.

## 3. Booking

- bookings;
- booking_guests;
- booking_services;
- booking_status_history;
- booking_notes;
- booking_audit_log.

## 4. Rates

- rate_plans;
- rate_prices;
- restrictions;
- promotions;
- cancellation_policies;
- payment_policies.

## 5. Inventory

- availability;
- room_blocks;
- out_of_order;
- inventory_locks.

## 6. Channel Manager

- channels;
- channel_connections;
- channel_property_mappings;
- channel_room_type_mappings;
- channel_rate_plan_mappings;
- channel_sync_jobs;
- channel_sync_logs;
- channel_bookings.

## 7. Loyalty

- loyalty_accounts;
- loyalty_transactions;
- loyalty_tiers;
- loyalty_rules.

## 8. Payments

- payments;
- payment_methods;
- invoices;
- refunds.

## 9. Multi Tenant

Каждая ключевая таблица должна иметь `tenant_id`.

## 10. Audit

Audit обязателен для:

- bookings;
- guests;
- payments;
- loyalty;
- rates;
- restrictions;
- channel mappings;
- user permissions.



---


# Database/081_Database_Schema_Detailed.md

# Детальная структура базы данных MVP

## 1. Назначение

Документ описывает рекомендуемую структуру таблиц MVP.

Финальная схема может быть преобразована в миграции после выбора технологического стека.

## 2. tenants

| Поле | Тип | Описание |
|---|---|---|
| id | uuid | ID tenant |
| name | text | Название |
| status | text | active/inactive |
| created_at | timestamp | Создан |
| updated_at | timestamp | Обновлен |

## 3. properties

| Поле | Тип | Описание |
|---|---|---|
| id | uuid | ID объекта |
| tenant_id | uuid | Tenant |
| name | text | Название |
| property_type | text | hotel/apartment/mini_hotel |
| address | text | Адрес |
| timezone | text | Таймзона |
| currency | text | Валюта |
| check_in_time | time | Время заезда |
| check_out_time | time | Время выезда |
| status | text | active/inactive |

## 4. room_types

| Поле | Тип | Описание |
|---|---|---|
| id | uuid | ID типа |
| property_id | uuid | Объект |
| name | text | Название |
| base_capacity | int | Базовая вместимость |
| max_capacity | int | Максимальная вместимость |
| description | text | Описание |
| status | text | active/inactive |

## 5. rooms

| Поле | Тип | Описание |
|---|---|---|
| id | uuid | ID номера |
| property_id | uuid | Объект |
| room_type_id | uuid | Тип |
| number | text | Номер/название |
| floor | text | Этаж |
| address | text | Адрес, если апартамент |
| sell_status | text | sellable/not_sellable |
| housekeeping_status | text | clean/dirty/inspected |
| maintenance_status | text | ok/out_of_order |
| lock_id | text | ID замка |
| status | text | active/inactive |

## 6. bookings

| Поле | Тип | Описание |
|---|---|---|
| id | uuid | ID брони |
| tenant_id | uuid | Tenant |
| property_id | uuid | Объект |
| booking_number | text | Номер брони |
| source | text | Источник |
| status | text | Статус |
| arrival_date | date | Дата заезда |
| departure_date | date | Дата выезда |
| room_type_id | uuid | Тип номера |
| room_id | uuid/null | Конкретный номер |
| rate_plan_id | uuid | Тариф |
| adults | int | Взрослые |
| children | int | Дети |
| guest_id | uuid | Основной гость |
| total_amount | numeric | Итого |
| paid_amount | numeric | Оплачено |
| balance_due | numeric | Остаток |
| currency | text | Валюта |
| created_at | timestamp | Создана |
| updated_at | timestamp | Обновлена |

## 7. booking_guests

| Поле | Тип |
|---|---|
| id | uuid |
| booking_id | uuid |
| guest_id | uuid |
| role | text |
| is_primary | boolean |

## 8. guests

| Поле | Тип |
|---|---|
| id | uuid |
| tenant_id | uuid |
| first_name | text |
| last_name | text |
| phone | text |
| email | text |
| birth_date | date |
| created_at | timestamp |

## 9. rate_plans

| Поле | Тип |
|---|---|
| id | uuid |
| property_id | uuid |
| name | text |
| code | text |
| cancellation_policy_id | uuid |
| payment_policy_id | uuid |
| parent_rate_plan_id | uuid/null |
| derived_rule | jsonb |
| status | text |

## 10. rate_prices

| Поле | Тип |
|---|---|
| id | uuid |
| property_id | uuid |
| room_type_id | uuid |
| rate_plan_id | uuid |
| date | date |
| price | numeric |
| currency | text |

Уникальность:

```text
property_id + room_type_id + rate_plan_id + date
```

## 11. restrictions

| Поле | Тип |
|---|---|
| id | uuid |
| property_id | uuid |
| room_type_id | uuid |
| rate_plan_id | uuid |
| date | date |
| min_stay | int |
| max_stay | int |
| stop_sell | boolean |
| closed_to_arrival | boolean |
| closed_to_departure | boolean |

## 12. inventory_locks

| Поле | Тип |
|---|---|
| id | uuid |
| property_id | uuid |
| room_type_id | uuid |
| room_id | uuid/null |
| arrival_date | date |
| departure_date | date |
| status | text |
| expires_at | timestamp |
| idempotency_key | text |
| booking_id | uuid/null |

## 13. room_blocks

| Поле | Тип |
|---|---|
| id | uuid |
| room_id | uuid |
| block_type | text |
| arrival_date | date |
| departure_date | date |
| reason | text |
| status | text |
| created_by | uuid |

## 14. channel tables

### channels

| Поле | Тип |
|---|---|
| id | uuid |
| code | text |
| name | text |
| status | text |

### channel_connections

| Поле | Тип |
|---|---|
| id | uuid |
| tenant_id | uuid |
| channel_id | uuid |
| credentials | encrypted jsonb |
| status | text |

### channel_mappings

Разделить на:

- channel_property_mappings;
- channel_room_type_mappings;
- channel_rate_plan_mappings.

## 15. sync jobs

| Поле | Тип |
|---|---|
| id | uuid |
| channel_id | uuid |
| property_id | uuid |
| job_type | text |
| status | text |
| payload | jsonb |
| response | jsonb |
| error_code | text |
| retry_count | int |
| next_retry_at | timestamp |

## 16. Индексы

Обязательные индексы:

- bookings(property_id, arrival_date, departure_date);
- bookings(status);
- bookings(source);
- rate_prices(property_id, room_type_id, rate_plan_id, date);
- restrictions(property_id, room_type_id, rate_plan_id, date);
- inventory_locks(property_id, room_type_id, arrival_date, departure_date);
- sync_jobs(status, next_retry_at);
- channel_bookings(channel_id, external_booking_id).

## 17. Audit log

Таблица `audit_logs`:

| Поле | Тип |
|---|---|
| id | uuid |
| tenant_id | uuid |
| entity_type | text |
| entity_id | uuid |
| action | text |
| old_value | jsonb |
| new_value | jsonb |
| user_id | uuid |
| source | text |
| created_at | timestamp |



---


# Events/090_Event_Catalog.md

# Каталог событий

## 1. Формат события

```json
{
  "event_id": "uuid",
  "event_type": "booking.created",
  "occurred_at": "2026-07-01T10:00:00Z",
  "tenant_id": "tenant_001",
  "aggregate_id": "booking_123",
  "aggregate_type": "booking",
  "payload": {},
  "metadata": {
    "source": "booking_engine",
    "correlation_id": "uuid"
  }
}
```

## 2. Booking

- booking.created;
- booking.updated;
- booking.confirmed;
- booking.cancelled;
- booking.checked_in;
- booking.checked_out;
- booking.no_show;
- booking.conflict_detected.

## 3. Inventory

- inventory.changed;
- inventory.locked;
- inventory.released;
- room.blocked;
- room.unblocked.

## 4. Rates

- rate.changed;
- restriction.changed;
- rate_plan.created;
- rate_plan.updated;
- promotion.created.

## 5. Payments

- payment.intent_created;
- payment.succeeded;
- payment.failed;
- payment.refunded;
- invoice.created.

## 6. Channel

- channel.sync_requested;
- channel.sync_completed;
- channel.sync_failed;
- channel.booking_received;
- channel.booking_cancelled;
- channel.mapping_error.

## 7. Rules

- events are immutable;
- consumers are idempotent;
- critical events use transactional outbox.



---


# Testing/070_Acceptance_Criteria.md

# Критерии приемки MVP

## 1. Booking Engine

- пользователь может найти доступный номер;
- пользователь может применить фильтры;
- пользователь может применить промокод;
- пользователь может списать баллы;
- цена пересчитывается корректно;
- создается бронь;
- создается платеж;
- отправляется подтверждение.

## 2. PMS

- бронь отображается в шахматке;
- статус можно менять;
- гостя можно добавить;
- счет можно создать;
- платеж можно привязать;
- check-in/check-out работают.

## 3. Channel Manager

- канал можно подключить;
- маппинг можно настроить;
- цены выгружаются;
- наличие выгружается;
- бронь из канала создается;
- отмена обрабатывается;
- ошибки логируются.

## 4. Loyalty

- баллы начисляются;
- баллы списываются;
- лимит списания работает;
- уровень пересчитывается;
- возврат баллов работает.

## 5. Reliability

- повторный запрос не создает дубль брони;
- ошибки интеграций можно повторить;
- овербукинг предотвращается;
- система не теряет события.



---


# Testing/080_Test_Cases_PMS_Channel.md

# Тест-кейсы PMS и Channel Manager

## 1. Booking API

### TC-001 Создание брони

Шаги:

1. Создать property.
2. Создать room type.
3. Создать room.
4. Создать rate plan.
5. Задать цену.
6. Отправить POST /bookings.

Ожидаемый результат:

- бронь создана;
- статус pending_payment или confirmed;
- availability уменьшилась;
- событие booking.created создано.

### TC-002 Повторный Idempotency-Key

Шаги:

1. Отправить POST /bookings с Idempotency-Key.
2. Повторить тот же запрос.

Ожидаемый результат:

- дубль не создан;
- возвращается та же бронь.

### TC-003 Нет availability

Шаги:

1. Создать бронь на единственный room.
2. Попытаться создать вторую бронь на те же даты.

Ожидаемый результат:

- ошибка availability_not_found;
- дубль не создан.

## 2. Availability

### TC-010 Departure date не занимает ночь

Бронь 1–5 августа должна занимать ночи 1,2,3,4 августа.

Ожидаемый результат:

- 5 августа номер доступен для нового заезда.

### TC-011 Inventory lock

Шаги:

1. Создать lock на даты.
2. Проверить availability.
3. Дождаться истечения lock.

Ожидаемый результат:

- availability уменьшается;
- после истечения возвращается.

### TC-012 Maintenance block

Шаги:

1. Создать block на room.
2. Проверить availability.
3. Снять block.

Ожидаемый результат:

- availability уменьшилась;
- после снятия восстановилась;
- создано inventory.changed.

## 3. Rates

### TC-020 Min stay

Шаги:

1. Установить min stay = 2.
2. Запросить quote на 1 ночь.

Ожидаемый результат:

- ошибка restriction_min_stay_failed.

### TC-021 Stop sell

Шаги:

1. Установить stop sell на дату.
2. Запросить quote на период с этой датой.

Ожидаемый результат:

- ошибка stop_sell_active.

### TC-022 Баллы

Шаги:

1. Создать гостя с балансом 10 000 баллов.
2. Создать quote на 40 000.
3. Уровень Gold — лимит списания 20%.
4. Попытаться списать 10 000.

Ожидаемый результат:

- разрешено списать только 8 000.

## 4. Channel Manager

### TC-030 Mapping validation

Шаги:

1. Создать channel connection.
2. Не заполнить room type mapping.
3. Попытаться активировать канал.

Ожидаемый результат:

- активация запрещена;
- ошибка missing_required_mapping.

### TC-031 Rate sync

Шаги:

1. Изменить цену.
2. Проверить sync job.

Ожидаемый результат:

- создан sync job;
- статус success после отправки;
- лог сохранен.

### TC-032 Booking ingestion

Шаги:

1. Отправить normalized booking из OTA.
2. Проверить PMS.

Ожидаемый результат:

- бронь создана;
- external_booking_id сохранен;
- availability уменьшилась.

### TC-033 Duplicate OTA booking

Шаги:

1. Отправить одну и ту же OTA бронь дважды.

Ожидаемый результат:

- создана одна бронь;
- второй запрос идемпотентен.

### TC-034 OTA cancellation

Шаги:

1. Создать OTA booking.
2. Отправить cancellation.

Ожидаемый результат:

- бронь отменена;
- availability возвращена;
- событие booking.cancelled создано.

## 5. Housekeeping

### TC-040 Check-out создает уборку

Шаги:

1. Создать confirmed booking.
2. Выполнить check-in.
3. Выполнить check-out.

Ожидаемый результат:

- room status = dirty;
- создана housekeeping task.

## 6. Maintenance

### TC-050 Out of order

Шаги:

1. Создать инженерную заявку с out_of_order_required.
2. Проверить availability.

Ожидаемый результат:

- room заблокирован;
- availability уменьшилась;
- Channel Manager получил inventory.changed.
