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
