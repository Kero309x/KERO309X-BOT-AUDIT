# Using this harness on your own bot

This repository is a harness, not a report. It contains a set of proof scripts
and a set of conventions. The published audit in
[`subjects/wa-booking-bot/`](../subjects/wa-booking-bot/) is one instance of
it — the first subject added to the collection.

Anyone can run the harness against their own bot, add their own findings, and
commit their subject here.

## What you need

- Node.js 20 or newer.
- The bot's source tree.
- Its SQLite database, if you want the money-path proofs to run. They open it
  read-only; they never write to it.
- `better-sqlite3` installed in the bot's `node_modules`. The harness loads it
  from the bot's tree, not from its own.

## Three steps

### 1. Describe your bot

Copy the config template and fill it in:

```bash
cp audit.config.example.json audit.config.json
```

```json
{
  "defaultSubject": "my-bot",
  "subjects": {
    "my-bot": {
      "title": "اسم يُعرض في الفهرس",
      "description": "سطر واحد يصف النظام.",
      "botRepo": "C:/path/to/my-bot",
      "dataDir": "C:/path/to/my-bot/data",
      "dbFile": "bot.db",
      "lockFile": "bot.lock"
    }
  }
}
```

`audit.config.json` is gitignored — it holds local paths. If you want your
subject's metadata to be committed, put the title and description in the
committed `subjects/<id>/README.md` instead.

Paths can also come from the environment, which takes precedence:

```bash
export BOT_REPO=/path/to/my-bot
export BOT_DATA_DIR=/path/to/my-bot/data
export AUDIT_SUBJECT=my-bot
```

### 2. Run the proofs

```bash
node scripts/proofs/run-all.js
```

Output goes to `evidence/<subject>/`:

```
evidence/my-bot/
  proofs/          one Markdown report per finding
  baseline/        the test and lint summary
  screenshots/     admin panel captures
  findings.json    machine-readable index
  proof-run.json   the result of the last run, with timings
```

Run a subset while you work:

```bash
node scripts/proofs/run-all.js --only P08 P09 P15
```

### 3. Capture the admin panel

```bash
node scripts/capture-screenshots.js
```

Two sources, in order of preference:

- **`sandbox`** — if your bot repository has a synthetic test environment
  under `sandbox/`, the capture uses it. Nothing real is touched.
- **`live`** — otherwise the capture makes a temporary copy of your database,
  scrubs the personal columns, starts the bot against the copy, and deletes
  the copy afterwards.

Force one with `SHOT_MODE=sandbox` or `SHOT_MODE=live`.

Before you commit anything, run the leak check:

```bash
node scripts/leak-scan.js
```

It reads every identifier that actually exists in your live database — phone
numbers, names, chat IDs, references — and checks each one against every text
file in this repository. It exits non-zero and names the file if any of them
appears. **Do not commit with leaks present.**

## Which proofs apply to you

The manifest at [`scripts/proofs/manifest.json`](../scripts/proofs/manifest.json)
declares the scope of every proof.

| Scope | Meaning | What you do |
|---|---|---|
| `generic` | Runs against any bot of this shape, unchanged | Nothing |
| `configurable` | Runs once you set the table and column names | Fill in `moneyPath` in your config |
| `template` | A worked example tied to one specific bot | Read it, then port it to your bot |

The generic set is the part that gives immediate value:

| ID | What it finds | Configuration |
|---|---|---|
| [P08](../scripts/proofs/P08-undeclared-production-dependency.js) | Production dependencies that are undeclared or dev-only | none |
| [P09](../scripts/proofs/P09-data-dir-triggers-mock-sends.js) | An environment heuristic that silently disables outbound messages | none |
| [P10](../scripts/proofs/P10-stale-lock-pid-blocks-boot.js) | A PID lock file that will block the boot after a machine change | `lockFile` |
| [P13](../scripts/proofs/P13-test-and-lint-baseline.js) | The test and lint baseline, for measuring any change | none |
| [P14](../scripts/proofs/P14-unconfigured-auth-fail-open-scan.js) | Any authenticator that accepts a request when its credential is missing | none |
| [P15](../scripts/proofs/P15-sql-column-not-in-schema.js) | Any SQL column referenced in source but absent from the schema | none |
| [P16](../scripts/proofs/P16-swallowed-error-scan.js) | Errors swallowed in catch blocks and floating promises, flagged in money paths | none |

P15 is the one to run first on an unfamiliar bot. It reads the live schema and
the source, and reports every column that does not exist. It found a dead
verification path in the first bot it was pointed at.

## Adapting a configurable proof

The money-path proofs read table and column names from `moneyPath`:

```json
"moneyPath": {
  "bookingsTable": "orders",
  "claimsTable": "order_payments",
  "trustedPaymentsTable": "incoming_sms",
  "couponRedemptionsTable": "coupon_holds",
  "refundsTable": "refunds",
  "digitalOrdersTable": "digital_orders",
  "customersTable": "customers",
  "paidStatus": "paid",
  "smsVerifiedColumn": "sms_verified",
  "refRawColumn": "sms_ref_id",
  "refNormalizedColumn": "sms_ref_norm",
  "providerColumn": "sms_provider",
  "customerNameColumn": "customer_name",
  "phoneColumns": ["requested_phone", "whatsapp_phone", "sender_phone"],
  "bookingIdColumn": "id",
  "chatIdColumn": "chat_id"
}
```

The defaults are listed in
[`scripts/proofs/config.js`](../scripts/proofs/config.js) as
`DEFAULT_MONEY_PATH`. Change what differs.

If your bot has no coupons, P05 reports `NOT APPLICABLE` rather than failing.
The same applies to P11 with no wallet. That is the point of exit code 3.

## Writing your own proof

Copy the shape of an existing one. The rules are in
[`CONTRIBUTING.md`](../CONTRIBUTING.md), and the essentials are:

- Read the artefact; run the shipped code; show the contradiction.
- Print through `say()` from `_lib.js`, so the output is captured and masked.
- Finish with `finish(finding)`, or `notApplicable(finding, reason)` when the
  precondition is not met.
- Exit `0` when the defect reproduced, `2` when it did not, `3` when it does
  not apply.
- Never hard-code a path. Everything comes from `cfg` in `_lib.js`.
- Add the proof to `scripts/proofs/manifest.json` with its scope, or the
  coverage report will call it out.

Then register it in the subject's findings by running the harness and
regenerating the pages:

```bash
node scripts/proofs/run-all.js
node scripts/build-findings-docs.js
```

## Adding your subject to this repository

1. Create `subjects/<your-id>/` with a `README.md` describing the system.
2. Run the harness and commit `evidence/<your-id>/`.
3. Write up the architecture and any findings the harness cannot produce.
4. Run `node scripts/leak-scan.js` and make sure it passes.
5. Open a pull request.

Keep each subject's narrative in `subjects/<your-id>/` and the raw output in
`evidence/<your-id>/`. Nothing about one subject should appear in another's
files — the paths are separate by construction, and the leak scan enforces
the separation.

## What the harness will not do for you

- It does not judge your architecture. It reports facts and reproduces them.
- It does not read the code for business logic errors. It looks for specific
  patterns; a proof that is not in the manifest is a proof nobody wrote.
- It does not test your external integrations. Those need live accounts.
- It does not fix anything. The `Fix` section of each finding states the
  change; applying it is your work.

The conventions for what counts as a finding, how a proof is structured, and
how a proof exits are in [`methodology.md`](methodology.md) and in
[`docs/decisions/`](decisions/).
