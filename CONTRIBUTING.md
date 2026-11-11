# Contributing

This repository publishes an audit and the proofs that support it. Changes are
welcome, with one condition: a finding may not be weakened without evidence.

## The one rule

A finding is a claim that a specific defect exists in specific code. If you
change the code being audited, or change the proof, the finding must still be
reproducible, or the finding must be withdrawn.

Concretely:

- Changing a proof so that it no longer reproduces its finding is not
  acceptable without a corresponding change to the audited code, and that
  change has to be evidenced.
- Weakening an assertion — relaxing a threshold, widening a match, dropping a
  case — invalidates the finding.
- A finding can be withdrawn, and that is a legitimate outcome. Say so in the
  finding's report and update `evidence/findings.json`.

## Adding a proof

Copy the shape of an existing one in `scripts/proofs/`:

- `'use strict'`, and a header comment saying what it proves.
- Read the artefact, run the shipped code, show the contradiction.
- Print through `say()` from `_lib.js`, so the raw output is captured.
- Call `finish(finding)` with `id`, `slug`, `title`, `severity`, `area`,
  `refs`, `claim`, `expected`, `observed`, `impact`, `fix`, and `reproduced`.
- Exit `0` when the defect reproduced, `2` when it did not. See
  `docs/decisions/0003-proof-conventions.md`.

Every `require` of the audited bot must go through `REPO_ROOT` from `_lib.js`,
which honours the `BOT_REPO` environment variable. Do not hard-code paths.

## Adding a database read

The live database is opened read-only. If a proof needs to exercise a write,
build an isolated temporary database with the real schema instead — see
`P05` for the pattern — and delete it afterwards. Never write to the audited
bot's `data/` directory.

## Redaction

Any identifier that reaches published output goes through `pseudonym()`,
`maskPhone()` or `maskToken()` from `_lib.js`. Do not publish a raw customer
name, phone number, chat ID, transaction reference, payment message, receipt
image, or chat message body.

Amounts, statuses, provider names and match methods are published as they are.
That is deliberate — a finding about payment matching is not checkable without
the amount.

## Regenerating the documentation

The pages under `docs/findings/` are generated from the proof reports:

```bash
node scripts/build-findings-docs.js
```

Run it after changing any proof report, and commit the result. Do not edit
those pages by hand.

## Style

- Comments and prose in the bot's own repository are Arabic; this repository's
  prose is English, matching the sibling Kero309x Patches project. Code
  identifiers, file paths and quoted source stay as they are.
- Reference code as `src/file.js:123`. A line reference that cannot be
  checked is a line reference that does not help.
- Be dense. A finding page is not a blog post.

## Reporting a bug in the audit

Open an issue. If the issue is about a defect in the audited bot, link to the
existing finding if there is one, and say whether you can reproduce it.

If the issue is that a proof does not work — a path that does not resolve, a
database that is not where the script expects it — open an issue with the
command you ran and the output.
