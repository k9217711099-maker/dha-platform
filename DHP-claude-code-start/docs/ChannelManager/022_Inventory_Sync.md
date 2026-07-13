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
