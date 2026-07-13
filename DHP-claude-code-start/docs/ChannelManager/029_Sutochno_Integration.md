# ChannelManager/029_Sutochno_Integration.md

# Интеграция с Суточно — спецификация

## 1. Назначение

Документ описывает целевую интеграцию с Суточно как каналом продаж для апартаментов и краткосрочной аренды.

## 2. Цели

- синхронизировать календари;
- синхронизировать цены;
- получать бронирования/заявки;
- получать отмены;
- обновлять статусы;
- минимизировать ручную работу.

## 3. Модель размещения

Для Суточно важно поддержать специфику апартаментов:

- объект как отдельная квартира;
- календарь конкретного юнита;
- цена за сутки;
- залог;
- правила заселения;
- доплаты;
- вместимость;
- спальные места.

## 4. Маппинг

- DHP room/apartment ↔ Sutochno listing;
- DHP calendar ↔ Sutochno calendar;
- DHP price ↔ Sutochno daily price;
- DHP restrictions ↔ Sutochno restrictions.

## 5. Booking ingestion

Если канал присылает бронь:

1. найти listing mapping;
2. проверить external_booking_id;
3. проверить даты;
4. создать бронь;
5. обновить availability;
6. создать коммуникацию с гостем;
7. отправить подтверждение.

## 6. Calendar sync

Система должна отправлять:

- available/unavailable dates;
- price per date;
- min stay;
- check-in/out restrictions, если поддерживается.

## 7. Ошибки

- sutochno_auth_failed;
- sutochno_listing_not_mapped;
- sutochno_calendar_sync_failed;
- sutochno_booking_duplicate;
- sutochno_booking_conflict.

## 8. Критерии приемки

- объявление сопоставлено с апартаментом;
- календарь обновляется;
- цена обновляется;
- бронь создается;
- отмена обрабатывается;
- конфликт фиксируется.
