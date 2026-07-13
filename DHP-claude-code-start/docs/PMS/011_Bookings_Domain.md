# PMS/011_Bookings_Domain.md

# Домен бронирований

## 1. Назначение

Booking Domain управляет жизненным циклом бронирования: создание, подтверждение, изменение, отмена, заезд, выезд.

## 2. Источники

- direct_web;
- direct_app;
- ota;
- phone;
- email;
- walk_in;
- bitrix24;
- partner;
- import.

## 3. Жизненный цикл

```text
draft → pending_payment → confirmed → checked_in → checked_out
```

Альтернативные статусы:

```text
cancelled
no_show
conflict
waitlist
```

## 4. Обязательные операции

- create;
- confirm;
- cancel;
- check_in;
- check_out;
- no_show;
- modify_dates;
- modify_room;
- modify_guest;
- add_service;
- add_payment;
- add_note.

## 5. Структура брони

- booking_id;
- booking_number;
- tenant_id;
- property_id;
- room_type_id;
- room_id;
- rate_plan_id;
- arrival_date;
- departure_date;
- nights;
- adults;
- children;
- status;
- source;
- total_amount;
- paid_amount;
- balance_due;
- currency;
- guest_id;
- customer_id;
- created_at;
- updated_at.

## 6. Audit log

Фиксировать:

- user_id;
- source;
- action;
- old_value;
- new_value;
- timestamp.

## 7. Events

- booking.created;
- booking.confirmed;
- booking.updated;
- booking.cancelled;
- booking.checked_in;
- booking.checked_out;
- booking.no_show;
- booking.conflict_detected.
