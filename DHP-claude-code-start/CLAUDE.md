# CLAUDE.md

# D Hospitality Platform — Claude Code Development Instructions

You are developing **D Hospitality Platform MVP**.

Your current focus is **PMS Core + Channel Manager MVP** only.

Use this file as the highest-priority project instruction.

## Mission

Build a working MVP foundation for a hospitality platform that can:

- manage properties, room types and rooms;
- create and manage bookings;
- calculate availability safely;
- calculate rates and restrictions;
- prevent overbooking;
- expose REST APIs for PMS and Booking Engine;
- provide Channel Manager core architecture;
- sync rates/availability through mock channel adapters;
- ingest OTA bookings/cancellations through a normalized adapter flow.

## Read before coding

Before starting any implementation task, read:

1. `CLAUDE.md`
2. `planning/DEVELOPMENT_PLAN.md`
3. `planning/TASKS.md`
4. `planning/DECISIONS.md`
5. `planning/DEFINITION_OF_DONE.md`
6. `docs/000_MVP_Scope.md`

For module-specific work, read the relevant files in `docs/PMS`, `docs/ChannelManager`, `docs/Database`, and `docs/Testing`.

If there is a conflict, follow this priority:

1. `CLAUDE.md`
2. `planning/DEVELOPMENT_PLAN.md`
3. `planning/TASKS.md`
4. `planning/DECISIONS.md`
5. `docs/000_MVP_Scope.md`
6. module-specific docs

## Scope boundaries

Implement first:

- PMS foundation;
- bookings;
- availability;
- rate quote engine;
- Channel Manager MVP;
- admin UI basics after backend foundation.

Do **not** implement in the first phase:

- AI modules;
- mobile app;
- marketplace;
- plugin SDK;
- advanced BI;
- advanced revenue management;
- real production OTA API calls;
- complex fiscalization;
- full contact center;
- Kubernetes production deployment;
- microservices.

Prepare interfaces/adapters where needed, but use mock implementations until real credentials and partner API contracts are available.

## Required tech stack

Use:

- Monorepo;
- Backend: NestJS + TypeScript;
- Database: PostgreSQL;
- ORM: Prisma;
- Queue/cache: Redis + BullMQ;
- Admin frontend: React + Vite + TypeScript;
- API: REST;
- API documentation: OpenAPI;
- Auth: JWT;
- Permissions: RBAC;
- Backend tests: Jest;
- E2E tests later: Playwright;
- Local environment: Docker Compose.

Do not change the stack without explicit user approval.

## Architecture

Use **modular monolith** for MVP.

Backend modules:

- AuthModule;
- TenantModule;
- UserModule;
- RoleModule;
- PropertyModule;
- RoomModule;
- BookingModule;
- AvailabilityModule;
- RateModule;
- ChannelManagerModule;
- HousekeepingModule;
- MaintenanceModule;
- AuditModule.

Do not create microservices in MVP.

## Critical business rules

These rules are mandatory:

1. Never allow overbooking.
2. Every booking creation must require `Idempotency-Key`.
3. Availability cache is not a source of truth.
4. PostgreSQL transaction is required for booking creation.
5. Departure date does not occupy a night.
6. Inventory lock must expire automatically.
7. Every critical change must be written to audit log.
8. Channel sync failures must not break PMS booking creation.
9. Channel Manager must use sync jobs and retry states.
10. OTA booking duplicates must be detected by `channel_id + external_booking_id`.
11. Booking price must be calculated by Rate Engine and saved into booking.
12. Quote must be recalculated before booking creation.
13. Technical room block must reduce availability.
14. Check-out must create housekeeping task.
15. Channel Manager adapters must not bypass BookingService or core availability checks.

## Development workflow

Work sprint by sprint.

Start with:

`prompts/001_sprint_1_foundation.md`

Do not start Sprint 2 until Sprint 1 is complete.

For each task:

1. inspect the current repo;
2. identify files to change;
3. implement the smallest complete slice;
4. add or update tests;
5. run typecheck/tests where possible;
6. update README or docs if commands changed;
7. summarize results.

## Code quality rules

- Keep business logic in services, not controllers.
- Use DTOs and validation for all input.
- Use enums for statuses.
- Use Prisma transactions for booking/availability operations.
- Use explicit error codes.
- Use structured API errors.
- Use environment variables for config.
- Do not hardcode credentials.
- Add audit log for critical operations.
- Do not bypass service-layer business rules.
- Prefer simple, readable implementation over premature abstraction.

## Definition of Done

A task is complete only when:

- implementation exists;
- Prisma schema/migration is updated if needed;
- API endpoint works;
- validation exists;
- tests are added or updated;
- TypeScript compiles;
- tests pass or failures are clearly documented;
- README/local setup is updated if needed;
- final summary includes files changed and next step.

## Response format after each task

After each task, report:

1. What was implemented.
2. Files changed.
3. Commands run.
4. Test results.
5. Known limitations.
6. Recommended next task.

Do not claim completion if tests were not run.
