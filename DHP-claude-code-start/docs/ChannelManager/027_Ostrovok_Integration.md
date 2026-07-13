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
