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
