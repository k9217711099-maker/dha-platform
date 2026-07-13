# TASKS.md

# Claude Code Task Backlog

## Sprint 1 — Foundation

### Task 1.1 — Create monorepo

Create:

- `apps/api` — NestJS backend;
- `apps/admin` — React + Vite frontend;
- `packages/shared` — shared types;
- `docker-compose.yml`;
- root `README.md`.

Acceptance criteria:

- dependency install works;
- backend starts;
- frontend starts;
- Docker Compose starts PostgreSQL and Redis.

### Task 1.2 — Backend foundation

Implement:

- NestJS app;
- ConfigModule;
- `GET /health`;
- global validation pipe;
- structured exception filter;
- basic logger.

Acceptance criteria:

- health endpoint works;
- invalid DTO returns structured validation error.

### Task 1.3 — Prisma foundation

Implement Prisma with PostgreSQL.

Models:

- Tenant;
- User;
- Role;
- UserRole;
- Property;
- RoomType;
- Room.

Acceptance criteria:

- Prisma schema exists;
- migration exists;
- seed exists;
- seed creates demo tenant, property, room types and rooms.

### Task 1.4 — Property module

Endpoints:

- `POST /api/v1/properties`;
- `GET /api/v1/properties`;
- `GET /api/v1/properties/:id`;
- `PATCH /api/v1/properties/:id`;
- `DELETE /api/v1/properties/:id`.

Acceptance criteria:

- DTO validation;
- service tests;
- tenant_id included;
- status included.

### Task 1.5 — RoomType module

Endpoints:

- `POST /api/v1/room-types`;
- `GET /api/v1/room-types`;
- `GET /api/v1/room-types/:id`;
- `PATCH /api/v1/room-types/:id`;
- `DELETE /api/v1/room-types/:id`.

Acceptance criteria:

- belongs to property;
- capacity validation;
- service tests.

### Task 1.6 — Room module

Endpoints:

- `POST /api/v1/rooms`;
- `GET /api/v1/rooms`;
- `GET /api/v1/rooms/:id`;
- `PATCH /api/v1/rooms/:id`;
- `DELETE /api/v1/rooms/:id`.

Acceptance criteria:

- belongs to property and room type;
- has sell_status;
- has housekeeping_status;
- has maintenance_status;
- service tests.

## Sprint 2 — Booking Core

### Task 2.1 — Guest module

Models and endpoints for guests.

### Task 2.2 — Booking schema

Models:

- Booking;
- BookingGuest;
- BookingAuditLog;
- IdempotencyKey.

Enums:

- BookingStatus;
- BookingSource;
- PaymentStatus.

### Task 2.3 — Create booking

Implement `POST /api/v1/bookings`.

Rules:

- `Idempotency-Key` required;
- validate dates;
- departure date does not occupy a night;
- audit log created.

### Task 2.4 — Booking lifecycle

Implement:

- list;
- get;
- update;
- cancel;
- check-in;
- check-out;
- no-show.

## Sprint 3 — Availability

### Task 3.1 — Availability search

Endpoint:

- `GET /api/v1/availability/search`

Rules:

- confirmed bookings reduce availability;
- pending_payment bookings reduce availability;
- active locks reduce availability;
- blocks reduce availability.

### Task 3.2 — Inventory locks

Endpoints:

- `POST /api/v1/availability/lock`;
- `POST /api/v1/availability/release`.

Implement TTL and cleanup.

### Task 3.3 — Room blocks

Implement room blocks and out_of_order logic.

## Sprint 4 — Rate Engine

### Task 4.1 — Rate schema

Models:

- RatePlan;
- RatePrice;
- Restriction.

### Task 4.2 — Quote endpoint

Endpoint:

- `GET /api/v1/rates/quote`

Return:

- nightly breakdown;
- stay amount;
- total amount;
- restriction errors.

### Task 4.3 — Restrictions

Implement:

- min stay;
- stop sell;
- closed to arrival;
- closed to departure.

## Sprint 5 — Channel Manager

### Task 5.1 — Channel schema

Models:

- Channel;
- ChannelConnection;
- ChannelPropertyMapping;
- ChannelRoomTypeMapping;
- ChannelRatePlanMapping;
- ChannelSyncJob;
- ChannelSyncLog;
- ChannelBooking.

### Task 5.2 — Mapping API

CRUD endpoints for connections and mappings.

### Task 5.3 — Sync jobs

Implement:

- create sync job;
- process with mock adapter;
- retry;
- dead-letter;
- logs.

### Task 5.4 — Booking ingestion

Endpoint:

- `POST /api/v1/channel-bookings`

Rules:

- normalize payload;
- detect duplicate;
- create booking through BookingService;
- log result.

### Task 5.5 — Cancellation ingestion

Endpoint:

- `POST /api/v1/channel-bookings/:externalId/cancel`
