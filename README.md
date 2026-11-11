# Kero309x Bot Audit

A proof harness for auditing WhatsApp booking bots, and a collection of the
audits produced with it.

Every finding in this repository is reproduced by a script that runs the
shipped code against the real database or an isolated temporary copy. The
findings were confirmed by execution, not by reading code alone.

> **Status: harness plus one published audit.** The harness is usable today.
> The `wa-booking-bot` subject is an audited, unfixed system: four critical
> findings, five high, two medium, and two control points. Nothing in the bot
> has been changed; this repository publishes the evidence and the order of
> repair.

## What this is

The bot under audit receives WhatsApp messages through a local OpenWA gateway,
runs a conversation FSM, verifies customer payment against inbound bank and
wallet SMS, and fulfils digital products through a provider API. It keeps its
state in a single SQLite database.

This repository asks one question about any such bot: **which of its safety
properties actually hold, and which do not?** Every answer is a proof.

The repository has two halves:

| | |
|---|---|
| **The harness** | `scripts/` — sixteen proof scripts, a manifest, a configuration layer, and the rules for writing more |
| **The subjects** | `subjects/` and `evidence/` — one audited system per subject, with its narrative and its raw output |

Anyone can run the harness against their own bot and add their subject. See
[Using this harness on your own bot](docs/using-this-harness.md).

## Subjects

| Subject | Findings | Status | Narrative | Raw evidence |
|---|---|---|---|---|
| `wa-booking-bot` — a telecom and digital-goods store | 5 critical · 6 high · 3 medium · 2 control | audited, unfixed | [subjects/wa-booking-bot/](subjects/wa-booking-bot/) | [evidence/wa-booking-bot/](evidence/wa-booking-bot/) |

## The harness at a glance

| ID | Scope | What it finds |
|---|---|---|
| [P01](subjects/wa-booking-bot/findings-critical.md) | template | A free-fulfilment gate that opens on a customer-typed name |
| [P02](subjects/wa-booking-bot/findings-critical.md) | template | An admin retry path that always exits before buying |
| [P03](subjects/wa-booking-bot/findings-critical.md) | template | A webhook that authenticates nothing outside production |
| [P04](subjects/wa-booking-bot/findings-high.md) | configurable | Paid orders with no claim row linking them to a payment |
| [P05](subjects/wa-booking-bot/findings-high.md) | configurable | An atomic payment claim that never consumes the coupon |
| [P06](subjects/wa-booking-bot/findings-high.md) | template | Fuzzy name matching treating two different people as one |
| [P07](subjects/wa-booking-bot/findings-medium.md) | template | A fulfilment check that never runs, on a column that does not exist |
| [P08](scripts/proofs/P08-undeclared-production-dependency.js) | **generic** | Production dependencies that are undeclared or dev-only |
| [P09](scripts/proofs/P09-data-dir-triggers-mock-sends.js) | **generic** | An environment heuristic that silently disables outbound messages |
| [P10](scripts/proofs/P10-stale-lock-pid-blocks-boot.js) | **generic** | A PID lock file that blocks the boot after a machine change |
| [P11](subjects/wa-booking-bot/findings-medium.md) | configurable | A refund that does not return the balance |
| [P12](subjects/wa-booking-bot/findings-controls.md) | configurable | Positive control: the core money-path guards do hold |
| [P13](scripts/proofs/P13-test-and-lint-baseline.js) | **generic** | The test and lint baseline, for measuring any change |
| [P14](subjects/wa-booking-bot/findings-critical.md) | **generic** | Any authenticator that accepts a request with no credential |
| [P15](subjects/wa-booking-bot/findings-high.md) | **generic** | Any SQL column referenced in source but absent from the schema |
| [P16](subjects/wa-booking-bot/findings-medium.md) | **generic** | Errors swallowed in catch blocks and floating promises |

`generic` runs against any bot of this shape with no configuration.
`configurable` runs once the table and column names are set.
`template` is a worked example tied to one bot — read it, then port it.

## The subject in this repository

`wa-booking-bot` is a WhatsApp booking bot for an Egyptian telecom and digital
store, built on a local OpenWA gateway with SQLite for state.

| | |
|---|---|
| Findings published | 16 (5 critical, 6 high, 3 medium, 2 informational) |
| Proofs | 16 executable scripts, all reproduced, 0 errors |
| Live database used | yes, read-only |
| Real customer data published | none — every identifier is pseudonymised |
| Baseline | `npm test` 808 tests / 807 pass / 1 fail; `npm run lint` 0 errors / 200 warnings |

### What is actually sound

The audit does not conclude that the bot is broken. Nineteen of the twenty
guards checked by [P12](evidence/wa-booking-bot/proofs/P12-money-path-guards-that-hold.md)
hold, including the ones that matter most:

- A payment can be claimed by exactly one booking. Two concurrent claims
  against the same trusted payment were executed: one succeeded, one was
  rejected with `PaymentAlreadyClaimed`.
- `payment_claims` carries unique indexes on both `booking_id` and
  `trusted_payment_id`.
- Amount matching tolerance is exactly `0` — no fuzzy amount acceptance.
- Digital fulfilment is claimed atomically via `INSERT OR IGNORE` on a
  primary-keyed table.
- The main webhook signature check is fail-closed and uses `timingSafeEqual`.
- Every WhatsApp send goes through `src/openwa.js`; there is no direct
  `fetch` to the gateway from anywhere else, and every send passes the
  outbound rate limiter.

The failures are specific, not systemic.

### The single most important finding

[P01](evidence/wa-booking-bot/proofs/P01-mina-gate-by-name.md) is the one to
read first. The bot contains a "free fulfilment" path for one specific
customer. The gate that opens it also accepts the customer's own name — a
field the customer types into the chat. The proof runs the shipped function
verbatim, in an isolated VM, and shows that a brand-new chat writing a
matching name passes the gate and reaches `markPaymentVerified({ amount: 0 })`,
which sets the booking to `paid` with `sms_verified = 1`.

[P04](evidence/wa-booking-bot/proofs/P04-paid-without-payment-claim.md) then
corroborates it from the live database: a significant share of the bookings
marked paid with SMS verification have no `payment_claims` row, and most of
those carry the free-fulfilment provider string. The free path is not
hypothetical — it has been used. The exact counts move as the bot runs; the
proof reports the current figures.

### Moving it to a server

[subjects/wa-booking-bot/migration.md](subjects/wa-booking-bot/migration.md)
is the readiness review for the move to Linux. Five things block the first
boot: a Windows PID in the lock file, half the source tree untracked in git,
an encryption key that does not travel with the database, a `DATA_DIR`
heuristic that silently mocks every outbound message, and a webhook URL built
from the bind address. Nineteen more items fail after it starts.

The repair order is in
[subjects/wa-booking-bot/decisions/0004-remediation-order.md](subjects/wa-booking-bot/decisions/0004-remediation-order.md).

## Running the proofs

```bash
cp audit.config.example.json audit.config.json   # once
# edit audit.config.json: point botRepo at your bot
node scripts/proofs/run-all.js
```

Each proof runs in its own process and exits `0` when the defect is present,
`2` when it is absent, `3` when it does not apply to the subject. That
inversion is deliberate: once a defect is fixed, the proof starts failing, and
it becomes the regression test for that fix.

## Repository layout

```
scripts/
  proofs/             the harness — sixteen proofs, a manifest, a config layer
  capture-screenshots.js
  build-findings-docs.js
  leak-scan.js        the pre-publication privacy check
subjects/
  <id>/               one audited system: architecture, findings, decisions
evidence/
  <id>/               one audited system: raw proof output, screenshots, baseline
docs/
  methodology.md      what counts as a finding and what counts as proof
  using-this-harness.md   how to audit your own bot
  decisions/          architecture decision records for the harness
audit.config.example.json
findings.json         the index of published findings
```

## Privacy

The live database contains real customer names, phone numbers, payment
messages and bank receipt images. None of it is published.

- Proofs that read the database emit pseudonyms: a stable short hash of the
  original identifier, so a reader can still see that two rows refer to the
  same customer, without learning who they are.
- Screenshots are taken from a synthetic environment wherever one exists.
- Payment amounts and status values are preserved, because a finding about
  payment matching is not checkable without them.
- `scripts/leak-scan.js` reads every identifier that actually exists in the
  live database and checks it against every text file in this repository. It
  must pass before anything is committed.

See [decision 0002](docs/decisions/0002-redaction.md) for the rule this
follows and its limits.

## Development

- [Using this harness on your own bot](docs/using-this-harness.md)
- [Methodology](docs/methodology.md)
- [Decision records](docs/decisions/)
- [Contributing](CONTRIBUTING.md)

## Licence

GPL-3.0-only. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).

## Not affiliated

This is an independent audit of privately operated systems. It is not
affiliated with, endorsed by, or sponsored by WhatsApp, Meta, OpenWA,
Vodafone, the Egyptian National Bank, DigitalCore, or any other party whose
products or services the audited systems call. Product names are used only to
identify what the audited code talks to.
