# Prompt 005 — Sprint 5 Channel Manager MVP

Continue from the existing repository.

Read:

- `docs/ChannelManager/020_Channel_Manager.md`
- `docs/ChannelManager/021_OTA_Mapping.md`
- `docs/ChannelManager/022_Inventory_Sync.md`
- `docs/ChannelManager/023_Rate_Sync.md`
- `docs/ChannelManager/024_Booking_Ingestion.md`
- `docs/ChannelManager/025_Channel_Adapter_Spec.md`

Implement Channel Manager MVP:

- channels;
- channel connections;
- property mappings;
- room type mappings;
- rate plan mappings;
- sync jobs;
- sync logs;
- mock channel adapter;
- availability sync job;
- rate sync job;
- booking ingestion endpoint;
- cancellation ingestion endpoint;
- retry states.

Critical rules:

- Channel Manager must create bookings through BookingService;
- duplicate OTA booking is detected by `channel_id + external_booking_id`;
- sync failures are logged and retryable;
- sync failures must not break PMS operations.
