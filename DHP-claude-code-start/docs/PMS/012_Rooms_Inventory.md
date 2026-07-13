# PMS/012_Rooms_Inventory.md

# Номерной фонд и Inventory

## 1. Назначение

Модуль Rooms & Inventory управляет объектами размещения, корпусами, этажами, номерами, апартаментами, типами номеров, статусами доступности, блокировками и техническими ограничениями продаж.

## 2. Поддерживаемые типы объектов

Платформа должна поддерживать:

- классический отель;
- мини-отель;
- бутик-отель;
- апарт-отель;
- отдельные квартиры;
- распределенные апартаменты по разным адресам;
- гибридные объекты.

## 3. Иерархия номерного фонда

```text
Tenant
  ↓
Brand
  ↓
Property
  ↓
Building / Address
  ↓
Floor
  ↓
Room / Apartment
  ↓
Bed / Space, если требуется
```

## 4. Основные сущности

### Property

Объект размещения.

Поля:

- id;
- tenant_id;
- name;
- legal_name;
- property_type;
- address;
- timezone;
- status;
- check_in_time;
- check_out_time;
- currency;
- created_at;
- updated_at.

### RoomType

Категория размещения.

Поля:

- id;
- property_id;
- name;
- description;
- base_capacity;
- max_capacity;
- adults_max;
- children_max;
- area;
- bed_configuration;
- amenities;
- status.

### Room

Конкретный номер или апартамент.

Поля:

- id;
- property_id;
- room_type_id;
- name;
- number;
- floor;
- address;
- status;
- housekeeping_status;
- maintenance_status;
- lock_id;
- is_sellable;
- created_at;
- updated_at.

## 5. Статусы номера

### Операционный статус

- active;
- inactive;
- archived.

### Продажный статус

- sellable;
- not_sellable;
- blocked;
- out_of_order;
- out_of_service.

### Housekeeping status

- clean;
- dirty;
- inspected;
- in_progress;
- do_not_disturb;
- linen_required.

### Maintenance status

- ok;
- minor_issue;
- major_issue;
- out_of_order;
- inspection_required.

## 6. Availability

Availability рассчитывается на уровне:

- room type;
- конкретного room;
- property;
- channel;
- rate plan.

## 7. Блокировки

Система должна поддерживать:

- ручная блокировка;
- техническая блокировка;
- блокировка под ремонт;
- блокировка под собственника;
- блокировка под оплату;
- временная блокировка корзины;
- блокировка из-за уборки;
- блокировка из-за неисправности.

## 8. Inventory Lock

При бронировании из Booking Engine система должна создать временный lock:

```text
inventory.locked
```

Параметры:

- booking_draft_id;
- property_id;
- room_type_id;
- room_id, если выбран конкретный номер;
- date range;
- expires_at;
- idempotency_key.

## 9. Защита от овербукинга

Обязательные механизмы:

- расчет availability внутри транзакции;
- блокировка строк inventory;
- idempotency key;
- запрет двойной продажи одного room_id на пересекающиеся даты;
- проверка после оплаты;
- автоматическая публикация inventory.changed.

## 10. Критерии приемки

- можно создать объект;
- можно создать тип номера;
- можно создать номер;
- можно присвоить room type;
- можно заблокировать номер на даты;
- блокировка уменьшает availability;
- отмена блокировки возвращает availability;
- статусы уборки и ремонта влияют на доступность согласно правилам.
