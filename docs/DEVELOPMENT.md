# College Adda — developer guide

Deadlines, section timetables, live code-along rooms, people, chats and events for JECRC Jaipur.

## Stack

| Layer    | Tech |
|----------|------|
| Client   | React 19 + TypeScript, Vite, React Router, TanStack Query, Zustand |
| Server   | Node ≥ 24 (runs TypeScript natively), Express 5, `ws`, Zod, built-in `node:sqlite` |
| Shared   | `shared/` — types for the REST API and the websocket protocol |

## Run it

```bash
npm install
npm run seed -w @adda/server   # optional demo data (password: adda-demo-123)
npm run dev                    # API on :3000, web on :5173 (proxied)
```

Production: `npm run build && ADMIN_USERNAMES=you npm start` — one process serves the API, the websocket and the built client.

```bash
npm test          # server integration tests (HTTP + websocket, in-memory DB)
npm run typecheck # server + client
```

## Server layout (`server/src`)

```
config/        env
db/            connection, append-only migrations (PRAGMA user_version)
repositories/  SQL only, row <-> model mapping
services/      business rules and permissions (throw HttpError)
controllers/   parse input with Zod, call a service, send JSON
routes/        URL -> controller, auth + rate limits
middleware/    auth (session cookie), error handler
realtime/      websocket hub, presence, shared room timers, domain event bus
validators/    Zod schemas
```

Services never touch sockets: they emit on `realtime/bus.ts` and the hub pushes to clients.

## Roles and visibility

- **Deadlines** — students' own deadlines are private. Admins can post *official* deadlines to everyone or one section. Done/not-done is per student.
- **Timetables** belong to a section (`branch|year|section`, e.g. `CSE|2|B`). Anyone can browse any section. Official slots are imported and only admins can change them; students can add extra slots to their own section.
- **Admins** are set with `ADMIN_USERNAMES` (applied on every boot).

## Official timetable import

`server/catalog/*.json` is generated from the department's workbook and auto-imported on first boot.

```bash
python3 server/scripts/xlsx_to_timetable.py "<workbook.xlsx>" server/catalog/cse-y2-2026-27.json --branch CSE --year 2 --term "III Sem 2026-27"
npm run import:timetable -w @adda/server   # replaces official slots, keeps student-added ones
```

The current catalog covers B.Tech CSE II year (III sem, Jun–Dec 2026): 36 sections, 720 slots.
