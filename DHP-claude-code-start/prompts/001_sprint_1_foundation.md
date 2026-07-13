# Prompt 001 — Sprint 1 Foundation

Read these files first:

- `CLAUDE.md`
- `planning/DEVELOPMENT_PLAN.md`
- `planning/TASKS.md`
- `planning/DECISIONS.md`
- `planning/DEFINITION_OF_DONE.md`
- `docs/000_MVP_Scope.md`
- `docs/Database/081_Database_Schema_Detailed.md`

Start **Sprint 1 only**.

Create a new monorepo for D Hospitality Platform MVP with:

- NestJS backend in `apps/api`;
- PostgreSQL;
- Prisma ORM;
- Redis;
- Docker Compose;
- React + Vite admin frontend in `apps/admin`;
- shared TypeScript package in `packages/shared`.

Implement only:

- tenants;
- users;
- roles;
- user_roles;
- properties;
- room_types;
- rooms.

Add:

- Prisma schema;
- initial migration;
- seed data;
- REST endpoints for properties, room types and rooms;
- basic RBAC structure placeholder;
- health endpoint;
- Jest tests for core services;
- README with local setup commands.

Do not implement:

- bookings;
- availability engine;
- rate engine;
- Channel Manager;
- payments;
- AI;
- mobile app.

Definition of done:

- local environment starts;
- migrations run;
- seed data works;
- API endpoints work;
- tests pass;
- TypeScript compiles;
- summarize changed files, commands run and next steps.
