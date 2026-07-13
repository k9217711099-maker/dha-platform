# Testing/080_Test_Cases_PMS_Channel.md

# Тест-кейсы PMS и Channel Manager

## 1. Booking API

### TC-001 Создание брони

Шаги:

1. Создать property.
2. Создать room type.
3. Создать room.
4. Создать rate plan.
5. Задать цену.
6. Отправить POST /bookings.

Ожидаемый результат:

- бронь создана;
- статус pending_payment или confirmed;
- availability уменьшилась;
- событие booking.created создано.

### TC-002 Повторный Idempotency-Key

Шаги:

1. Отправить POST /bookings с Idempotency-Key.
2. Повторить тот же запрос.

Ожидаемый результат:

- дубль не создан;
- возвращается та же бронь.

### TC-003 Нет availability

Шаги:

1. Создать бронь на единственный room.
2. Попытаться создать вторую бронь на те же даты.

Ожидаемый результат:

- ошибка availability_not_found;
- дубль не создан.

## 2. Availability

### TC-010 Departure date не занимает ночь

Бронь 1–5 августа должна занимать ночи 1,2,3,4 августа.

Ожидаемый результат:

- 5 августа номер доступен для нового заезда.

### TC-011 Inventory lock

Шаги:

1. Создать lock на даты.
2. Проверить availability.
3. Дождаться истечения lock.

Ожидаемый результат:

- availability уменьшается;
- после истечения возвращается.

### TC-012 Maintenance block

Шаги:

1. Создать block на room.
2. Проверить availability.
3. Снять block.

Ожидаемый результат:

- availability уменьшилась;
- после снятия восстановилась;
- создано inventory.changed.

## 3. Rates

### TC-020 Min stay

Шаги:

1. Установить min stay = 2.
2. Запросить quote на 1 ночь.

Ожидаемый результат:

- ошибка restriction_min_stay_failed.

### TC-021 Stop sell

Шаги:

1. Установить stop sell на дату.
2. Запросить quote на период с этой датой.

Ожидаемый результат:

- ошибка stop_sell_active.

### TC-022 Баллы

Шаги:

1. Создать гостя с балансом 10 000 баллов.
2. Создать quote на 40 000.
3. Уровень Gold — лимит списания 20%.
4. Попытаться списать 10 000.

Ожидаемый результат:

- разрешено списать только 8 000.

## 4. Channel Manager

### TC-030 Mapping validation

Шаги:

1. Создать channel connection.
2. Не заполнить room type mapping.
3. Попытаться активировать канал.

Ожидаемый результат:

- активация запрещена;
- ошибка missing_required_mapping.

### TC-031 Rate sync

Шаги:

1. Изменить цену.
2. Проверить sync job.

Ожидаемый результат:

- создан sync job;
- статус success после отправки;
- лог сохранен.

### TC-032 Booking ingestion

Шаги:

1. Отправить normalized booking из OTA.
2. Проверить PMS.

Ожидаемый результат:

- бронь создана;
- external_booking_id сохранен;
- availability уменьшилась.

### TC-033 Duplicate OTA booking

Шаги:

1. Отправить одну и ту же OTA бронь дважды.

Ожидаемый результат:

- создана одна бронь;
- второй запрос идемпотентен.

### TC-034 OTA cancellation

Шаги:

1. Создать OTA booking.
2. Отправить cancellation.

Ожидаемый результат:

- бронь отменена;
- availability возвращена;
- событие booking.cancelled создано.

## 5. Housekeeping

### TC-040 Check-out создает уборку

Шаги:

1. Создать confirmed booking.
2. Выполнить check-in.
3. Выполнить check-out.

Ожидаемый результат:

- room status = dirty;
- создана housekeeping task.

## 6. Maintenance

### TC-050 Out of order

Шаги:

1. Создать инженерную заявку с out_of_order_required.
2. Проверить availability.

Ожидаемый результат:

- room заблокирован;
- availability уменьшилась;
- Channel Manager получил inventory.changed.
