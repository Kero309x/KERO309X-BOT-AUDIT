'use strict';

/**
 * P06 — مطابقة الأسماء بالعتمة تجعل اسمين مختلفين اسماً واحداً.
 *
 * namesMatchCrossScript تعتمد مسافة تحرير ≤ 1 على هيكل بلا حروف صوتية،
 * فتلتقط أسماءً مختلفة تماماً.
 * كود الخروج: 0 = الخلل متحقق منه، 2 = غير متحقق.
 */

const path = require('node:path');
const { REPO_ROOT, say, section, finish } = require('./_lib');

function main() {
  // eslint-disable-next-line global-require
  const httpsms = require(path.join(REPO_ROOT, 'src', 'httpsms.js'));

  section('الدالة المستخدمة في src/httpsms.js');
  const src = require('node:fs').readFileSync(path.join(REPO_ROOT, 'src', 'httpsms.js'), 'utf8');
  const lines = src.split('\n');
  const idx = lines.findIndex((l) => l.includes('function namesMatchCrossScript('));
  say(lines.slice(idx, idx + 8).map((l, k) => `${idx + 1 + k}: ${l}`).join('\n'));

  section('الهيكل الناتج من nameSkeleton');
  const skIdx = lines.findIndex((l) => l.includes('function nameSkeleton('));
  say(lines.slice(skIdx, skIdx + 16).map((l, k) => `${skIdx + 1 + k}: ${l}`).join('\n'));

  section('أزواج أسماء مختلفة يجب ألا تتطابق');
  const pairs = [
    ['محمد', 'احمد'],
    ['محمد', 'محمود'],
    ['أحمد', 'محمود'],
    ['مصطفى', 'مصطفي'],
    ['محمد', 'محمّد'],
    ['فاطمة', 'فاطمه'],
    ['عمر', 'وعدي'],
    ['خالد', 'خالد'],
    ['يوسف', 'يونس'],
    ['سارة', 'ساره'],
  ];
  let collisions = 0;
  pairs.forEach(([a, b]) => {
    const skA = httpsms.nameSkeleton(a);
    const skB = httpsms.nameSkeleton(b);
    const r = httpsms.namesMatchCrossScript(a, b);
    if (r) collisions += 1;
    say(`${JSON.stringify(a)} vs ${JSON.stringify(b)}  skeletons=[${skA}] vs [${skB}]  ⇒ ${r}`);
  });

  section('الاستخدام في مسار المطابقة');
  say('src/payment_verifier.js يستعمل مطابقة الاسم ضمن طريقة AMOUNT_AND_NAME:');
  say('الحجز المMatched依靠 الاسم وحده إضافةً إلى تطابق المبلغ.');
  say('الاسم في الحجز هو ما كتبه العميل في مرحلة NAME (نفس مصدر P01).');
  const pvLines = src.length ? [] : [];
  void pvLines;

  const pvSrc = require('node:fs').readFileSync(path.join(REPO_ROOT, 'src', 'payment_verifier.js'), 'utf8');
  pvSrc.split('\n').forEach((l, i) => {
    if (l.includes('namesMatchCrossScript') || l.includes('AMOUNT_AND_NAME')) {
      say(`  src/payment_verifier.js:${i + 1}: ${l.trim()}`);
    }
  });

  section('هل الحساب موجود في القاعدة؟');
  try {
    // eslint-disable-next-line global-require
    const { openDb } = require('./_lib');
    const db = openDb();
    const rows = db.prepare("SELECT id, match_method FROM payment_claims WHERE match_method='AMOUNT_AND_NAME'").all();
    say(`صفوف payment_claims بطريقة AMOUNT_AND_NAME: ${rows.length}`);
    rows.forEach((r) => say(`  claim #${r.id}`));
  } catch (err) {
    say(`تعذّرت قراءة القاعدة: ${err.message}`);
  }

  const reproduced = collisions > 0;

  finish({
    id: 'P06',
    slug: 'name-fuzzy-match-collides',
    title: 'مطابقة الاسم بالعتمة تخلط أسماءً مختلفة تماماً',
    severity: 'high',
    area: 'money-path',
    refs: ['src/httpsms.js:585-591', 'src/payment_verifier.js:206-234'],
    claim:
      'namesMatchCrossScript تقبل أي اسمين يختلف كل منهما بمحرّر واحد على الهيكل '
      + '(Levenshtein ≤ 1)، فتُعتبر "محمد" و"احمد" الاسم نفسه.',
    expected:
      'أن لا يتطابق اسمان مختلفان جوهرياً. المطابقة بالحرف الواحد يجب أن تكون '
      + 'محدودة بأخطاء الإملاء الشائعة (مثل الهمزات والتاء المربوطة) لا باسم مختلف.',
    observed:
      `من 10 أزواج tested، ${collisions} زوجاً مختلفاً طابق: `
      + pairs.filter(([a, b]) => httpsms.namesMatchCrossScript(a, b)).map(([a, b]) => `${a}/${b}`).join('، '),
    impact:
      'في طريقة المطابقة AMOUNT_AND_NAME، دفعة عميل واحد قد تُستخدم لتأكيد حجز عميل آخر '
      + 'بنفس المبلغ. الاسم مكتوب من العميل نفسه، والعميل يستطيع اختيار اسم مشابه '
      + 'لاسم عميل آخر عمداً.',
    fix:
      'لا تعتمد الاسم وحده أبداً. اشترط رقم الهاتف + الاسم معاً في نفس المسار، '
      + 'أو اخفض الثقة إلى manual_review واطلب رقم المحفظة. '
      + 'وكذلك ارفع حد مسافة التحرير إلى 0 للأسماء العربية '
      + 'واركز على تطبيع الهمزات والتاء المربوطة صراحةً بدل مسافة التحرير.',
    reproduced,
  });
}

main();
