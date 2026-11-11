'use strict';

/**
 * P14 — مصادقة مفتوحة عند غياب المفتاح (فحص عام لكل الموديولات).
 *
 * هذا هو الشكل العام لثغرة P03: أي دالة تتحقق من مفتاح، وتُرجع "مقبول"
 * عندما يكون المفتاح غائباً. المسح عام على src/ ولا يحتاج تكييف.
 *
 * كود خروج: 0 = وُجد خلل، 2 = لم يتكرر، 3 = غير قابل للتطبيق.
 */

const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT, say, section, finish } = require('./_lib');

/** يقرّر هل الملف جزء من مسار حسّاس (مال/مصادقة/ويب هوك). */
function isSensitive(file) {
  return /payment|verif|auth|webhook|admin|refund|coupon|digital|secret|httpsms|openwa/i.test(file);
}

function main() {
  const srcDir = path.join(REPO_ROOT, 'src');
  if (!fs.existsSync(srcDir)) {
    finish({
      id: 'P14',
      slug: 'unconfigured-auth-fail-open-scan',
      title: 'مصادقة مفتوحة عند غياب المفتاح — فحص عام',
      severity: 'critical',
      area: 'security',
      refs: ['src/**/*.js'],
      claim:
        'أي دالة تتحقق من مفتاح أو توكن وتُرجع "مقبول" عندما يكون المفتاح غائباً '
        + 'تُفتح بلا مصادقة في كل بيئة لا يوجد فيها production.',
      expected:
        'أن تفشل المصادقة مغلقاً دائماً: غياب المفتاح أو غياب الترويسة يعني رفض الطلب.',
      observed: 'لم يُعثر على نمط مفتوح.',
      impact: 'طلب مزيف يُقبل بلا مصادقة.',
      fix: 'اجعل الفرع الذي يعالج غياب المفتاح يُرجع false دائماً.',
      reproduced: false,
    });
  }

  const hits = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!e.name.endsWith('.js')) continue;
      const rel = path.relative(REPO_ROOT, p).replace(/\\/g, '/');
      const lines = fs.readFileSync(p, 'utf8').split('\n');
      lines.forEach((l, i) => {
        const window = lines.slice(i, i + 5).join('\n');
        // 1) فحص مفتاح/توكن غائب ⇒ return true أو return ... !== 'production'
        if (/if\s*\(\s*!\s*[\w.]*\s*(key|token|secret|signature|credential|apikey)/i.test(l)) {
          if (/return\s+true\b/i.test(window)
            || /return\s+[^;]*!==\s*['"]production['"]/i.test(window)
            || /return\s+[^;]*===\s*['"]production['"]/i.test(window)) {
            hits.push({ rel, line: i + 1, code: l.trim(), kind: 'مفتاح غائب ⇒ يُقبل' });
          }
        }
        // 2) غياب ترويسة الطلب ⇒ return true
        if (/if\s*\([^)]*rawHeaders[^)]*\)\s*return\s+true/i.test(l)) {
          hits.push({ rel, line: i + 1, code: l.trim(), kind: 'غياب الترويسة ⇒ يُقبل' });
        }
        // 3) فحص مفتاح غائب ⇒ return ... !== 'production'
        if (/return\s+[^;]*NODE_ENV\s*!==\s*['"]production['"]/i.test(l)) {
          hits.push({ rel, line: i + 1, code: l.trim(), kind: 'مقبول خارج production' });
        }
      });
    }
  };
  walk(srcDir);

  section('المواضع التي تعطي "مقبول" عند غياب المفتاح');
  if (!hits.length) say('لا شيء — لا يوجد نمط مفتوح في src/.');
  hits.forEach((h) => {
    say(`${h.rel}:${h.line}  [${h.kind}]`);
    say(`    ${h.code.slice(0, 140)}`);
  });

  section('منها في مسار حسّاس');
  const sensitive = hits.filter((h) => isSensitive(h.rel));
  sensitive.forEach((h) => say(`${h.rel}:${h.line}  — ${h.kind}`));
  say(`مواضع حسّاسة: ${sensitive.length} من ${hits.length}`);

  const reproduced = sensitive.length > 0;

  finish({
    id: 'P14',
    slug: 'unconfigured-auth-fail-open-scan',
    title: 'مصادقة مفتوحة عند غياب المفتاح — فحص عام',
    severity: 'critical',
    area: 'security',
    refs: hits.length ? hits.slice(0, 12).map((h) => `${h.rel}:${h.line}`) : ['src/**/*.js'],
    claim:
      'أي دالة تتحقق من مفتاح أو توكن وتُرجع "مقبول" عندما يكون المفتاح غائباً '
      + 'تُفتح بلا مصادقة في كل بيئة لا يوجد فيها production.',
    expected:
      'أن تفشل المصادقة مغلقاً دائماً: غياب المفتاح أو غياب الترويسة يعني رفض الطلب، '
      + 'بغض النظر عن قيمة أي متغيّر بيئة.',
    observed:
      hits.length
        ? `${hits.length} موضعاً، منها ${sensitive.length} في مسار حسّاس. `
          + `المواضع الحسّاسة: ${sensitive.map((h) => `${h.rel}:${h.line}`).join('، ')}.`
        : 'لم يُعثر على النمط في src/.',
    impact:
      'في بيئة staging أو development أو أي نشر بلا NODE_ENV=production صحيح، '
      + 'يقبل المسار طلباً بلا أي مفتاح. لو كان المسار يستقبل دفعاً أو بيانات '
      + 'عميل، يصبح الحقن ممكناً بلا مصادقة.',
    fix:
      'اجعل الفشل مغلقاً في كل الحالات:\n'
      + '```js\n'
      + 'if (!configuredKey) return false;\n'
      + 'if (!headerKey) return false;\n'
      + '```\n'
      + 'ولا تعتمد على NODE_ENV لتحديد مستوى الأمان.',
    reproduced,
  });
}

main();
