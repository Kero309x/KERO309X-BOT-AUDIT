# Methodology

How a finding in this repository is produced, and what counts as evidence.

## The rule

A finding is not published unless a script reproduces it. The script is
published with it. If a reader disagrees with the conclusion, they can run the
script and get the same result.

> A claim backed by a paragraph of reasoning is an opinion. A claim backed by a
> script that prints `true` where the code should print `false` is a finding.

## What a proof does

Every proof in `scripts/proofs/` follows the same shape:

1. **Reads the real artefact.** Either the shipped source file or the live
   SQLite database, opened `readonly: true`.
2. **Runs the shipped code.** Where the defect lives inside a function, the
   proof extracts that function's source text and executes it in an isolated
   `vm` context with the dependencies it needs stubbed. The point is to run
   the code that ships, not a re-implementation of it.
3. **Shows the contradiction.** A print of the actual value next to the
   expected value.
4. **Writes a report** to `evidence/proofs/<ID>-<slug>.md` containing the raw
   output, and updates `evidence/findings.json`.
5. **Exits `0` if the defect reproduced, `2` if it did not.**

## The exit-code inversion

Exit `0` means "the defect is present". Exit `2` means "the defect is absent".

This is the opposite of what a test does, and it is deliberate. A proof is a
statement about the current state of the code; a test is a statement about the
desired state. When a defect is fixed, the proof starts failing, which is the
signal to convert it into a regression test.

Running the whole suite:

```bash
node scripts/proofs/run-all.js
```

Each proof runs in a separate process, so one proof's `require` cache cannot
affect another's result, and a proof that calls `process.exit` cannot take the
rest of the suite down with it.

## Isolation

Three proofs need to exercise a write path — the atomic payment claim, the
coupon side effect, the wallet refund. None of them touches the live
database. They build a temporary SQLite database with the real schema, copy
`data/packages.json` into it, and point `DATA_DIR` at it before requiring
`src/store.js`. The temporary directory is removed afterwards.

Proofs that only read the live database open it with `{ readonly: true }`,
which makes a write fail at the driver level rather than relying on discipline.

## Pseudonymisation

Read-only proofs against the live database emit pseudonyms rather than
identifiers. A pseudonym is a truncated SHA-256 of the original value, so:

- it is stable — the same customer produces the same pseudonym across proofs,
  which is what makes cross-proof corroboration possible;
- it is not reversible without the original value;
- it does not disclose the value.

Phone numbers get a separate treatment: the country prefix and the last two
digits are kept, the middle is masked. That keeps the number recognisable as
an Egyptian mobile number without identifying a person.

Amounts, statuses, provider names and match methods are kept verbatim. A
finding about payment matching cannot be checked without the amount.

See [decision 0002](0002-redaction.md).

## Screenshots

The screenshots in `evidence/screenshots/` are captured from `sandbox/` — the
bot repository's own synthetic environment, which runs three invented
customers and five test bookings against a stub gateway. The capture script
never reads the live database and never starts an instance against it.

## Baseline

[P13](evidence/proofs/P13-test-and-lint-baseline.md) captures `npm test` and
`npm run lint` output verbatim into `evidence/baseline/`. It exists so that any
remediation can be measured against a fixed reference rather than against
recollection.

At the time of publication:

```
npm test        808 tests, 807 pass, 1 fail, 0 skipped
npm run lint    200 problems (0 errors, 200 warnings)
```

The single failing test is `test/audio_transcriber.test.js`, which fails
because the Python dependency `speech_recognition` is not installed in the
auditing environment. It is an environment gap, not a code defect — and it is
one of the findings, because a Linux server would hit the same gap.

## Severity

| Severity | Meaning |
|---|---|
| critical | Loss of money, loss of product, loss of access, or the bot fails to start in the target environment |
| high | A safety property the design claims to hold does not hold |
| medium | A functional path is silently dead, or money is not restored |
| info | No defect; a control point or a measurement |

## What this audit does not claim

- It does not claim the bot's architecture is wrong. Several of the findings
  are one-line mistakes in an otherwise sound design.
- It does not claim the money has been lost. [P04](evidence/proofs/P04-paid-without-payment-claim.md)
  shows bookings without a claim record; whether each of them was a genuine
  payment is a business question the audit cannot answer.
- It does not test the Vodafone, DigitalCore or OpenWA integrations end to
  end. Those require live accounts and live balances.
- It does not cover the admin UI's rendering correctness beyond what the
  screenshots show.
