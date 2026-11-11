'use strict';

/**
 * P16 — أخطاء تُبتلع بلا تسجيل.
 *
 * يفحص src/ ويجد:
 *   - catch فارغ (لا يفعل شيئاً ولا يسجّل)
 *   - catch يسجّل فقط بالمconsole ولا يعيد الأثر (خطأ مال يبتلع)
 *   - promises معلّقة (floating) مع معالج فارغ
 *
 * كود خروج: 0 = وُجدت مواضع، 2 = لم تتكرر، 3 = غير قابل للتطبيق.
 */

const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT, say, section, finish } = require('./_lib');

/** الموديولات التي تُعدّ مسار مال — خطأ فيها أخطر. */
const MONEY_HINTS = /payment|verif|refund|coupon|digital|balance|wallet|charge|billing|invoice/i;

function main() {
  const srcDir = path.join(REPO_ROOT, 'src');
  if (!fs.existsSync(srcDir)) {
    finish({
      id: 'P16', slug: 'swallowed-error-scan', title: 'أخطاء تُبتلع بلا تسجيل',
      severity: 'medium', area: 'reliability', refs: ['src/**/*.js'],
      claim: 'كل catch يسجّل الخطأ على الأقل.', expected: 'تسجيل كل خطأ.',
      observed: 'لا يوجد src/.', impact: '-', fix: '-', reproduced: false,
    });
  }

  const emptyCatches = [];
  const loggedOnly = [];
  const floating = [];

  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!e.name.endsWith('.js')) continue;
      const rel = path.relative(REPO_ROOT, p).replace(/\\/g, '/');
      const src = fs.readFileSync(p, 'utf8');
      const lines = src.split('\n');

      lines.forEach((l, i) => {
        // catch { } أو catch (e) { /* تعليق */ }
        const m = /catch\s*(\([^)]*\))?\s*\{\s*(?:\/\*[\s\S]*?\*\/\s*)?\}/.exec(l);
        if (m) {
          emptyCatches.push({ rel, line: i + 1, code: l.trim() });
          return;
        }
        // catch (...) { console.warn(...) } — يسجّل لكن لا يعيد الأثر
        if (/catch\s*\([^)]*\)\s*\{/.test(l)) {
          const body = lines.slice(i, i + 6).join('\n');
          const blockEnd = body.indexOf('}');
          const block = blockEnd > -1 ? body.slice(0, blockEnd) : body;
          const onlyConsole = /^\s*(console\.(warn|log|error)\([^;]*\);?\s*)+$/s.test(block)
            && !/throw|return\s+false|return\s+null|res\.|process\./.test(block);
          if (onlyConsole) {
            loggedOnly.push({ rel, line: i + 1, code: l.trim(), money: MONEY_HINTS.test(rel) });
          }
        }
        // promise معلّق: .catch(() => {}) أو .catch(()=>{})
        const f = /\.catch\s*\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/.exec(l);
        if (f) floating.push({ rel, line: i + 1, code: l.trim(), money: MONEY_HINTS.test(rel) });
      });
    }
  };
  walk(srcDir);

  section('catch فارغ — لا يسجّل ولا يفعل شيئاً');
  if (!emptyCatches.length) say('لا شيء.');
  emptyCatches.forEach((h) => say(`${h.rel}:${h.line}  ${h.code.slice(0, 120)}`));

  section('catch يسجّل فقط (لا يعيد الأثر)');
  if (!loggedOnly.length) say('لا شيء.');
  loggedOnly.forEach((h) => {
    const tag = h.money ? '  ⚠️ مسار مال' : '';
    say(`${h.rel}:${h.line}${tag}  ${h.code.slice(0, 120)}`);
  });

  section('promises معلّقة (floating) بمعالج فارغ');
  if (!floating.length) say('لا شيء.');
  floating.forEach((h) => {
    const tag = h.money ? '  ⚠️ مسار مال' : '';
    say(`${h.rel}:${h.line}${tag}  ${h.code.slice(0, 120)}`);
  });

  section('الخلاصة');
  const moneyHits = [...loggedOnly, ...floating].filter((h) => h.money);
  say(`catch فارغ: ${emptyCatches.length}`);
  say(`catch يسجّل فقط: ${loggedOnly.length}`);
  say(`promises معلّقة: ${floating.length}`);
  say(`منها في مسار مال: ${moneyHits.length}`);
  moneyHits.forEach((h) => say(`  ${h.rel}:${h.line}`));

  const reproduced = emptyCatches.length > 0 || moneyHits.length > 0;

  finish({
    id: 'P16',
    slug: 'swallowed-error-scan',
    title: 'أخطاء تُبتلع بلا تسجيل — وخصوصاً في المسار المالي',
    severity: 'medium',
    area: 'reliability',
    refs: (moneyHits.length ? moneyHits : loggedOnly).slice(0, 12).map((h) => `${h.rel}:${h.line}`),
    claim:
      'كل خطأ يجب أن يُسجَّل على الأقل. الخطأ الذي يُبتلع في catch يسجّل فقط '
      + 'يعني أن مساراً مالياً يستمر كأنه نجح.',
    expected:
      'أن يسجّل كل catch الخطأ، وأن يعيد الأثر (throw أو return false أو تعديل الحالة) '
      + 'ألاّ أن يترك العملية في حالة نصف مكتملة.',
    observed:
      `catch فارغ: ${emptyCatches.length}. `
      + `catch يسجّل فقط: ${loggedOnly.length}. `
      + `promises معلّقة بمعالج فارغ: ${floating.length}. `
      + `منها في مسار مال: ${moneyHits.length}. `
      + (moneyHits.length ? `المواضع: ${moneyHits.map((h) => `${h.rel}:${h.line}`).join('، ')}.` : ''),
    impact:
      'في مسار الدفع: فشل تحديث رصيد أو كوبون أو تأكيد حجز يبتلع الخطأ، فتُسجَّل '
      + 'الدفعة بينما لم تكتمل آثارها. الفرق يظهر لاحقاً كخلل تسوية لا كخطأ.',
    fix:
      'في مسار المال: ارمي الخطأ داخل المعاملة حتى تُلغى العملية بالكامل، '
      + 'أو سجّله في ops_log مع كل التفاصيل وأعِد الحالة صراحةً. '
      + 'في غير مسار المال: الـcatch الفارغ مقبول إذا كان الغرض تجاهل خطأ متوقّع — '
      + 'لكن اترك تعليقاً يشرح لماذا.',
    reproduced,
  });
}

main();
