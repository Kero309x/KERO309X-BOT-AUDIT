# Security policy

## What counts as a security issue in this repository

- A proof that leaks customer data, a receipt image, or any identifier that
  the redaction rules in `docs/decisions/0002-redaction.md` are meant to
  remove.
- A published output that contains a real customer name, phone number, chat
  ID, transaction reference, or payment message body.
- A screenshot that was captured from the live database rather than from the
  synthetic sandbox.
- A change that weakens a proof so that a real defect stops reproducing.

## What is not a security issue here

A finding in the audited bot is not a vulnerability in this repository. The
audited bot is privately operated; its defects are documented in
`docs/findings/` and are the subject of the owner's own remediation work.

If you believe a proof in this repository can be used to harm a customer, or
that the published evidence identifies one, that is a security issue here and
should be reported as described below.

## How to report

Report privately through GitHub's security advisory feature on this
repository. Do not open a public issue, and do not include customer
identifiers in the report — refer to them by their pseudonym.

Include:

- the proof ID and the file path;
- what you believe the output discloses;
- how you believe it was obtained.

## Handling of pseudonyms

The pseudonyms are truncated SHA-256 hashes of the original identifiers. They
are stable across proofs, which is what makes cross-proof corroboration
possible. They are not a secret-keyed tokenisation, and they are not intended
to be resistant to an adversary who holds the source database and a small
candidate space.

Do not attempt to build a reverse mapping from this repository. If you
believe you have identified a customer from the published evidence, report it
privately as above rather than publishing it.
