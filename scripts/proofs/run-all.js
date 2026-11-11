'use strict';

/**
 * مشغّل حزمة الإثباتات.
 *
 * يشغّل كل proof على حدة (عملية منفصلة) ويجمع النتائج في:
 *   evidence/proofs/<ID>-<slug>.md     تقرير كل دليل
 *   evidence/findings.json              فهرس قابل للقراءة آلياً
 *
 * كود خروج runners: 0 = كل الأدلة مُثبتة، 1 = وجود أدلة لم تتكرر.
 *
 * ملاحظة: prooflibs تُنهي العملية بـ process.exit، لذا كل proof يعمل
 * في عملية مستقلة — وهذا يضمن أن require.cache لن يلوّث نتيجة غيره.
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const PROOFS_DIR = __dirname;
const REPO_ROOT = path.resolve(PROOFS_DIR, '..', '..');
const EVIDENCE_DIR = process.env.EVIDENCE_DIR || path.join(REPO_ROOT, 'evidence');

const files = fs.readdirSync(PROOFS_DIR)
  .filter((f) => /^P\d+-.*\.js$/.test(f))
  .sort();

const results = [];

console.log(`\n=== حزمة إثباتات بوت واتساب — ${files.length} دليل ===\n`);

for (const file of files) {
  const started = Date.now();
  const res = spawnSync(process.execPath, [path.join(PROOFS_DIR, file)], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    shell: false,
    maxBuffer: 32 * 1024 * 1024,
    timeout: 20 * 60 * 1000,
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
  });
  const ms = Date.now() - started;
  const out = `${res.stdout || ''}${res.stderr || ''}`;
  const id = file.split('-')[0];
  const verdict = out.includes('- **Verdict:** REPRODUCED') ? 'REPRODUCED'
    : out.includes('- **Verdict:** NOT REPRODUCED') ? 'NOT REPRODUCED' : 'ERROR';
  const verdictLine = out.split('\n').find((l) => l.includes('- **Severity:**')) || '';
  const severity = (verdictLine.match(/\*\*Severity:\*\* (\w+)/) || [])[1] || '?';
  const titleLine = out.split('\n').find((l) => l.startsWith('# ')) || '';
  const title = titleLine.replace(/^#\s*/, '').replace(new RegExp(`^${id}\\s*[—-]\\s*`), '');

  results.push({ id, file, verdict, severity, title, ms, exitCode: res.status });

  const mark = verdict === 'REPRODUCED' ? 'REPRODUCED' : verdict === 'NOT REPRODUCED' ? 'CLEAN   ' : 'ERROR   ';
  console.log(`  [${mark}] ${id}  ${severity.padEnd(8)} ${title.slice(0, 68)}  (${Math.round(ms / 1000)}s)`);
  if (verdict === 'ERROR') {
    console.log(`      ↳ ${out.split('\n').filter((l) => l.includes('Error')).slice(0, 2).join(' | ')}`);
  }
}

const errors = results.filter((r) => r.verdict === 'ERROR');
const reproduced = results.filter((r) => r.verdict === 'REPRODUCED');
const clean = results.filter((r) => r.verdict === 'NOT REPRODUCED');

console.log('\n--- الخلاصة ---');
console.log(`  مُثبتة (خلل موجود):  ${reproduced.length}`);
console.log(`  غير متكررة (سليم):   ${clean.length}`);
console.log(`  أخطاء في الأدلة:     ${errors.length}`);
console.log(`  المخرجات: ${path.join(EVIDENCE_DIR, 'proofs')}`);

const summaryPath = path.join(EVIDENCE_DIR, 'proof-run.json');
try {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  fs.writeFileSync(summaryPath, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    total: results.length,
    reproduced: reproduced.length,
    clean: clean.length,
    errors: errors.length,
    results,
  }, null, 2)}\n`, 'utf8');
  console.log(`  ملخص التشغيل: ${summaryPath}`);
} catch (err) {
  console.error(`تعذّر حفظ الملخص: ${err.message}`);
}

process.exit(errors.length > 0 ? 1 : 0);
