# B2C Escrow MVP Skeleton

Runnable API skeleton for a real-estate workflow app that uses Bitcoin primitives under the hood.

## Quick start

```bash
npm install
npm run dev
```

Server starts at `http://localhost:3000`.
The UI is served at the root URL.

## Database setup (Postgres)

1. Create a database (local Postgres or Docker).
2. Set `DATABASE_URL` (see `.env.example`).
3. Start the server. Tables are created automatically.

## Health check

```bash
curl http://localhost:3000/health
```

## Notes

- This is a non-custodial workflow skeleton. No key material is stored.
- Data is stored in Postgres.
- Endpoints are defined in `src/server.js` and match the MVP spec in `docs/mvp-spec.md`.
