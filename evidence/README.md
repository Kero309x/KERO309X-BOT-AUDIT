# Evidence

Everything in this directory is captured output. Nothing here is written by
hand.

## Layout

| Path | What it is |
|---|---|
| `proofs/` | one Markdown report per finding, containing the claim, the expected value, the observed value, the impact, the fix, and the raw output of the reproduction |
| `screenshots/` | admin panel captures, taken from the audited bot's own synthetic sandbox |
| `baseline/` | verbatim `npm test` and `npm run lint` output |
| `findings.json` | machine-readable index of every finding |
| `proof-run.json` | the result of the last full harness run, with timings |

## Regenerating

```bash
export BOT_REPO=/path/to/wa-booking-bot

node scripts/proofs/run-all.js            # proofs + baseline
node scripts/capture-screenshots.js       # screenshots
node scripts/build-findings-docs.js       # docs/findings/*.md
```

`run-all.js` exits `0` when every proof ran without error. It does not fail
because a defect is present — that is the expected state of an unfixed system.

## Checking for leaks

Before publishing anything, run the leak scan:

```bash
node scripts/leak-scan.js
```

It reads every identifier that actually exists in the audited bot's live
database — 267 phone numbers, 635 names, 474 chat IDs, 369 references — and
checks each one against every text file in this repository. It exits `1` and
names the offending file if any of them appears.

The scan is the reason the baseline is published as a summary rather than as
a raw log: the test suite reads the live database on some paths, so its
output contains real customer names. The summary carries the numbers and the
failing test names, which is what a baseline needs, and none of that data.

## Reading the verdicts

Each proof report carries a `Verdict` line.

| Verdict | Meaning |
|---|---|
| `REPRODUCED` | the defect is present in the audited code, as described |
| `NOT REPRODUCED` | the defect did not reproduce — either it was fixed, or the reproduction was wrong |

Two proofs invert the sense of the verdict, and say so in their own report:

- **P12** is a positive control. `REPRODUCED` there means the money-path
  guards *held*.
- **P13** captures a baseline. `REPRODUCED` there means the test suite *had a
  failure* at the time of capture.

## Screenshots

Captured from `sandbox/` in the audited bot's repository: three invented
customers, five test bookings, a stub gateway. The capture script never reads
the live database and never starts an instance against it.

`manifest.json` records the capture time, the base URL, and the status code of
every page.

## What is not here

- No receipt images.
- No chat message bodies.
- No raw payment SMS text.
- No customer names, phone numbers, chat IDs or transaction references in
  their original form — only pseudonyms.

See `docs/decisions/0002-redaction.md` for the rule and its limits.
