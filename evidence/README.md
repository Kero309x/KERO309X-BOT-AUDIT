# Evidence

Everything in this directory is captured output. Nothing here is written by
hand.

The layout is per subject, so several people can each add their own audited
system without their files touching anyone else's.

```
evidence/
  <subject>/
    proofs/        one Markdown report per finding, with the raw output
    screenshots/   admin panel captures
    baseline/      the captured `npm test` and `npm run lint` summary
    findings.json  machine-readable index for this subject
    proof-run.json the result of the last harness run, with timings
  README.md
```

The index across all subjects is at the repository root,
[`findings.json`](../findings.json).

## Regenerating

```bash
export BOT_REPO=/path/to/your-bot
export AUDIT_SUBJECT=your-bot

node scripts/proofs/run-all.js            # proofs + baseline
node scripts/capture-screenshots.js       # screenshots
node scripts/build-findings-docs.js       # subjects/<id>/findings-*.md + the root index
```

`run-all.js` exits `0` when every proof ran without error. It does not fail
because a defect is present — that is the expected state of an unfixed system.

## Reading the verdicts

Each proof report carries a `Verdict` line.

| Verdict | Meaning |
|---|---|
| `REPRODUCED` | the defect is present in the audited code, as described |
| `NOT REPRODUCED` | the defect did not reproduce — either it was fixed, or the reproduction was wrong |
| `NOT APPLICABLE` | the proof's precondition is not met for this subject |

Two proofs invert the sense of the verdict, and say so in their own report:

- **P12** is a positive control. `REPRODUCED` there means the money-path
  guards *held*.
- **P13** captures a baseline. `REPRODUCED` there means the test suite *had a
  failure* at the time of capture.

## Screenshots

Captured from `sandbox/` in the audited bot's repository where one exists:
synthetic customers, a stub gateway. The capture script never reads the live
database in that mode.

Where there is no sandbox, the capture falls back to a temporary copy of the
live database with the personal columns scrubbed, and deletes the copy
afterwards.

`manifest.json` records the capture time, the source, and the status code of
every page.

## What is not here

- No receipt images.
- No chat message bodies.
- No raw payment SMS text.
- No customer names, phone numbers, chat IDs or transaction references in
  their original form — only pseudonyms.

The baseline is published as a summary rather than as a raw log, because the
test suite reads the live database on some paths and its output contains real
customer names. The summary carries the numbers and the failing test names,
which is what a baseline needs, and none of that data.

See `docs/decisions/0002-redaction.md` for the rule and its limits.

## Before you commit

```bash
node scripts/leak-scan.js
```

It reads every identifier that actually exists in the audited bot's live
database and checks each one against every text file in this repository. It
exits `1` and names the offending file if any of them appears. It must pass.
