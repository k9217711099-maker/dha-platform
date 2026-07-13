# Prompt 002 — Sprint 2 Booking Core

Continue from the existing repository.

Read:

- `CLAUDE.md`
- `docs/PMS/011_Bookings_Domain.md`
- `docs/PMS/020_Booking_API_Detailed.md`
- `planning/TASKS.md`

Implement Sprint 2 only:

- guests;
- bookings;
- booking_guests;
- booking audit log;
- idempotency storage;
- booking statuses;
- create booking endpoint;
- list/get booking endpoints;
- update booking endpoint;
- cancel endpoint;
- check-in endpoint;
- check-out endpoint;
- no-show endpoint.

Critical rules:

- `Idempotency-Key` is required for `POST /api/v1/bookings`;
- duplicate `Idempotency-Key` returns the original booking;
- departure date does not occupy a night;
- all critical changes are written to audit log.

Do not implement Channel Manager yet.
Do not implement real payments yet.
