'use strict';

/**
 * يولّد صفحة الـfindings لكل subject من تقارير الأدلة.
 *
 * الهدف: أن تبقى صفحات الـfindings متزامنة مع الأدلة دائماً — لا تكرار يدوي.
 * كل فقرة في صفحة الـfinding تُنسخ من تقرير الدليل نفسه.
 *
 * التشغيل: node scripts/build-findings-docs.js [--subject id]
 */

const fs = require('node:fs');
const path = require('node:path');

const cfgMod = require('./proofs/config');
const overrides = cfgMod.fromArgv();

let cfg;
try {
  cfg = cfgMod.resolve(overrides);
} catch (err) {
  console.error(`\n${err.message}\n`);
  process.exit(2);
}

const SUBJECTS_DIR = path.join(cfg.harnessRoot, 'subjects');

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
  const verdict = md.match(/\*\*Verdict:\*\* (.+)/);
  return {
    title: h1 ? h1[1] : '',
    severity: sev ? sev[1] : '?',
    area: area ? area[1].trim() : '?',
    refs: refs ? refs[1].trim() : '',
    verdict: verdict ? verdict[1].trim() : '',
    ...out,
  };
}

function main() {
  const proofsDir = cfg.proofsDir;
  if (!fs.existsSync(proofsDir)) {
    console.error(`لا يوجد مجلد أدلة: ${proofsDir}`);
    process.exit(2);
  }
  const files = fs.readdirSync(proofsDir).filter((f) => f.endsWith('.md')).sort();
  const findings = files.map((f) => ({ file: f, ...sections(fs.readFileSync(path.join(proofsDir, f), 'utf8')) }));

  const groups = [
    {
      key: 'critical', file: 'findings-critical.md', title: 'Critical findings', intro:
        'Each of these either moves money without a payment, gives away a product, accepts '
        + 'unauthenticated input, or stops the bot from starting on the target server. All of '
        + 'them are reproduced by a script that runs the shipped code.',
    },
    {
      key: 'high', file: 'findings-high.md', title: 'High findings', intro:
        'These are safety properties the design claims to hold and does not. None of them is an '
        + 'attack in itself; each one removes a guard that another part of the system relies on.',
    },
    {
      key: 'medium', file: 'findings-medium.md', title: 'Medium findings', intro:
        'A path that exists, is reachable, and does nothing — or that moves money in one '
        + 'direction only. Both are customer-visible.',
    },
    {
      key: 'info', file: 'findings-controls.md', title: 'Verified guardrails and baselines', intro:
        'Not defects. These are the control points: the properties that were checked and hold, '
        + 'and the measurements that the other findings were taken against. They are published '
        + 'so the audit is not read as a claim that nothing works.',
    },
  ];

  const subjectDir = path.join(SUBJECTS_DIR, cfg.subject);
  fs.mkdirSync(subjectDir, { recursive: true });

  for (const g of groups) {
    const items = findings.filter((f) => f.severity === g.key);
    if (!items.length) continue;
    const parts = [];
    parts.push(`# ${g.title} — ${cfg.subjectTitle}`);
    parts.push('');
    parts.push(g.intro);
    parts.push('');
    parts.push('| ID | Finding | Area | Verdict | Proof |');
    parts.push('|---|---|---|---|---|');
    for (const f of items) {
      const id = f.file.split('-')[0];
      parts.push(`| ${id} | ${f.title.replace(/^P\d+\s*[—-]\s*/, '')} | ${f.area} | ${f.verdict} | [proof](../../evidence/${cfg.subject}/proofs/${f.file}) |`);
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
      parts.push(`- **Verdict:** ${f.verdict}`);
      parts.push(`- **Proof:** [${f.file}](../../evidence/${cfg.subject}/proofs/${f.file})`);
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
    fs.writeFileSync(path.join(subjectDir, g.file), `${parts.join('\n')}\n`, 'utf8');
    console.log(`written: subjects/${cfg.subject}/${g.file} (${items.length} finding)`);
  }

  // فهرس مختصر للـsubject
  const summary = [];
  summary.push(`# ${cfg.subjectTitle}`);
  summary.push('');
  summary.push(cfg.subjectDescription || '');
  summary.push('');
  summary.push('| Severity | Count |');
  summary.push('|---|---|');
  for (const g of groups) {
    const n = findings.filter((f) => f.severity === g.key).length;
    if (n) summary.push(`| ${g.key} | ${n} |`);
  }
  summary.push(`| **total** | **${findings.length}** |`);
  summary.push('');
  summary.push('- [Critical](findings-critical.md)');
  summary.push('- [High](findings-high.md)');
  summary.push('- [Medium](findings-medium.md)');
  summary.push('- [Control points and baselines](findings-controls.md)');
  summary.push('');
  summary.push(`Raw evidence: [\`evidence/${cfg.subject}/\`](../../evidence/${cfg.subject}/)`);
  fs.writeFileSync(path.join(subjectDir, 'README.md'), `${summary.join('\n')}\n`, 'utf8');
  console.log(`written: subjects/${cfg.subject}/README.md`);

  buildRootIndex();
}

/** يبني الفهرس العام لكل الـsubjects الموجودة. */
function buildRootIndex() {
  const rootIndex = {
    generatedAt: new Date().toISOString(),
    subjects: [],
  };
  const evidenceRoot = path.join(cfg.harnessRoot, 'evidence');
  if (!fs.existsSync(evidenceRoot)) return;
  for (const entry of fs.readdirSync(evidenceRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const id = entry.name;
    const idxPath = path.join(evidenceRoot, id, 'findings.json');
    if (!fs.existsSync(idxPath)) continue;
    const idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
    const bySeverity = {};
    for (const f of idx.findings || []) {
      bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
    }
    const subjectDir = path.join(SUBJECTS_DIR, id);
    const readme = path.join(subjectDir, 'README.md');
    rootIndex.subjects.push({
      id,
      title: idx.subjectTitle || id,
      total: (idx.findings || []).length,
      bySeverity,
      narrative: fs.existsSync(readme) ? `subjects/${id}/README.md` : null,
      evidence: `evidence/${id}/`,
      findings: (idx.findings || []).map((f) => ({
        id: f.id, title: f.title, severity: f.severity, area: f.area, verdict: f.verdict,
        evidence: `evidence/${id}/${f.evidence}`,
      })),
    });
  }
  rootIndex.subjects.sort((a, b) => a.id.localeCompare(b.id));
  fs.writeFileSync(path.join(cfg.harnessRoot, 'findings.json'), `${JSON.stringify(rootIndex, null, 2)}\n`, 'utf8');
  console.log(`written: findings.json (${rootIndex.subjects.length} subject)`);
}

main();
