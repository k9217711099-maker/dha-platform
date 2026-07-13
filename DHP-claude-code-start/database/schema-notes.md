# database/schema-notes.md

Claude Code should create the actual Prisma schema during Sprint 1 based on:

- `docs/Database/081_Database_Schema_Detailed.md`
- `CLAUDE.md`
- `planning/DEVELOPMENT_PLAN.md`
- `planning/TASKS.md`

Important rules:

- Use UUID primary keys.
- Add `tenant_id` to core business tables.
- Use enums for statuses.
- Add `created_at` and `updated_at`.
- Add audit log.
- Add unique constraints for channel booking deduplication later.
- Encrypt external integration credentials later.
