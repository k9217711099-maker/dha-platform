# PMS/010_PMS_Core.md

# PMS Core

## 1. Назначение

PMS Core управляет объектами, номерным фондом, бронированиями, гостями, заездами, выездами, счетами, оплатами и операционными статусами.

## 2. Сущности

- Property;
- Building;
- Floor;
- Room;
- RoomType;
- RatePlan;
- Booking;
- Guest;
- Invoice;
- Payment;
- Service;
- Task;
- User;
- Role.

## 3. Статусы бронирования

- draft;
- pending_payment;
- confirmed;
- checked_in;
- checked_out;
- cancelled;
- no_show;
- conflict;
- waitlist.

## 4. Создание бронирования

PMS должна поддерживать создание брони из:

- админ-панели;
- API;
- Booking Engine;
- Channel Manager;
- мобильного приложения;
- Bitrix24;
- партнера.

## 5. Проверки перед созданием

- availability;
- restrictions;
- stop-sale;
- min stay;
- capacity;
- price calculation;
- guest validation;
- payment policy.

## 6. Защита от овербукинга

- inventory lock;
- transaction isolation;
- idempotency;
- audit log;
- event publication;
- immediate channel sync.

## 7. Интеграции

PMS публикует события для:

- Channel Manager;
- Loyalty;
- CRM;
- TTLock;
- AI;
- Housekeeping;
- Maintenance;
- Analytics.
