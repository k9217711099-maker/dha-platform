# ChannelManager/021_OTA_Mapping.md

# OTA-маппинг

## 1. Назначение

OTA-маппинг связывает внутренние сущности DHP с сущностями внешних каналов продаж.

Без маппинга невозможны:

- выгрузка цен;
- выгрузка наличия;
- прием бронирований;
- обработка отмен;
- аналитика источников.

## 2. Уровни маппинга

### Property Mapping

Связь внутреннего объекта с объектом в канале.

### Room Type Mapping

Связь внутреннего типа номера/апартамента с категорией размещения в OTA.

### Rate Plan Mapping

Связь внутреннего тарифа с тарифом в OTA.

### Restriction Mapping

Связь ограничений:

- min stay;
- max stay;
- closed to arrival;
- closed to departure;
- stop sale.

### Service Mapping

Связь допуслуг:

- завтрак;
- ранний заезд;
- поздний выезд;
- парковка;
- уборка;
- трансфер.

## 3. Требования к интерфейсу

Администратор должен:

- выбрать канал;
- выбрать объект;
- увидеть внутренние room types;
- сопоставить их с внешними room types;
- сопоставить тарифы;
- включить синхронизацию;
- выполнить тестовую выгрузку;
- увидеть ошибки.

## 4. Статусы

- draft;
- active;
- paused;
- invalid;
- error;
- archived.

## 5. Валидация

Проверить:

- внешний объект указан;
- room types указаны;
- rate plans указаны;
- нет дублей;
- все обязательные поля заполнены;
- тестовая выгрузка успешна.

## 6. Ошибки

- external_property_not_found;
- external_room_type_not_found;
- external_rate_plan_not_found;
- duplicate_mapping;
- missing_required_mapping;
- channel_auth_failed;
- channel_api_error.
