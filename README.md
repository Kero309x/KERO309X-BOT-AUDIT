# Kero309x Bot Audit

An independent, evidence-backed audit of `wa-booking-bot` — a WhatsApp booking
bot for an Egyptian telecom and digital-goods store — together with the proof
harness that reproduces every finding, and a readiness review for moving the
bot from Windows to a Linux server.

> **Status: audited, not remediated.** Every finding below is reproduced by a
> script in `scripts/proofs/` that runs against the real database and the real
> source. The findings were confirmed by execution, not by reading code alone.
> No fix has been applied to the bot yet; this repository publishes the
> evidence and the recommended order of repair.

## What this is

The bot under audit receives WhatsApp messages through a local OpenWA gateway,
runs a 28-state conversation FSM, verifies customer payment against inbound
bank and wallet SMS, and fulfils digital products through a provider API. It
keeps its state in a single SQLite database.

This repository answers one question: **which of its safety properties actually
hold, and which do not?** Each answer is a proof.

| | |
|---|---|
| Findings published | 13 (4 critical, 5 high, 2 medium, 2 informational) |
| Proofs | 13 executable scripts, 13/13 reproduced, 0 errors |
| Live database used | yes, read-only |
| Real customer data published | none — every identifier is pseudonymised |
| Baseline captured | `npm test` 808 tests / 807 pass / 1 fail; `npm run lint` 0 errors / 200 warnings |

## How to read this

A finding is not a paragraph. It is an ID, a severity, a claim, a reproduction,
an impact, and a fix. Every finding has a proof file that contains the raw
output of the reproduction.

| ID | Severity | Finding | Proof |
|---|---|---|---|
| [P01](docs/findings/01-critical.md) | critical | A free-fulfilment gate opens on a name the customer types | [proof](evidence/proofs/P01-mina-gate-by-name.md) |
| [P02](docs/findings/01-critical.md) | critical | The admin "re-buy digital product" path always exits before buying | [proof](evidence/proofs/P02-digitalcore-rebuy-type-mismatch.md) |
| [P03](docs/findings/01-critical.md) | critical | The bank-SMS webhook authenticates nothing outside production | [proof](evidence/proofs/P03-sms-webhook-fail-open.md) |
| [P10](docs/findings/01-critical.md) | critical | A Windows PID in the lock file prevents the bot booting on Linux | [proof](evidence/proofs/P10-stale-lock-pid-blocks-boot.md) |
| [P04](docs/findings/02-high.md) | high | Paid bookings exist with no `payment_claims` row linking them to a payment | [proof](evidence/proofs/P04-paid-without-payment-claim.md) |
| [P05](docs/findings/02-high.md) | high | The atomic payment claim never consumes the coupon | [proof](evidence/proofs/P05-coupon-not-consumed-on-atomic-claim.md) |
| [P06](docs/findings/02-high.md) | high | Fuzzy name matching treats `محمد` and `احمد` as the same person | [proof](evidence/proofs/P06-name-fuzzy-match-collides.md) |
| [P08](docs/findings/02-high.md) | high | Production dependencies are undeclared or dev-only | [proof](evidence/proofs/P08-undeclared-production-dependency.md) |
| [P09](docs/findings/02-high.md) | high | Moving `DATA_DIR` silently turns every outbound message into a mock | [proof](evidence/proofs/P09-data-dir-triggers-mock-sends.md) |
| [P07](docs/findings/03-medium.md) | medium | Digital activation verification never runs and its query names a missing column | [proof](evidence/proofs/P07-followups-digital-activation-dead.md) |
| [P11](docs/findings/03-medium.md) | medium | Refunding a wallet-paid booking does not return the balance | [proof](evidence/proofs/P11-refund-does-not-restore-wallet.md) |
| [P12](docs/findings/04-verified-guardrails.md) | info | Positive control: the core money-path guards do hold | [proof](evidence/proofs/P12-money-path-guards-that-hold.md) |
| [P13](docs/findings/04-verified-guardrails.md) | info | Baseline: test suite and lint state | [proof](evidence/proofs/P13-test-and-lint-baseline.md) |

## What is actually sound

The audit does not conclude that the bot is broken. Nineteen of the twenty
guards checked by [P12](evidence/proofs/P12-money-path-guards-that-hold.md)
hold, including the ones that matter most:

- A payment can be claimed by exactly one booking. Two concurrent claims
  against the same trusted payment were executed: one succeeded, one was
  rejected with `PaymentAlreadyClaimed`.
- `payment_claims` carries unique indexes on both `booking_id` and
  `trusted_payment_id`.
- Amount matching tolerance is exactly `0` — no fuzzy amount acceptance.
- Digital fulfilment is claimed atomically via `INSERT OR IGNORE` on a
  primary-keyed table.
- The main webhook signature check is fail-closed and uses
  `timingSafeEqual`.
- Every WhatsApp send goes through `src/openwa.js`; there is no direct
  `fetch` to the gateway from anywhere else, and every send passes the
  outbound rate limiter.

The failures are specific, not systemic.

## The single most important finding

[P01](evidence/proofs/P01-mina-gate-by-name.md) is the one to read first. The
bot contains a "free fulfilment" path for one specific customer. The gate
that opens it also accepts the customer's own name — a field the customer
types into the chat. The proof runs the shipped function verbatim, in an
isolated VM, and shows that a brand-new chat writing `mina ramses` passes the
gate and reaches `markPaymentVerified({ amount: 0 })`, which sets the booking
to `paid` with `sms_verified = 1`.

[P04](evidence/proofs/P04-paid-without-payment-claim.md) then corroborates it
from the live database: of 53 bookings marked paid with SMS verification, 18
have no `payment_claims` row, and 14 of those 18 carry the free-fulfilment
provider string. The free path is not hypothetical — it has been used.

## Running the proofs

The proofs need the bot's source tree and its SQLite database. They never
write to either: the database is opened read-only, and the three proofs that
need to exercise a write path build an isolated temporary database instead.

```bash
# against a bot checkout
export BOT_REPO=/path/to/wa-booking-bot
node scripts/proofs/run-all.js
```

Each proof runs in its own process and exits `0` when the defect is present,
`2` when it is absent. That inversion is deliberate: once a defect is fixed,
the proof starts failing, and it becomes the regression test for that fix.

To capture the admin panel:

```bash
node scripts/capture-screenshots.js
```

The screenshots come from the project's own sandbox environment, which runs on
synthetic data only. No screenshot in this repository contains a real customer.

## Repository layout

```
docs/
  architecture/       how the bot is put together
  decisions/          architecture decision records for this audit
  findings/           the findings, grouped by severity
  migration/          Windows to Linux readiness review
  methodology.md      how a finding is produced and what counts as proof
evidence/
  proofs/             one Markdown report per finding, with raw output
  screenshots/        admin panel captures from the synthetic sandbox
  baseline/           captured `npm test` and `npm run lint` output
  findings.json       machine-readable index
scripts/
  proofs/             the proof harness
  capture-screenshots.js
  run-all.js
findings.json         the same index at the repository root, for indexing tools
```

## Privacy

The live database contains real customer names, phone numbers, payment
messages and bank receipt images. None of it is published here.

- Proofs that read the database emit pseudonyms: a stable short hash of the
  original identifier, so a reader can still see that two rows refer to the
  same customer, without learning who they are.
- Screenshots are taken from `sandbox/`, a synthetic environment in the bot's
  own repository with three invented customers.
- Payment amounts and status values are preserved, because a finding about
  payment matching is not checkable without them.

See [decision 0002](docs/decisions/0002-redaction.md) for the rule this follows.

## Development

- [Methodology](docs/methodology.md)
- [Architecture](docs/architecture/overview.md)
- [Decision records](docs/decisions/)
- [Contributing](CONTRIBUTING.md)

## Licence

GPL-3.0-only. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).

## Not affiliated

This is an independent audit of a privately operated bot. It is not affiliated
with, endorsed by, or sponsored by WhatsApp, Meta, OpenWA, Vodafone, the
Egyptian National Bank, DigitalCore, or any other party whose products or
services the audited system calls. Product names are used only to identify
what the audited code talks to.
