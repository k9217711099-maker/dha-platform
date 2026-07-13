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
