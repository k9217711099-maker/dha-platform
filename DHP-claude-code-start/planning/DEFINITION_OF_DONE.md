# DEFINITION_OF_DONE.md

# Definition of Done

A task is not complete until all applicable items are satisfied.

## Code

- Implementation exists.
- Code is readable and typed.
- Business logic is in services.
- Controllers are thin.
- DTO validation exists.
- Errors are structured.

## Database

- Prisma schema updated.
- Migration added where needed.
- Seed updated where useful.
- Foreign keys and indexes added where needed.
- Enums used for statuses.

## Business rules

- Critical rules from `CLAUDE.md` are respected.
- Booking creation is idempotent.
- Availability rules prevent overbooking.
- Channel Manager does not bypass BookingService.

## Tests

- Unit/service tests added.
- Integration tests added where needed.
- Existing tests still pass.
- If tests cannot be run, explain why.

## Docs

- README updated if setup or commands changed.
- API docs updated if endpoint changed.
- Task result summarized.

## Final report

Include:

1. What was implemented.
2. Files changed.
3. Commands run.
4. Test results.
5. Limitations.
6. Recommended next task.
