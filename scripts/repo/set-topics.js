'use strict';

/** يضع مواضيع المستودع عبر endpoint المخصّص لـ GitHub. */

const { spawnSync } = require('node:child_process');

const GCM = 'C:\\Program Files\\Git\\ucrt64\\bin\\git-credential-manager.exe';
const OWNER = 'Kero309x';
const REPO = 'KERO309X-BOT-AUDIT';

const res = spawnSync(GCM, ['get'], {
  input: 'protocol=https\r\nhost=github.com\r\n\r\n',
  encoding: 'utf8',
  windowsHide: true,
});
let token = '';
for (const line of String(res.stdout).split(/\r?\n/)) {
  const i = line.indexOf('=');
  if (i > 0 && line.slice(0, i) === 'password') token = line.slice(i + 1);
}
if (!token) {
  console.error('لا يوجد credential محفوظ');
  process.exit(1);
}

async function main() {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/topics`;
  const put = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'kero309x-bot-audit',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      names: [
        'audit', 'whatsapp-bot', 'security-audit', 'nodejs', 'sqlite',
        'reproducible-findings', 'evidence', 'payment-verification',
      ],
    }),
  });
  const body = await put.text();
  console.log(`PUT topics ⇒ ${put.status}`);
  console.log(body.slice(0, 400));

  const get = await fetch(url, { headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'x' } });
  console.log(`GET topics ⇒ ${get.status} ${(await get.text()).slice(0, 300)}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
