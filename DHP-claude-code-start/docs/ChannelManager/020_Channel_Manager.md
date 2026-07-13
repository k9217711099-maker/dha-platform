# ChannelManager/020_Channel_Manager.md

# Channel Manager

## 1. Назначение

Channel Manager синхронизирует цены, наличие, ограничения и бронирования между DHP и внешними каналами продаж.

## 2. Каналы

MVP должен учитывать:

- Ostrovok;
- Avito;
- Суточно;
- Яндекс Путешествия;
- Bronevik;
- OneTwoTrip;
- 101Hotels;
- собственный сайт;
- мобильное приложение;
- партнерские каналы.

## 3. Основные функции

- подключение канала;
- маппинг объектов;
- маппинг room types;
- маппинг тарифов;
- выгрузка availability;
- выгрузка prices;
- выгрузка restrictions;
- получение броней;
- получение отмен;
- получение изменений;
- журнал ошибок;
- ручной повтор синхронизации.

## 4. Сущности

- Channel;
- ChannelConnection;
- ChannelPropertyMapping;
- ChannelRoomTypeMapping;
- ChannelRatePlanMapping;
- ChannelSyncJob;
- ChannelSyncLog;
- ChannelBooking;
- ChannelError.

## 5. Критерии приемки MVP

- можно подключить канал;
- можно настроить маппинг;
- можно выгрузить цены;
- можно выгрузить наличие;
- можно получить бронь;
- можно получить отмену;
- можно увидеть ошибку;
- можно повторить sync вручную.
