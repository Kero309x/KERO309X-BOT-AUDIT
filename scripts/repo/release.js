'use strict';

/** ينشئ release جديد ويحدّث بيانات المستودع — يستعمل credential المخزَّن في GCM. */

const { spawnSync } = require('node:child_process');

const GCM = 'C:\\Program Files\\Git\\ucrt64\\bin\\git-credential-manager.exe';
const OWNER = 'Kero309x';
const REPO = 'KERO309X-BOT-AUDIT';

function credential() {
  const res = spawnSync(GCM, ['get'], {
    input: 'protocol=https\r\nhost=github.com\r\n\r\n',
    encoding: 'utf8',
    windowsHide: true,
  });
  const out = {};
  for (const line of String(res.stdout).split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i > 0) out[line.slice(0, i)] = line.slice(i + 1);
  }
  if (!out.password) throw new Error('لا يوجد credential محفوظ');
  return out;
}

async function api(token, method, url, body) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'kero309x-bot-audit',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) { /* غير JSON */ }
  return { status: res.status, json, text };
}

const TAG = process.argv[2] || 'v0.2.0';
const TITLE = process.argv[3] || 'v0.2.0 — harness + first subject';

async function main() {
  const cred = credential();
  const base = `https://api.github.com/repos/${OWNER}/${REPO}`;

  const info = await api(cred.password, 'PATCH', base, {
    description:
      'A proof harness for auditing WhatsApp booking bots, and the audits produced with it. '
      + 'Sixteen executable proofs; every finding is reproduced by running the shipped code. '
      + 'Anyone can run it against their own bot and add their subject.',
    topics: [
      'audit', 'whatsapp-bot', 'security-audit', 'nodejs', 'sqlite',
      'reproducible-findings', 'evidence', 'payment-verification', 'audit-harness',
    ],
    has_wiki: false,
    has_projects: false,
    has_discussions: true,
  });
  console.log(`PATCH repo ⇒ ${info.status}`);

  const rel = await api(cred.password, 'POST', `${base}/releases`, {
    tag_name: TAG,
    name: TITLE,
    body: [
      '## What changed',
      '',
      'The repository was an audit of one bot. It is now a **harness**, and that audit is',
      'the first subject in it — because other people will run this against their own',
      'bots and add their own data.',
      '',
      '- **No absolute paths** anywhere in `scripts/`. Paths resolve from',
      '  `audit.config.json`, from environment variables, or by discovery.',
      '- **Evidence is scoped per subject** — `evidence/<subject>/` — so two people',
      '  auditing two bots cannot collide. Narrative output is scoped the same way,',
      '  under `subjects/<subject>/`.',
      '- **`scripts/proofs/manifest.json`** declares the scope of every proof:',
      '  `generic`, `configurable` or `template`. The harness reports coverage by scope',
      '  after every run.',
      '- **Exit code 3** means "not applicable to this subject", so a proof that cannot',
      '  run says so instead of failing.',
      '',
      '## New generic proofs',
      '',
      'These need no configuration and work on any bot of this shape.',
      '',
      '| ID | Finds |',
      '|---|---|',
      '| P14 | Any authenticator that accepts a request when its credential is missing |',
      '| P15 | Any SQL column referenced in source but absent from the live schema |',
      '| P16 | Errors swallowed in catch blocks and floating promises, flagged on money paths |',
      '',
      'P15 validated 387 SQL statements across 31 tables on the first bot it was pointed',
      'at, and found a dead verification path.',
      '',
      '## The first subject',
      '',
      '`wa-booking-bot` — 16 proofs, all reproduced, 0 errors.',
      '',
      '| Severity | Count |',
      '|---|---|',
      '| critical | 5 |',
      '| high | 6 |',
      '| medium | 3 |',
      '| informational (control points and baselines) | 2 |',
      '',
      'Nothing in the bot has been changed. The repair order is in',
      '`subjects/wa-booking-bot/decisions/0004-remediation-order.md`.',
      '',
      '## Privacy',
      '',
      'No customer data is published. `scripts/leak-scan.js` reads every identifier that',
      'actually exists in the audited database — 267 phone numbers, 635 names, 474 chat',
      'IDs, 369 references — and checks each one against every text file in the',
      'repository. It reports zero.',
    ].join('\n'),
    draft: false,
    prerelease: false,
  });
  console.log(`POST release ${TAG} ⇒ ${rel.status}`);
  if (rel.json) console.log(`  ${rel.json.html_url}`);
  else console.log(`  ${rel.text.slice(0, 400)}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
