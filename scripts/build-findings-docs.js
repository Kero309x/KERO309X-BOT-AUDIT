'use strict';

/**
 * يولّد ملفات docs/findings/*.md من تقارير الأدلة في evidence/proofs/.
 *
 * الهدف: أن تبقى صفحات الـfindings متزامنة مع الأدلة دائماً — لا تكرار يدوي.
 * كل فقرة في صفحة الـfinding تُنسخ من تقرير الدليل نفسه.
 *
 * التشغيل: node scripts/build-findings-docs.js
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PROOFS_DIR = path.join(ROOT, 'evidence', 'proofs');
const OUT_DIR = path.join(ROOT, 'docs', 'findings');

/** يستخرج أقساماً من تقرير الدليل. */
function sections(md) {
  const out = {};
  const re = /^## (Claim|Expected|Observed|Impact|Fix)\s*$/gm;
  const marks = [];
  let m;
  while ((m = re.exec(md)) !== null) marks.push({ name: m[1], start: m.index, end: m.index + m[0].length });
  for (let i = 0; i < marks.length; i += 1) {
    const next = i + 1 < marks.length ? marks[i + 1].start : md.length;
    out[marks[i].name] = md.slice(marks[i].end, next).trim();
  }
  const h1 = md.match(/^# (.+)$/m);
  const sev = md.match(/\*\*Severity:\*\* (\w+)/);
  const area = md.match(/\*\*Area:\*\* (.+)/);
  const refs = md.match(/\*\*Refs:\*\* (.+)/);
  return {
    title: h1 ? h1[1] : '',
    severity: sev ? sev[1] : '?',
    area: area ? area[1].trim() : '?',
    refs: refs ? refs[1].trim() : '',
    ...out,
  };
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const files = fs.readdirSync(PROOFS_DIR).filter((f) => f.endsWith('.md')).sort();
  const findings = files.map((f) => ({ file: f, ...sections(fs.readFileSync(path.join(PROOFS_DIR, f), 'utf8')) }));

  const groups = [
    { key: 'critical', file: '01-critical.md', title: 'Critical findings', intro:
      'Each of these either moves money without a payment, gives away a product, '
      + 'accepts unauthenticated input, or stops the bot from starting on the target server. '
      + 'All four are reproduced by a script that runs the shipped code.' },
    { key: 'high', file: '02-high.md', title: 'High findings', intro:
      'These are safety properties the design claims to hold and does not. '
      + 'None of them is an attack in itself; each one removes a guard that '
      + 'another part of the system is relying on.' },
    { key: 'medium', file: '03-medium.md', title: 'Medium findings', intro:
      'A path that exists, is reachable, and does nothing — or that moves money '
      + 'in one direction only. Both are customer-visible.' },
    { key: 'info', file: '04-verified-guardrails.md', title: 'Verified guardrails and baselines', intro:
      'Not defects. These are the control points: the properties that were checked '
      + 'and hold, and the measurements that the other findings were taken against. '
      + 'They are published so the audit is not read as a claim that nothing works.' },
  ];

  for (const g of groups) {
    const items = findings.filter((f) => f.severity === g.key);
    const parts = [];
    parts.push(`# ${g.title}`);
    parts.push('');
    parts.push(g.intro);
    parts.push('');
    parts.push('| ID | Finding | Area | Proof |');
    parts.push('|---|---|---|---|');
    for (const f of items) {
      const id = f.file.split('-')[0];
      parts.push(`| ${id} | ${f.title.replace(/^P\d+\s*[—-]\s*/, '')} | ${f.area} | [proof](../../evidence/proofs/${f.file}) |`);
    }
    parts.push('');
    for (const f of items) {
      const id = f.file.split('-')[0];
      parts.push('---');
      parts.push('');
      parts.push(`## ${id} — ${f.title.replace(/^P\d+\s*[—-]\s*/, '')}`);
      parts.push('');
      parts.push(`- **Severity:** ${f.severity}`);
      parts.push(`- **Area:** ${f.area}`);
      parts.push(`- **Refs:** ${f.refs}`);
      parts.push(`- **Proof:** [${f.file}](../../evidence/proofs/${f.file})`);
      parts.push('');
      parts.push('### Claim');
      parts.push('');
      parts.push(f.Claim || '_n/a_');
      parts.push('');
      parts.push('### Observed');
      parts.push('');
      parts.push(f.Observed || '_n/a_');
      parts.push('');
      parts.push('### Impact');
      parts.push('');
      parts.push(f.Impact || '_n/a_');
      parts.push('');
      parts.push('### Fix');
      parts.push('');
      parts.push(f.Fix || '_n/a_');
      parts.push('');
    }
    fs.writeFileSync(path.join(OUT_DIR, g.file), `${parts.join('\n')}\n`, 'utf8');
    console.log(`written: docs/findings/${g.file} (${items.length} finding)`);
  }
}

main();
