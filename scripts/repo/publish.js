'use strict';

/**
 * ينشئ مستودع GitHub ويدفع إليه، باستخدام الـcredential المخزَّن في
 * Git Credential Manager — التوكن لا يُطبع ولا يُخزَّن في أي ملف.
 *
 * التشغيل: node scripts/publish.js [--private]
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const GCM = 'C:\\Program Files\\Git\\ucrt64\\bin\\git-credential-manager.exe';
const ROOT = path.resolve(__dirname, '..');
const OWNER = 'kero309x';
const REPO = 'KERO309X-BOT-AUDIT';
const DESCRIPTION = 'Evidence-backed audit of the wa-booking-bot WhatsApp booking bot: 13 reproducible findings, a proof harness, and a Windows-to-Linux readiness review.';

/** يقرأ الـcredential من GCM دون طباعته. */
function credential() {
  const res = spawnSync(GCM, ['get'], {
    input: 'protocol=https\r\nhost=github.com\r\n\r\n',
    encoding: 'utf8',
    windowsHide: true,
  });
  if (res.status !== 0) throw new Error(`GCM فشل: ${res.stderr}`);
  const out = {};
  for (const line of String(res.stdout).split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i > 0) out[line.slice(0, i)] = line.slice(i + 1);
  }
  if (!out.username || !out.password) throw new Error('لا يوجد credential محفوظ لـ github.com');
  return out;
}

async function api(token, method, url, body) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'kero309x-bot-audit-publish',
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
  console.log(`credential: ${cred.username}@github.com (token not shown)`);

  // 1) هل المستودع موجود؟
  const check = await api(cred.password, 'GET', `https://api.github.com/repos/${OWNER}/${REPO}`);
  let repoExists = check.status === 200;
  console.log(`المستودع موجود؟ ${repoExists ? 'نعم' : `لا (${check.status})`}`);

  if (!repoExists) {
    const create = await api(cred.password, 'POST', 'https://api.github.com/user/repos', {
      name: REPO,
      description: DESCRIPTION,
      private: false,
      auto_init: false,
      has_issues: true,
      has_wiki: false,
      has_projects: false,
    });
    if (create.status !== 201) {
      console.error('فشل إنشاء المستودع:', create.status, create.text.slice(0, 500));
      process.exit(1);
    }
    repoExists = true;
    console.log(`تم إنشاء المستودع: ${create.json.html_url}`);
  }

  // 2) push
  console.log('دفع الكود…');
  const push = spawnSync('git', ['push', '-u', 'origin', 'main'], {
    cwd: ROOT, encoding: 'utf8', stdio: 'inherit', windowsHide: true,
  });
  if (push.status !== 0) {
    console.error('فشل الدفع.');
    process.exit(push.status || 1);
  }

  // 3) releases/مستودع آخر؟ اتركه.
  console.log(`تم: https://github.com/${OWNER}/${REPO}`);
}

main().catch((err) => {
  console.error('خطأ:', err.message);
  process.exit(1);
});
