# 0003 — A proof exits zero when the defect is present

- **Status:** accepted
- **Date:** 2026-11-11

## Context

There are two conventions in this codebase for scripts that report on state.

A **test** asserts a desired state. It exits zero when the code matches the
specification and non-zero when it does not. The bot's own suite follows it:
808 tests, and one fails.

A **proof** reports an observed state. The question it answers is "is this
defect present?", not "is the code correct?".

If a proof used the test convention, it would exit zero exactly when the
defect was *absent* — which is the opposite of what a reader expects from a
file named `P01-mina-gate-by-name.js` whose output says `REPRODUCED`.

## Decision

A proof exits `0` when the defect reproduced, and `2` when it did not.
`1` is reserved for the proof itself failing to run.

A proof's report carries an explicit `Verdict` line — `REPRODUCED` or
`NOT REPRODUCED` — so the exit code is never the only signal.

`run-all.js` aggregates them and exits `0` only when every proof ran without
error. It does not fail because a defect is present; that is the expected
state of an unfixed system.

Two proofs invert their own meaning, and say so in their report:

- **P12** is a positive control. Its exit `0` means the money-path guards
  *held*.
- **P13** is a baseline capture. Its exit `0` means the test suite *had a
  failure*, which is the current state.

Both carry `Severity: info` and both state their meaning in the `Observed`
section.

## Consequences

- A reader can run a single proof and read the exit code correctly: zero
  means "yes, the defect is real".
- When a defect is fixed, the proof starts failing. That failure is the
  signal to invert the convention, rename it to a test, and move it into the
  bot's own suite. The proof has already done the hard part — it reproduces
  the defect against the real system, so it can be adapted into a regression
  test with a changed assertion.
- Two conventions in one repository is a real cost. It is accepted because
  the alternative — proofs that exit zero when the defect is absent, named as
  if they were defects — misleads at exactly the point where a reader is most
  likely to trust the exit code.
- `run-all.js` output marks each proof `REPRODUCED`, `CLEAN` or `ERROR`, so
  the summary is readable without consulting the exit codes.
