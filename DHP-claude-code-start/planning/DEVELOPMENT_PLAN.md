# DEVELOPMENT_PLAN.md

# D Hospitality Platform MVP — Claude Code Development Plan

## Goal

Build a working MVP foundation for D Hospitality Platform, focused on PMS and Channel Manager.

The product must support:

- properties, room types, rooms;
- booking lifecycle;
- availability calculation;
- safe inventory locks;
- rate quote calculation;
- Channel Manager mappings;
- sync jobs;
- mock OTA adapter;
- OTA booking ingestion.

## Sprint 1 — Project Foundation

Objective: create the monorepo and foundation.

Scope:

- NestJS backend;
- PostgreSQL;
- Prisma;
- Redis;
- Docker Compose;
- global validation;
- structured errors;
- health endpoint;
- React + Vite admin app;
- tenants, users, roles, user_roles, properties, room_types, rooms;
- CRUD for properties, room types and rooms.

Do not implement bookings, availability, rates or Channel Manager yet.

Exit criteria:

- app starts locally;
- migrations run;
- seed works;
- tests pass;
- README explains local setup.

## Sprint 2 — PMS Booking Core

Scope:

- guests;
- bookings;
- booking_guests;
- booking audit logs;
- booking statuses;
- create/update/cancel;
- check-in;
- check-out;
- no-show.

Critical rules:

- `Idempotency-Key` required for `POST /api/v1/bookings`;
- duplicate idempotency key returns original result;
- departure date does not occupy a night;
- booking mutations create audit logs.

## Sprint 3 — Availability Engine

Scope:

- availability search;
- inventory_locks;
- room_blocks;
- lock TTL;
- expired lock cleanup;
- out_of_order blocks;
- transaction-safe booking creation;
- overbooking tests.

Critical tests:

- departure date logic;
- lock reduces availability;
- expired lock releases availability;
- technical block reduces availability;
- double booking is impossible.

## Sprint 4 — Rate Calculation Engine

Scope:

- rate_plans;
- rate_prices;
- restrictions;
- quote endpoint;
- nightly breakdown;
- min stay;
- stop sell;
- closed to arrival;
- closed to departure.

## Sprint 5 — Booking API Readiness

Scope:

- search + quote + lock + booking flow;
- pending_payment booking status;
- payment intent placeholder;
- loyalty redemption placeholder;
- confirmation placeholder.

## Sprint 6 — Channel Manager MVP

Scope:

- channels;
- channel_connections;
- channel_property_mappings;
- channel_room_type_mappings;
- channel_rate_plan_mappings;
- sync_jobs;
- sync_logs;
- adapter interface;
- mock OTA adapter;
- availability sync;
- rate sync;
- booking ingestion;
- cancellation ingestion;
- retry states.

Critical rules:

- Channel Manager uses BookingService for booking creation;
- Channel Manager does not bypass availability rules;
- duplicate OTA bookings are detected;
- sync failures are logged and retryable.

## Sprint 7 — Admin UI MVP

Scope:

- dashboard;
- property list;
- room type list;
- room list;
- bookings list;
- booking card;
- create booking form;
- basic calendar/shakhmatka;
- rate calendar placeholder;
- channel mappings;
- sync job logs.

## Sprint 8 — Operations MVP

Scope:

- housekeeping tasks;
- maintenance tasks;
- room housekeeping status;
- room maintenance status;
- check-out creates housekeeping task;
- maintenance block affects availability.

## Sprint 9 — Hardening

Scope:

- API docs;
- E2E tests;
- seed scenarios;
- error hardening;
- logging;
- README;
- demo checklist.
