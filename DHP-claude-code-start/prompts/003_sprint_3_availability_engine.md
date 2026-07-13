# Prompt 003 — Sprint 3 Availability Engine

Continue from the existing repository.

Read:

- `docs/PMS/021_Availability_Engine.md`
- `docs/Testing/080_Test_Cases_PMS_Channel.md`

Implement Sprint 3:

- availability search;
- inventory locks;
- room blocks;
- lock TTL;
- expired lock cleanup;
- out_of_order block;
- transaction-safe booking creation update.

Critical tests:

- departure date does not occupy night;
- lock reduces availability;
- expired lock returns availability;
- maintenance block reduces availability;
- double booking is impossible.
