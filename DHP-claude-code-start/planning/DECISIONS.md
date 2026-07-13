# DECISIONS.md

# Architecture Decision Records

## ADR-001 — Modular monolith for MVP

Use modular monolith, not microservices.

Reason:

- simpler transactions;
- faster development;
- lower operational complexity;
- easier local development.

## ADR-002 — PostgreSQL is the availability source of truth

Redis may be used for cache/jobs, but final availability checks must use PostgreSQL.

Reason:

- overbooking prevention requires transactional consistency.

## ADR-003 — Idempotency-Key required for booking creation

Every `POST /api/v1/bookings` request must include `Idempotency-Key`.

Reason:

- prevent duplicate bookings from retries, timeouts, OTA resends, and payment callbacks.

## ADR-004 — Channel Manager must use BookingService

OTA bookings must be created through BookingService, not direct DB writes.

Reason:

- same validation;
- same availability rules;
- same audit log;
- same business events.

## ADR-005 — Departure date does not occupy inventory

A booking from 2026-08-01 to 2026-08-05 occupies nights:

- 2026-08-01;
- 2026-08-02;
- 2026-08-03;
- 2026-08-04.

It does not occupy 2026-08-05.

## ADR-006 — Channel sync failures do not block PMS operations

PMS booking creation should commit even if Channel Manager sync fails.

Failed sync jobs must be visible and retryable.

## ADR-007 — Mock OTA adapter first

Build Channel Manager using mock adapters first.

Reason:

- validates architecture;
- enables tests;
- avoids dependency on real partner credentials.
