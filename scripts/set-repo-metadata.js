'use strict';

/**
 * يضبط بيانات المستودع على GitHub (الوصف، المواضيع، اللغة، الإعدادات).
 * يستعمل الـcredential المخزَّن في Git Credential Manager.
 */

const { spawnSync } = require('node:child_process');
const path = require('node:path');

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
  if (!out.password) throw new Error('لا يوجد credential محفوظ لـ github.com');
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

async function main() {
  const cred = credential();
  const base = `https://api.github.com/repos/${OWNER}/${REPO}`;

  const info = await api(cred.password, 'PATCH', base, {
    description:
      'Evidence-backed audit of the wa-booking-bot WhatsApp booking bot: 13 reproducible '
      + 'findings with a runnable proof harness, admin-panel captures from a synthetic '
      + 'sandbox, and a Windows-to-Linux readiness review.',
    homepage: '',
    topics: [
      'audit', 'whatsapp-bot', 'security-audit', 'nodejs', 'sqlite',
      'reproducible-findings', 'evidence', 'payment-verification',
    ],
    has_wiki: false,
    has_projects: false,
    has_discussions: true,
    archived: false,
  });
  console.log(`PATCH repo ⇒ ${info.status}`);
  if (info.json) {
    console.log(`  ${info.json.html_url}`);
    console.log(`  topics: ${(info.json.topics || []).join(', ')}`);
  } else {
    console.log(`  ${info.text.slice(0, 300)}`);
  }

  // إنشاء release أولي يثبّت حالة التدقيق
  const tag = 'v0.1.0';
  const rel = await api(cred.password, 'POST', `${base}/releases`, {
    tag_name: tag,
    name: 'Audit v0.1.0 — 13 findings, 13 reproduced',
    body: [
      'First published audit of `wa-booking-bot`.',
      '',
      '| Severity | Count |',
      '|---|---|',
      '| critical | 4 |',
      '| high | 5 |',
      '| medium | 2 |',
      '| informational (control points and baselines) | 2 |',
      '',
      'Every finding is reproduced by a script in `scripts/proofs/` that runs the shipped',
      'code against the real database or an isolated temporary copy. All 13 reproduced;',
      '0 errors.',
      '',
      'No customer data is published. Identifiers are pseudonymised with a stable',
      'truncated SHA-256; screenshots come from the bot\'s own synthetic sandbox.',
      '`scripts/leak-scan.js` verifies this against every identifier in the live database.',
      '',
      'The findings are not fixed in this repository. The repair order is in',
      '`docs/decisions/0004-remediation-order.md`.',
    ].join('\n'),
    draft: false,
    prerelease: false,
  });
  console.log(`POST release ${tag} ⇒ ${rel.status}`);
  if (rel.json) console.log(`  ${rel.json.html_url}`);
  else console.log(`  ${rel.text.slice(0, 300)}`);
}

main().catch((err) => {
  console.error('خطأ:', err.message);
  process.exit(1);
});
