# 0002 — Customer identifiers are pseudonymised, not merely omitted

- **Status:** accepted
- **Date:** 2026-11-11

## Context

The bot's database holds real customer data: names, phone numbers, WhatsApp
IDs, the text of inbound bank SMS, transaction references, and images of bank
receipts. Some findings can only be shown against real rows — P04, for
instance, is the claim that a paid booking lacks a `payment_claims` row, and
that claim is only meaningful with a count taken from the live table.

The obvious alternative to publishing data is to publish counts without
identifiers: "18 bookings, no claim row". That is safe. It is also much
weaker evidence, because it cannot be checked by a reader, and because it
cannot be cross-checked between findings.

A second alternative is to publish the raw rows with the identifiers replaced
by sequential placeholders (`CUST-001`, `CUST-002`). That is safe, readable,
and preserves cross-row relationships — but it destroys the ability to check
whether two findings refer to the same customer, and it invites the reader to
assume the ordering carries meaning.

## Decision

Identifiers are replaced by a **stable pseudonym**: a truncated SHA-256 of the
original value, prefixed by the kind of identifier.

```
customer name  → NAME-4f2a91c8
booking id     → BKG-137d4fb4
chat id        → CHAT-2f25a24b
payment id     → TP-6b86b273
transaction    → TXN-d7f94889
```

A pseudonym is stable across every proof and every run, so two findings can be
correlated without disclosing anything.

Phone numbers get separate treatment, because they are read and typed by
humans and are recognisable in a different way: the country prefix and the
last two digits are kept, the middle is masked.

```
01027367735  →  0102******35
```

Amounts, booking statuses, provider names, match methods and timestamps are
published verbatim. A finding about whether a payment matched cannot be
checked without the amount, and none of those values identifies a person on
its own.

Receipt images and chat message bodies are not published at all. Where a
finding touches them, the finding describes the mechanism and the row counts,
and no content.

Screenshots are captured from `sandbox/`, the bot repository's own synthetic
environment. The capture script never reads the live database.

## Consequences

- The evidence stays checkable: a reader with access to the real database can
  reproduce the counts and see the same pseudonyms.
- Cross-proof corroboration works. P04 shows that 14 of the 18 bookings
  without a claim row carry the free-fulfilment provider string, and P01 shows
  how that provider string gets written — the two findings connect only
  because the identifiers are stable.
- Pseudonyms are not anonymous to the bot's owner, who holds the database. A
  pseudonymous dataset is not an anonymous one, and this repository should not
  be described as containing no customer data at all. It contains no
  *disclosable* customer data: the mapping from pseudonym to person lives
  only in the private database.
- A pseudonym hash is truncated to 32 bits of SHA-256. It is not brute-force
  resistant against a small candidate space — an adversary who knows the
  customer could confirm a guess. That is an accepted trade for stable,
  correlatable evidence; the alternative, a random-per-run identifier, would
  break correlation.
- The salt is not secret. The pseudonym is a re-identification defence against
  casual reading and bulk scraping, not against a determined adversary with
  the database.
