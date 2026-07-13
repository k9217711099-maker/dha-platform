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
