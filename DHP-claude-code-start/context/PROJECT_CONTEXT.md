# PROJECT_CONTEXT.md

# D Hospitality Platform Context

The product is for a hospitality management company operating apartments, mini-hotels and boutique hotels.

Primary MVP goal:

- build PMS Core;
- build safe booking and availability logic;
- build rate quote logic;
- build Channel Manager MVP architecture.

The system is inspired by products such as TravelLine/Bnovo/Mews/Cloudbeds, but MVP must not copy their full enterprise scope.

Key strategic requirement:

The platform must support direct booking creation through its own API:

```http
POST /api/v1/bookings
```

Core product rule:

The platform itself owns bookings, availability, guests and rates.
Channel Manager is an integration layer, not the source of truth.
