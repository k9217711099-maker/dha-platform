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
