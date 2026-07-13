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
