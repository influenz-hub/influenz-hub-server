# Influenz Hub — API

Express + TypeScript API backing the Influenz Hub web app and (later) the mobile
app. It owns the database and all authentication; clients hold no DB access.

## Setup

```bash
cp .env.example .env      # then fill in the secrets below
npm install
npx prisma generate
npx prisma migrate dev
npm run db:seed
npm run dev               # http://localhost:4000
```

`JWT_ACCESS_SECRET` and `JWT_REFRESH_PEPPER` must each be at least 32 characters.
Generate them with `openssl rand -base64 48`. The server refuses to boot on an
invalid `.env` rather than failing later at runtime.

### Seeded accounts

All use the password `influenz123`:

| Email | Role |
| --- | --- |
| `admin@influenzhub.com` | ADMIN |
| `luna@influenzhub.com` (and 5 other creators) | BUSINESS |
| `shopper@influenzhub.com` | USER |

## Architecture

```
src/
  app.ts                 express app: security middleware, routers, error handler
  index.ts               bootstrap + graceful shutdown
  config/env.ts          Zod-validated environment, fails fast on boot
  middleware/            auth guards, zod validation, error handling
  modules/<domain>/      routes → controller logic → service → prisma
  jobs/                  recommendations + daily stats (cron or one-shot)
  utils/                 ApiError, pagination, slugs
```

**Layering.** Routes declare paths and middleware, handlers deal in HTTP, and
services hold the business logic and are the only layer that touches Prisma.
The cron jobs import services directly rather than calling the API.

**Authorization.** Every owner-scoped mutation re-derives ownership from the
authenticated user id inside the service. Clients pass a resource id, never a
profile or owner id, so a caller can't act on another business by guessing.

## Auth

- **Access token** — JWT, 15 minutes, sent as `Authorization: Bearer <token>`.
- **Refresh token** — opaque random string, 30 days, stored only as an HMAC hash
  and rotated on every use. Tokens are grouped into a "family" per login; if a
  token that was already consumed is presented again, the whole family is
  revoked, since replay means it likely leaked.
- **Providers** — email + password, Google (redirect flow for web, ID-token
  endpoint for mobile), email magic link, and phone OTP.

Without `RESEND_API_KEY` / Twilio credentials, magic links and OTP codes are
written to the server log instead of being sent, so local sign-in still works.
Twilio sending is a documented TODO in `auth.service.ts`.

## API

Base path `/api/v1`. Success responses are `{ data, meta? }`; errors are
`{ error: { code, message, details? } }`. List endpoints are cursor-paginated
via `?cursor=&limit=`.

| Area | Routes |
| --- | --- |
| Auth | `POST /auth/{register,login,refresh,logout}`, `GET /auth/me`, Google/email/phone flows |
| Discovery (public) | `GET /{home,search,creators,stores,products,services,categories}` |
| Detail (public) | `GET /{profiles,stores,products,services}/:slug` |
| Engagement (auth) | `POST /engagement/{likes,follows,comments,views}`, `PUT /engagement/reviews` |
| Business (auth) | `GET|PUT /me/profile`, CRUD under `/me/{stores,products,services,posts}`, `GET /me/{stats,notifications}` |
| Admin (ADMIN) | `/admin/{overview,users,businesses,categories,reports}` |

Public read endpoints accept an optional token and, when present, include viewer
state (`viewerHasLiked`, `viewerIsFollowing`) in the response.

## Background jobs

```bash
npm run job:recs     # rebuild per-user recommendations
npm run job:stats    # roll yesterday's events into DailyStat, purge dead tokens
```

Set `ENABLE_CRON=true` to run both on a schedule inside the API process
(daily-stats 00:15 UTC, recommendations 03:00 UTC). On a single VPS that's the
simplest option; if the API is ever scaled to multiple instances, disable it and
run the one-shot commands from a scheduler instead so they don't fire per
instance.

The recommendation model is deliberately simple and explainable — it scores
unfollowed profiles by category affinity, recency, and popularity. No ML.

## Testing

```bash
npm test        # vitest + supertest smoke suite
npm run build   # tsc
```

Tests run against the seeded development database and cover the auth lifecycle
(including refresh reuse detection), the authorization boundary, and public
reads.
