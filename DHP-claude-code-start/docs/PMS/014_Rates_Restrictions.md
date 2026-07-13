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
