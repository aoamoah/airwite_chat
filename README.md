# yɛhyia hyia

Lightweight video conferencing built for real conditions: unreliable connections, expensive mobile data, and phones rather than laptops.

Built for students and study groups, and for churches, fellowships, and prayer groups meeting online.

The product name is always written **yɛhyia hyia** — lowercase, with `ɛ`. Where a technical constraint cannot carry that character, the internal identifier is `yehyia-hyia`.

## Built on LiveKit

The conferencing layer is [LiveKit](https://livekit.io/) — this project began as a fork of [LiveKit Meet](https://github.com/livekit/meet) and continues to use [LiveKit Components](https://github.com/livekit/components-js) for media handling. LiveKit is the technical foundation; yɛhyia hyia is the product.

## Tech stack

- [Next.js](https://nextjs.org/) App Router, React 18, TypeScript
- [@livekit/components-react](https://github.com/livekit/components-js/) for conferencing
- PostgreSQL via [Prisma](https://www.prisma.io/) for administrator accounts and feature settings
- MediaPipe and ONNX Runtime for the experimental AirWrite feature, both loaded only when it is switched on

## Features

- **Annotation** — draw over a shared screen or any camera tile, synchronised across participants.
- **AirWrite** _(experimental)_ — write in the air with your hand. Off by default; enable it in the admin area. It depends on GPU behaviour that varies by browser and is never required for a meeting to work.
- **Admin area** — a separate `/admin` interface decides which features participants see. Technical settings live there, not in the meeting UI.

## Dev setup

1. `pnpm install`
2. Copy `.env.example` to `.env.local` and fill in the values. `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, and `LIVEKIT_URL` are required for meetings; `DATABASE_URL` is required for the admin area.
3. `pnpm db:deploy` to create the database tables.
4. `pnpm admin:create` to create your first administrator account.
5. `pnpm dev`, then open [http://localhost:3000](http://localhost:3000).

Sign in to the admin area at [/admin/login](http://localhost:3000/admin/login) to turn features on and off.

## Scripts

| Command             | What it does                                       |
| ------------------- | -------------------------------------------------- |
| `pnpm dev`          | Development server                                 |
| `pnpm build`        | Production build                                   |
| `pnpm test`         | Unit tests (no database required)                  |
| `pnpm db:migrate`   | Create and apply a migration during development    |
| `pnpm db:deploy`    | Apply existing migrations, for deployment          |
| `pnpm admin:create` | Create or reset an administrator account           |
| `pnpm setup:assets` | Stage the MediaPipe and ONNX assets AirWrite needs |

## Deployment notes

The application runs on Vercel; PostgreSQL is hosted separately on Render.

- Set `DATABASE_URL` and `NEXT_PUBLIC_SITE_URL` in the Vercel project.
- Run `pnpm db:deploy` as part of the release, then `pnpm admin:create` once to seed the first administrator.
- Failed sign-ins are throttled per caller address in PostgreSQL — ten per fifteen minutes — so the limit holds across serverless instances.
- **Known gap:** each serverless instance opens its own database connections. Under concurrency this can exhaust the Postgres connection limit — use a pooler, or cap the pool size explicitly.
