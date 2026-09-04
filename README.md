# Exhibitor Zone — Backend

Standalone Node.js + Express + MySQL backend for the Exhibitor Zone portal
(auth, companies, events, stalls, catalogue, cart/orders, passes, forms,
notifications, admin panel). Extracted from the Wellness India Expo backend
so it can be integrated into other projects independently.

Own database: `exhi_zone` (migrated from `wellness_india_expo`, same schema
and data as the exhibitor-zone tables there at the time of extraction).

## Setup

```
npm install
cp .env.example .env   # already present; fill in ENCRYPTION_KEY etc. if starting fresh
npm run db:migrate      # creates the exhi_zone database + tables (idempotent)
npm run db:seed         # optional reference-data patch (idempotent)
npm run dev
```

Runs on `PORT` (default `4020`), all routes under `/api/exhibitor-zone/*`.
