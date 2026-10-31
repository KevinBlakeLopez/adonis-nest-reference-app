# adonis-nest-reference-app

A NestJS application with VineJS validation, scrypt password hashing, MikroORM on PostgreSQL, cookie sessions, and CSRF protection.

This repository was exercised with Node.js 24.14.1 and pnpm 12.8.1.

## Requirements

- Node.js `>= 22.17.0`. MikroORM 7.2.6 declares that engine. NestJS 12 itself allows Node.js 20, which is not sufficient here.
- pnpm 12.8.1, the version used with the committed lockfile (`lockfileVersion` 9.0). Install with `pnpm install --frozen-lockfile`.
- PostgreSQL reached through a `postgres://` or `postgresql://` URL. This procedure was run against PostgreSQL 18. The session store's published package documents PostgreSQL 9.5 or newer; that lower bound was not retested here.

Create an empty database before migrating. The examples below use a local server at `127.0.0.1:55440`.

## Environment

| Variable | Required | Used by | Meaning |
| --- | --- | --- | --- |
| `DATABASE_URL` | Always | Server and `pnpm migration:up` | PostgreSQL URL. Startup and migrations reject a missing or non-postgres URL. |
| `SESSION_SECRET` | Server only | Server | Signs the `sid` cookie. At least 32 characters. Never commit it. |
| `NODE_ENV` | No | Server | `development` (default), `test`, or `production`. Any other value fails startup. |
| `PORT` | No | Server | HTTP port. Default `3000`. An integer from 1 to 65535. |
| `TRUST_PROXY` | No | Server | `1` trusts one reverse-proxy hop. `false` or `0` trusts none. Unset means one hop in production and none otherwise. `true` is rejected. |
| `WORKER_POLL_MS` | No | Server | Outbox poll interval in milliseconds, a positive integer. Unset leaves the poller off. |

`pnpm migration:up` reads `DATABASE_URL` only. It does not read `SESSION_SECRET`, `PORT`, `TRUST_PROXY`, or `WORKER_POLL_MS`.

Invalid configuration is printed as a list of variable names and rules. The secret and the database URL are not included in that error.

## Install

```bash
pnpm install --frozen-lockfile
```

This installs development dependencies. `pnpm migration:up` and `pnpm build` need the Nest CLI from those dependencies. Do not use `pnpm install --prod` for the steps below.

## Database setup and migrations

```bash
export DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55440/adonis_nest
pnpm migration:up
```

The command builds the project, then applies pending MikroORM migrations. The first run creates `users`, `session`, `notes`, `orders`, `outbox`, and `dispatches`. A second run prints `No pending migrations`.

Run migrations once, as a deployment step, before starting new instances. Do not run them in every replica. MikroORM does not serialize concurrent migrators. If a run fails while another migrator may have been active, inspect `mikro_orm_migrations` and the schema before running it again. A `23505` error does not by itself mean the other run finished.

Application startup does not migrate. The session store does not create `session`.

## Start

Development:

```bash
export DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55440/adonis_nest
export SESSION_SECRET=replace-with-at-least-32-random-characters
pnpm start:dev
```

Production mode, after `pnpm migration:up` or `pnpm build` has produced `dist/`:

```bash
export NODE_ENV=production
export DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55440/adonis_nest
export SESSION_SECRET=replace-with-at-least-32-random-characters
pnpm start:prod
```

The server listens on port 3000 unless `PORT` is set. `GET /` returns `Hello World!` and does not require a session.

Outside production the `sid` cookie is HTTP-only and `SameSite=Lax`, and it is not `Secure`. In production the cookie is also `Secure`, and it is set only when the request is HTTPS. Behind the one trusted proxy, that means `X-Forwarded-Proto: https`.

Sessions expire after two hours. The PostgreSQL `session.expire` column enforces that lifetime.

## API

Send `Content-Type: application/json`. Send the `sid` cookie returned by the server. Send `X-CSRF-Token` on `POST`, `PATCH`, and `DELETE`. `GET` does not require that header.

A missing or invalid CSRF token is HTTP 403 `{ "message": "Invalid CSRF token" }`. An anonymous call to an authenticated route is HTTP 401 `{ "message": "Authentication required" }`. Vine validation failures are HTTP 422 `{ "statusCode": 422, "errors": [...] }`. Each error has `message`, `rule`, and `field`.

Other errors use Nest's default body, for example `{ "message": "Order not found", "error": "Not Found", "statusCode": 404 }`. The error bodies in this README show only `message`.

### Registration

`POST /users` requires a CSRF token and does not require login.

```bash
curl -c cookies.txt http://127.0.0.1:3000/auth/csrf
```

The body is `{ "csrfToken": "..." }`.

```bash
curl -b cookies.txt -c cookies.txt \
  -H 'content-type: application/json' \
  -H 'x-csrf-token: THE_TOKEN_FROM_THE_PREVIOUS_RESPONSE' \
  -d '{"email":"ada@example.com","password":"correct-horse"}' \
  http://127.0.0.1:3000/users
```

Success is HTTP 201 `{ "id": 1, "email": "ada@example.com" }`. The password must be at least 8 characters. A duplicate email is HTTP 409 `{ "message": "Email is already registered" }`. The response does not include the password hash.

### Login

`POST /auth/login` requires the anonymous session's CSRF token.

```bash
curl -b cookies.txt -c cookies.txt \
  -H 'content-type: application/json' \
  -H 'x-csrf-token: THE_ANONYMOUS_TOKEN' \
  -d '{"email":"ada@example.com","password":"correct-horse"}' \
  http://127.0.0.1:3000/auth/login
```

Success is HTTP 200 `{ "id": 1, "email": "ada@example.com", "csrfToken": "..." }`. Use this new `csrfToken` and the new `sid` cookie for later mutating requests. The anonymous token no longer works. Unknown emails and wrong passwords both return HTTP 401 `{ "message": "Authentication failed" }`.

`GET /auth/me` returns `{ "id": 1, "email": "ada@example.com" }` for that session.

### Logout

`POST /auth/logout` requires the authenticated CSRF token. Success is HTTP 204. The server deletes the session row. A later `GET /auth/me` with the old cookie is HTTP 401.

### Notes

Every notes route requires an authenticated session. Create, update, and delete also require the CSRF token. A note that does not exist, or that belongs to someone else, is HTTP 404 `{ "message": "Note not found" }`.

```bash
curl -b cookies.txt -c cookies.txt \
  -H 'content-type: application/json' \
  -H 'x-csrf-token: THE_LOGIN_TOKEN' \
  -d '{"title":"First","body":"hello"}' \
  http://127.0.0.1:3000/notes
```

Success is HTTP 201:

```json
{ "id": 1, "title": "First", "body": "hello", "createdAt": "...", "updatedAt": "..." }
```

`title` is required, trimmed, and at most 200 characters. `body` is a string. The response does not include `userId`. `GET /notes` lists only the signed-in user's notes, oldest first. `GET /notes/1` returns one owned note.

```bash
curl -b cookies.txt \
  -H 'content-type: application/json' \
  -H 'x-csrf-token: THE_LOGIN_TOKEN' \
  -X PATCH \
  -d '{"title":"Second","body":"changed"}' \
  http://127.0.0.1:3000/notes/1
```

Success is HTTP 200 with the updated note. `curl` does not send `PATCH` unless `-X PATCH` is set.

```bash
curl -b cookies.txt -o /dev/null -w '%{http_code}\n' \
  -H 'x-csrf-token: THE_LOGIN_TOKEN' \
  -X DELETE \
  http://127.0.0.1:3000/notes/1
```

`DELETE` returns HTTP 204.

### Orders

Every orders route requires an authenticated session. `POST /orders` also requires the CSRF token and an `Idempotency-Key` header of 1 to 255 characters.

```bash
curl -b cookies.txt -c cookies.txt \
  -H 'content-type: application/json' \
  -H 'x-csrf-token: THE_LOGIN_TOKEN' \
  -H 'idempotency-key: order-1' \
  -d '{"sku":"widget","quantity":2}' \
  http://127.0.0.1:3000/orders
```

Success is HTTP 201:

```json
{ "id": 1, "sku": "widget", "quantity": 2, "createdAt": "..." }
```

`sku` is 1 to 200 characters and is not trimmed. `quantity` is an integer of at least 1. A missing `Idempotency-Key` is HTTP 422. The response does not include `userId`.

HTTP 201 means the order and its outbox row committed in one transaction. The response does not wait for dispatch. The same user sending the same `Idempotency-Key` again gets HTTP 200 with the stored order, including its original `sku` and `quantity`, even if the new body differs. No second order or outbox row is created. Keys are scoped to the user.

If a database statement in that transaction throws, the transaction rolls back and the request fails with HTTP 500. No order or outbox row remains. A duplicate key is the one error the service handles, and it reads the stored order only after the rollback. This depends on MikroORM 7.2.6, which rejects a `COMMIT` that PostgreSQL answers with `ROLLBACK` ([mikro-orm/mikro-orm#8499](https://github.com/mikro-orm/mikro-orm/pull/8499)), where 7.2.5 reported that commit as success.

`GET /orders/1` returns the order with `"dispatch": "pending"` or `"dispatch": "done"`. An order that does not exist, or that belongs to someone else, is HTTP 404 `{ "message": "Order not found" }`.

### Dispatch

Dispatching an outbox row inserts a `dispatches` row and sets `outbox.processed_at` in one transaction. It does not send email or call another service.

The server dispatches only when `WORKER_POLL_MS` is set. It then polls in the same process. Each poll dispatches rows, oldest first, until none is free, and the next poll starts after that one finishes. Each claim locks its row with `FOR UPDATE SKIP LOCKED`, so several instances can poll one database without dispatching a row twice. A claim that does not commit leaves the row pending. With `WORKER_POLL_MS` unset, orders stay `pending`.

On `SIGTERM` or `SIGINT` the server stops polling, waits for a claim in progress to commit, then closes its database connections and exits. A process killed without a signal it can handle, such as `SIGKILL`, leaves that claim uncommitted and its row pending.

Polling does not migrate. Run `pnpm migration:up` before starting instances that serve orders.

## Tests

Unit tests do not need PostgreSQL:

```bash
pnpm test
```

PostgreSQL integration tests need `DATABASE_URL`. `vitest.config.e2e.ts` supplies a test-only `SESSION_SECRET`. Several integration tests run `drop schema if exists public cascade` against that database. Point `DATABASE_URL` at a disposable database.

```bash
export DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55440/adonis_nest_test
pnpm test:e2e
```

## Production

`SESSION_SECRET` must be at least 32 characters and must not be committed. Changing it invalidates existing session cookies.

Terminate HTTPS at one reverse proxy. Forward `X-Forwarded-Proto: https` and the public `Host` header. The origin check compares `Origin` with `Host`. It does not use `X-Forwarded-Host`.

In production the process sets Express `trust proxy` to `1`. That trusts `X-Forwarded-Proto` from whoever can connect to the Node port. Do not expose that port except to the proxy. `TRUST_PROXY=false` turns the hop off. The `Secure` cookie stays enabled, so proxied HTTP requests will not receive a session cookie. `TRUST_PROXY=1` outside production opts into the same hop. `TRUST_PROXY=true` is rejected.

## Known limitations

- Fetch Metadata CSRF allows a request that sends neither `Sec-Fetch-Site` nor `Origin`. The session token is what rejects a mutating request from a non-browser client.
- A route registered directly on Express, outside a Nest controller, does not pass the CSRF guard or the authentication guard.
- Login is not rate-limited.
- Concurrent `pnpm migration:up` processes are not serialized. Do not treat PostgreSQL `23505` as success.
- `connect-pg-simple` 10.0.0 was last published on 13 September 2024. Expiration behavior was checked against that published source and against this application's tests.
- Session-secret rotation is not implemented. Replacing `SESSION_SECRET` signs out every user.
- The `Secure` cookie and proxy headers were tested with `X-Forwarded-Proto` on an HTTP test server, not through a separate TLS proxy.
