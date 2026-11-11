'use strict';

/**
 * مشغّل حزمة الإثباتات.
 *
 * يشغّل كل proof على حدة (عملية منفصلة) ويجمع النتائج في مجلد أدلة الـsubject:
 *   evidence/<subject>/proofs/<ID>-<slug>.md
 *   evidence/<subject>/findings.json
 *   evidence/<subject>/proof-run.json
 *
 * كود خروج runners: 0 = كل الأدلة مُثبتة بلا أخطاء، 1 = وجود أخطاء أو تغطية ناقصة.
 *
 * ملاحظة: prooflibs تُنهي العملية بـ process.exit، لذا كل proof يعمل
 * في عملية مستقلة — وهذا يضمن أن require.cache لن يلوّث نتيجة غيره.
 *
 * أمثلة:
 *   node scripts/proofs/run-all.js
 *   node scripts/proofs/run-all.js --subject my-bot --bot-repo /path/to/bot
 *   node scripts/proofs/run-all.js --only P08 P09 P13
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const cfgMod = require('./config');
const overrides = cfgMod.fromArgv();

/** --only P08 P09 */
let only = null;
const argv = process.argv.slice(2);
const onlyIdx = argv.indexOf('--only');
if (onlyIdx !== -1) {
  only = new Set();
  for (let i = onlyIdx + 1; i < argv.length; i += 1) {
    if (!argv[i] || argv[i].startsWith('--')) break;
    only.add(argv[i].toUpperCase());
  }
}

let cfg;
try {
  cfg = cfgMod.resolve(overrides);
} catch (err) {
  console.error(`\n${err.message}\n`);
  process.exit(2);
}

const PROOFS_DIR = __dirname;
const manifest = JSON.parse(fs.readFileSync(path.join(PROOFS_DIR, 'manifest.json'), 'utf8'));
const metaById = new Map(manifest.proofs.map((p) => [p.id, p]));

console.log('\n=== حزمة إثباتات بوت واتساب ===');
console.log(cfgMod.describe(cfg));
console.log(`\nالأدلة المعلنة في المانيفست: ${manifest.proofs.length}\n`);

const files = fs.readdirSync(PROOFS_DIR)
  .filter((f) => /^P\d+-.*\.js$/.test(f))
  .sort();

const results = [];

for (const file of files) {
  const id = file.split('-')[0];
  if (only && !only.has(id)) continue;
  const meta = metaById.get(id) || {};
  const started = Date.now();
  const res = spawnSync(process.execPath, [path.join(PROOFS_DIR, file)], {
    cwd: cfg.botRepo,
    encoding: 'utf8',
    shell: false,
    maxBuffer: 32 * 1024 * 1024,
    timeout: 20 * 60 * 1000,
    env: {
      ...process.env,
      NO_COLOR: '1',
      FORCE_COLOR: '0',
      BOT_REPO: cfg.botRepo,
      BOT_DATA_DIR: cfg.dataDir,
      AUDIT_SUBJECT: cfg.subject,
      // EVIDENCE_DIR هو جذر الأدلة — الـsubject يُضاف تحته داخل العملية.
      EVIDENCE_DIR: cfg.evidenceRoot,
    },
  });
  const ms = Date.now() - started;
  const out = `${res.stdout || ''}${res.stderr || ''}`;
  const exit = res.status;
  const verdict = out.includes('- **Verdict:** REPRODUCED') ? 'REPRODUCED'
    : out.includes('- **Verdict:** NOT REPRODUCED') ? 'NOT REPRODUCED'
      : out.includes('- **Verdict:** NOT APPLICABLE') ? 'NOT APPLICABLE' : 'ERROR';
  const severity = (out.match(/\*\*Severity:\*\* (\w+)/) || [])[1] || meta.severity || '?';
  const titleLine = out.split('\n').find((l) => l.startsWith('# ')) || '';
  const title = titleLine.replace(/^#\s*/, '').replace(new RegExp(`^${id}\\s*[—-]\\s*`), '');

  results.push({
    id, file, verdict, severity, title, scope: meta.scope || 'unknown', ms, exitCode: exit,
  });

  const mark = verdict === 'REPRODUCED' ? 'REPRODUCED'
    : verdict === 'NOT REPRODUCED' ? 'CLEAN     '
      : verdict === 'NOT APPLICABLE' ? 'N/A       ' : 'ERROR     ';
  console.log(`  [${mark}] ${id}  ${(meta.scope || '?').padEnd(11)} ${severity.padEnd(8)} ${title.slice(0, 52)}  (${Math.round(ms / 1000)}s)`);
  if (verdict === 'ERROR') {
    const errLine = out.split('\n').filter((l) => /Error:|SqliteError|TypeError|ReferenceError/.test(l)).slice(0, 2);
    console.log(`      ↳ ${errLine.join(' | ').slice(0, 200)}`);
  }
}

/* ------------------------------------------------------------------ */
/* التغطية                                                             */
/* ------------------------------------------------------------------ */

const declared = manifest.proofs.map((p) => p.id);
const executed = results.map((r) => r.id);
// عند --only لا نُبلّغ عن أدلة لم تُنفَّذ — تشغيل مقصود.
const missing = only ? [] : declared.filter((id) => !executed.includes(id));
const undeclared = executed.filter((id) => !declared.includes(id));

const byScope = {};
for (const r of results) {
  byScope[r.scope] = byScope[r.scope] || { total: 0, reproduced: 0, clean: 0, na: 0, error: 0 };
  byScope[r.scope].total += 1;
  if (r.verdict === 'REPRODUCED') byScope[r.scope].reproduced += 1;
  else if (r.verdict === 'NOT REPRODUCED') byScope[r.scope].clean += 1;
  else if (r.verdict === 'NOT APPLICABLE') byScope[r.scope].na += 1;
  else byScope[r.scope].error += 1;
}

console.log('\n--- التغطية ---');
for (const [scope, s] of Object.entries(byScope)) {
  console.log(`  ${scope.padEnd(12)} إجمالي ${s.total} · مُثبت ${s.reproduced} · سليم ${s.clean} · غير مطبَّق ${s.na} · أخطاء ${s.error}`);
}
if (missing.length) console.log(`  ⚠️ معرّفات في المانيفست بلا سكربت: ${missing.join(', ')}`);
if (undeclared.length) console.log(`  ⚠️ سكربتات بلا تعريف في المانيفست: ${undeclared.join(', ')}`);

const errors = results.filter((r) => r.verdict === 'ERROR');
const reproduced = results.filter((r) => r.verdict === 'REPRODUCED');
const clean = results.filter((r) => r.verdict === 'NOT REPRODUCED');
const na = results.filter((r) => r.verdict === 'NOT APPLICABLE');

// تنظيف تقارير قديمة لم يعد لها سكربت (مثلاً بعد إعادة تسمية دليل)
try {
  const keep = new Set(results.map((r) => `${r.id}-${r.file.split('-').slice(1).join('-').replace(/\.js$/, '')}`));
  if (fs.existsSync(cfg.proofsDir)) {
    for (const f of fs.readdirSync(cfg.proofsDir)) {
      if (!f.endsWith('.md')) continue;
      if (!keep.has(f.replace(/\.md$/, ''))) {
        fs.unlinkSync(path.join(cfg.proofsDir, f));
        console.log(`  (removed stale report: ${f})`);
      }
    }
  }
} catch (err) {
  console.error(`تعذّر تنظيف التقارير القديمة: ${err.message}`);
}

console.log('\n--- الخلاصة ---');
console.log(`  مُثبتة (خلل موجود):  ${reproduced.length}`);
console.log(`  غير متكررة (سليم):   ${clean.length}`);
console.log(`  غير قابلة للتطبيق:  ${na.length}`);
console.log(`  أخطاء في الأدلة:     ${errors.length}`);

const summaryPath = cfg.runFile;
try {
  fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
  fs.writeFileSync(summaryPath, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    subject: cfg.subject,
    subjectTitle: cfg.subjectTitle,
    botRepo: cfg.botRepo,
    manifestVersion: manifest.version,
    total: results.length,
    reproduced: reproduced.length,
    clean: clean.length,
    notApplicable: na.length,
    errors: errors.length,
    coverageByScope: byScope,
    missingFromManifest: missing,
    results,
  }, null, 2)}\n`, 'utf8');
  console.log(`  ملخص التشغيل: ${summaryPath}`);
} catch (err) {
  console.error(`تعذّر حفظ الملخص: ${err.message}`);
}

console.log(`  الأدلة: ${cfg.proofsDir}`);
console.log(`  الفهرس: ${cfg.findingsFile}\n`);

process.exit(errors.length > 0 || missing.length > 0 ? 1 : 0);
