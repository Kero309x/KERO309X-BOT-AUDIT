# 0001 — The audit publishes evidence, not patches

- **Status:** accepted
- **Date:** 2026-11-11

## Context

The bot under audit has a money path that mostly works: nineteen of the twenty
guards checked in [P12](../../evidence/proofs/P12-money-path-guards-that-hold.md)
hold, including atomic payment claiming and exact amount matching. It also
has four critical defects and four high ones, spread across the FSM, the
admin router, the webhook authenticator and the startup lock.

Two things could be published from this work.

The first is a patch series: fixes, ready to apply. That is the faster path
to a safer system, and it is the right thing to do with most of the findings.

The second is an evidence package: claims, reproductions, raw output, and a
reasoned order of repair. That is the slower path to the same safety.

They are not mutually exclusive, but publishing them together has a specific
failure mode. A patch series reviewed by someone who cannot execute the code
rests on the reader trusting the author's control flow. An evidence package
reviewed by the same reader does not: they run the proof and see the result.
Once the proof exists, the patch is a much easier thing to trust.

There is a second reason. The bot's owner was moving it to a Linux server at
the time of the audit. A migration changes what "the system" even is — the
paths, the environment, the process model. Fixes written against a Windows
checkout, before the migration, would need to be re-verified against a Linux
one anyway. The evidence survives the migration; the patches have to be
re-checked.

## Decision

This repository publishes the evidence. It does not contain modifications to
the bot's source.

Each finding states the fix as a recommendation, with the exact code change
and the exact place to put it, so that applying it is mechanical rather than
interpretive. The proof for that finding becomes the regression test once the
fix lands, because the proof already exits non-zero when the defect is gone.

The findings are ordered for repair in [decision 0004](0004-remediation-order.md).

## Consequences

- A reader can check any claim by running one script. No trust in the author
  is required.
- The repository does not fork the bot, does not track the bot's history, and
  does not need to be updated when the bot changes except where a finding
  stops reproducing.
- The findings are only as good as the proofs. Where a proof covers the
  defect but not its blast radius, the finding says so.
- Applying the fixes is a separate piece of work that this repository
  specifies but does not perform.
- The proofs must keep working. They are published in the same repository as
  the findings, and the baseline in [P13](../../evidence/proofs/P13-test-and-lint-baseline.md)
  records the test and lint state they were measured against.
