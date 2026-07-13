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
