# 0004 — Repairs are ordered by what stops the bot from running, then by money

- **Status:** accepted
- **Date:** 2026-11-11

## Context

Thirteen findings were published. They do not compete for attention equally:
one of them stops the bot from booting at all on the target server, one lets
a stranger take a product for free, and the rest sit at various depths below
that.

Applying them in severity order alone would put a free-product bypass ahead
of a boot failure — which is defensible on a running system and wrong on a
system that is about to be moved onto a server it cannot start on.

There is also a dependency structure between the findings that severity does
not capture. P09 (`DATA_DIR` silently mocks every outbound message) is a
one-line fix, but it is a one-line fix to a heuristic that several other parts
of the system rely on. P12's positive control has to be re-run after any
change to the payment path, because it is the thing that would notice the
change breaking a guarantee.

## Decision

The repair order is:

**Stage 0 — the bot does not start.** [P10](../../../evidence/wa-booking-bot/proofs/P10-stale-lock-pid-blocks-boot.md).
The lock check trusts a bare PID. Until it verifies process identity, the bot
cannot be moved onto a server, and every other fix is unverifiable in
production conditions. The staging directory also has to be corrected first
(P08's dependency fix, the `python3` change in `src/audio_transcriber.js`, the
SIGUSR1 handler referenced by the logrotate config) or the server will start
and then behave wrongly.

**Stage 1 — money leaves without a payment.** [P01](../../../evidence/wa-booking-bot/proofs/P01-mina-gate-by-name.md),
then [P04](../../../evidence/wa-booking-bot/proofs/P04-paid-without-payment-claim.md),
[P06](../../../evidence/wa-booking-bot/proofs/P06-name-fuzzy-match-collides.md),
[P05](../../../evidence/wa-booking-bot/proofs/P05-coupon-not-consumed-on-atomic-claim.md),
[P11](../../../evidence/wa-booking-bot/proofs/P11-refund-does-not-restore-wallet.md).

P01 first because it is the only finding with a demonstrated loss. P04
second because it is the general form of the same hole: a confirmation path
that does not create a claim. P05 and P11 are consequences of the same
separation — money movement committed outside the transaction that should
commit it.

**Stage 2 — the boundary is not a boundary.** [P03](../../../evidence/wa-booking-bot/proofs/P03-sms-webhook-fail-open.md),
then [P09](../../../scripts/proofs/P09-data-dir-triggers-mock-sends.js).

Both are fail-open conditions on an environment switch rather than on an
input. P03 accepts unauthenticated requests in every environment except
production. P09 disables all outbound delivery in every environment except
one specific directory path. Neither is an attack; both are a deployment
mistake waiting to happen.

**Stage 3 — the path exists but does nothing.** [P02](../../../evidence/wa-booking-bot/proofs/P02-digitalcore-rebuy-type-mismatch.md),
then [P07](../../../evidence/wa-booking-bot/proofs/P07-followups-digital-activation-dead.md).

P02 means a paid customer whose digital product failed to purchase cannot be
re-served from the admin panel — the button is wired to a field that does not
exist on the value it receives. P07 means digital activation is never
verified at all. Both are customer-visible failures, and both are cheap.

**Stage 4 — structure.** Splitting `src/flow.js` at 10,709 lines, unifying the
four copies of phone normalisation and the three copies of digit
normalisation, and raising the lint warning count from 200 to zero.

**After every stage:** re-run P12. It is the only thing in the repository that
will notice a payment-path change breaking a guarantee that currently holds.

## Consequences

- The order is a function of the migration, not only of severity. The first
  stage exists because the bot was being moved.
- P12 is a gate, not a report. A change to the money path that turns a P12
  check red is a change that has broken a guarantee, and the release is
  blocked until it is understood.
- Stage 4 is last on purpose. The current structure is uncomfortable, but it
  works, and every stage above it touches files inside `src/flow.js` and
  `src/store.js`. Splitting first means splitting twice.
- Each stage has a matching proof. When a proof starts exiting `2`, the
  corresponding stage is done and the proof becomes the regression test.
- The order is not the only valid one. It is the one that keeps the system
  verifiable at each step.
