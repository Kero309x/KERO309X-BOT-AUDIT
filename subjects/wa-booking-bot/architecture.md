# Architecture of the audited system

This is the map of `wa-booking-bot` as it is built today, recorded so that the
findings can be read in context. Every statement is sourced from the code.

## Stack

| Layer | Choice |
|---|---|
| Runtime | Node.js ≥ 20, CommonJS, `'use strict'` everywhere, no framework |
| HTTP | Express 4, bound to `127.0.0.1:3000` behind a reverse proxy |
| Storage | SQLite via `better-sqlite3`, WAL mode, foreign keys on, `busy_timeout` 15 s |
| Dependencies | `better-sqlite3`, `dotenv`, `express` — three, and only three |
| Gateway | Local OpenWA instance over HTTP on `127.0.0.1:2785` |
| External | httpSMS (bank SMS), DigitalCore (digital goods), Vodafone, Gemini, Telegram |
| OCR | Tesseract (`ara+eng`) on Linux, `Windows.Media.Ocr` on Windows |
| Speech | `speech_recognition` via Google STT, driven by `src/transcribe.py` |

The dependency count is a deliberate strength: three runtime dependencies, no
ORM, no bundler, no transpiler. [P08](../../evidence/wa-booking-bot/proofs/P08-undeclared-production-dependency.md)
is the one place where that discipline was broken.

## Size

| | |
|---|---|
| `src/` files | 93 |
| `src/` lines | ~58,800 |
| Largest file | `src/flow.js` — 10,709 lines |
| Test files | 93, ~25,400 lines, 808 tests |
| Admin sub-routers | 17 under `src/admin/routes/` |

`src/flow.js` is the concentration risk. It holds the conversation FSM, the
owner's command surface, the receipt pipeline and the delivery logic in one
file. The audit's recommendations are deliberately *not* "rewrite it" — the
money path works and a rewrite would put that at risk. The recommendation is
to split it along the seams that already exist.

## Startup

`src/server.js` is the only entry point. On boot:

1. `src/config.js` loads `.env` from a path derived from `__dirname`, not from
   the working directory.
2. `require('./store').init()` opens the database and applies all DDL.
3. The Express app is built: security headers and a request id on every
   response, then the routes.
4. `main()` performs strict startup checks — `ADMIN_CHAT_ID`, `ADMIN_PASS`,
   `HTTPSMS_API_KEY` when SMS verification is on, and in production
   `OPENWA_WEBHOOK_SECRET` and `ADMIN_SESSION_SECRET`. A missing value in
   production exits rather than starting degraded.
5. A single-instance lock is taken at `DATA_DIR/bot.lock` containing the PID.
   If the PID is alive the process exits with code 2.
6. `app.listen(config.port, config.host)` — `HOST` defaults to `127.0.0.1`.
7. Background timers start: webhook draining every 60 s, SMS polling every
   90 s, follow-ups every minute, the daily digest at 22:00 Cairo, a nightly
   backup at 21:30 Cairo, a session health check every 60 s, a six-hourly
   prune, and a DigitalCore balance check every 60 minutes.
8. `SIGINT`/`SIGTERM` stop the timers, close the database and exit.

## Inbound path

```
OpenWA ──POST /webhook──► verifySignature (HMAC-SHA256, timingSafeEqual, fail-closed)
                          rate limit 120 req/min per IP
                          anti-replay: events older than 30 min are ignored
                          dedupe key: idempotencyKey → deliveryId → msg:<id> → hash
                          ──► store.insertWebhookEvent  ──► 200 immediately
                                     │
                                     ▼  (every 60 s, batches of 20, max 3 attempts)
                               drainWebhookEvents
                                     │
                                     ▼
                               routeEvent ──► flow.handleInbound
                                     │
                                     ▼
                          queue.enqueueInbound (per-chat debounce 750 ms)
                                     │
                                     ▼
                          resolveInboundMessages (merge, clarify, serialise)
                                     │
                                     ▼
                          processMessage → the 28-state FSM
                                     │
                                     ▼
                          queue → openwa.sendText / openwa.reply
```

The "save then reply" shape is correct: the webhook acknowledges with 200
after persisting the event, and processing happens later with retry. A
transport failure during processing marks the event `failed` and it is
rescheduled, up to three attempts.

## Outbound path

`src/queue.js` owns everything that talks to WhatsApp:

- **Circuit breaker** — `CLOSED`/`OPEN`/`HALF_OPEN`. Trips on 429, 403, or a
  `session.restriction` webhook event. Notifies the owner when it trips.
- **Outbound rate limiter** — a global per-minute ceiling, a minimum
  interval per chat with human jitter, and adaptive backpressure above 70 % of
  the ceiling.
- **Typing simulation** — 70 % proportional to message length plus 30 %
  random, clamped between 1.2 s and 5 s.

`src/openwa.js` is the only module that calls the gateway. Every
`sendText`/`reply` acquires a rate-limiter slot first. There is no direct
`fetch` to the gateway anywhere else in the tree.

## Conversation FSM

28 states, defined in `src/chats.js`, persisted per chat in the `chats` table
as a state name plus a JSON draft and a JSON extra. The dispatch is one large
`switch (state.state)` in `processMessage`, with a second switch in `goBack`
to rebuild the previous screen.

```
idle/main → network → package → quantity → requirements → name
          → whatsapp → phone → [vodafone auth + OTP]
          → payment_method → [coupon offer → coupon input] → confirm → payment
          → [payment clarify] → [view booking] → [booking action] → [paid actions]
```

## Storage

Thirty-four tables. The ones that carry the money-path guarantees:

| Table | Role | Guarantee |
|---|---|---|
| `trusted_payments` | every inbound bank/wallet SMS, with a fingerprint and a claim status | `fingerprint` is `UNIQUE` |
| `payment_claims` | the link between a trusted payment and a booking | `UNIQUE` on `booking_id` and on `trusted_payment_id` |
| `bookings` | the order | `UNIQUE` index on `sms_ref_norm`, the normalised SMS reference |
| `digital_orders` | the digital fulfilment claim | `booking_id` is the primary key |
| `coupon_redemptions` | a coupon held against a booking | status `reserved` → `redeemed` / `released` |

`AMOUNT_TOLERANCE` is `0`. Payment matching is exact on amount, and a
reference match requires at least 8 characters.

## Where the findings live in this map

| Finding | Map location |
|---|---|
| P01 | FSM, the `NAME` state and the free-fulfilment gate in `src/flow.js` |
| P02 | admin router `src/admin/routes/digitalcore.js`, the retry-purchase path |
| P03 | `src/payment_verifier.js`, the SMS webhook authenticator |
| P04 | `src/bookings.js` `markPaymentVerified`, which bypasses the atomic claim |
| P05 | `src/store.js` `claimPaymentAtomically`, which does not run coupon side effects |
| P06 | `src/httpsms.js` `namesMatchCrossScript`, used by the `AMOUNT_AND_NAME` matcher |
| P07 | `src/followups.js` `verifyBookingActivation`, the digital branch |
| P08 | `src/we_api.js`, the Playwright import |
| P09 | `src/openwa.js` `isTestEnvironment`, the DATA_DIR heuristic |
| P10 | `src/server.js`, the single-instance lock |
| P11 | `src/refunds.js` `setStatus`, the admin refund path |
| P14 | `src/payment_verifier.js`, the same authenticator as P03 — found by the generic scan |
| P15 | `src/followups.js:585`, the same query as P07 — found by the generic schema check |
| P16 | scattered: empty catches across `src/`, concentrated in the admin routes |
