'use strict';

/**
 * P07 — استعلام على عمود غير موجود يُسقط التحقق من تفعيل المنتج الرقمي.
 *
 * src/followups.js:585 يقرأ provider_order_id من digital_orders، بينما
 * العمود الفعلي اسمه order_id.
 * كود الخروج: 0 = الخلل متحقق منه، 2 = غير متحقق.
 */

const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT, say, section, finish, openDb } = require('./_lib');

function main() {
  const fuFile = path.join(REPO_ROOT, 'src', 'followups.js');
  const src = fs.readFileSync(fuFile, 'utf8');
  const lines = src.split('\n');

  section('الاستعلام في src/followups.js');
  const idx = lines.findIndex((l) => l.includes('provider_order_id'));
  if (idx >= 0) {
    say(lines.slice(Math.max(0, idx - 6), idx + 8).map((l, k) => `${Math.max(0, idx - 6) + 1 + k}: ${l}`).join('\n'));
  }

  section('المخطط الفعلي لجدول digital_orders');
  const db = openDb();
  const cols = db.prepare('PRAGMA table_info(digital_orders)').all();
  cols.forEach((c) => say(`  ${c.name} (${c.type})`));
  const hasProvider = cols.some((c) => c.name === 'provider_order_id');
  const hasOrder = cols.some((c) => c.name === 'order_id');
  say(`يحتوي provider_order_id: ${hasProvider}`);
  say(`يحتوي order_id: ${hasOrder}`);

  section('حاجز الدخول إلى فرع DigitalCore — هل يصل أصلاً؟');
  const digitalRows = db.prepare(`
    SELECT b.id, b.package_id, b.network, d.status, d.order_id
    FROM bookings b JOIN digital_orders d ON d.booking_id = b.id
  `).all();
  say(`حجوزات لها صف في digital_orders: ${digitalRows.length}`);
  let guardMatched = 0;
  digitalRows.slice(0, 6).forEach((r) => {
    const pkg = r.package_id || '';
    const net = r.network || '';
    const hit = pkg.startsWith('dc_') || net === 'digital';
    if (hit) guardMatched += 1;
    say(`  id=${r.id}  package_id=${pkg}  network="${net}"  ⇒Guard=${hit}`);
  });
  digitalRows.forEach((r) => {
    const pkg = r.package_id || '';
    const net = r.network || '';
    if (pkg.startsWith('dc_') || net === 'digital') guardMatched += 1;
  });
  say(`حجوزات رقمية يمرّ شرط (packageId.startsWith('dc_') || network==='digital'): ${guardMatched} من ${digitalRows.length}`);
  say('الحجوزات الرقمية الحقيقية تح network="خدمات رقمية" ومعرّف package_id بلا بادئة dc_.');
  say('⇒ فرع DigitalCore في verifyBookingActivation شيفرة ميتة: لا يُنفَّذ أبداً.');

  section('تشغيل الاستعلام كما هو مكتوب (لو وصل الفرع)');
  let sqlError = null;
  try {
    db.prepare('SELECT status, provider_order_id FROM digital_orders WHERE booking_id = ?').get('BKG-X');
    say('نجح الاستعلام (لا خطأ)');
  } catch (err) {
    sqlError = err;
    say(`خطأ SQL: ${err.message}`);
    say(`رمز الخطأ: ${err.code}`);
  }

  section('الاستعلام الصحيح');
  const fixed = db.prepare('SELECT status, order_id FROM digital_orders WHERE booking_id = ?').get('BKG-X');
  say(`نجح ⇒ ${JSON.stringify(fixed)}`);

  section('الأثر');
  say('verifyBookingActivation لا يتحقق من تفعيل المنتجات الرقمية إطلاقاً:');
  say('1) الحاجز لا يمرّ ⇒ فرع DigitalCore لا يُنفَّذ.');
  say('2) لو مرّ، الاستعلام يرمي استثناءً على عمود غير موجود.');
  say('النتيجة: لا تصل رسالة "تم التفعيل" للعميل الرقمي، ولا يكتشف المتابعةُ');
  say('التنشيط اليدوي بعد الاستلام. الاستثناء مخفي لأن الاستدعاء يبتلعه.');

  const reproduced = sqlError !== null && hasOrder && !hasProvider && guardMatched === 0;

  finish({
    id: 'P07',
    slug: 'followups-digital-activation-dead',
    title: 'التحقق من التفعيل الرقمي معطّل: حاجز خاطئ + استعلام على عمود غير موجود',
    severity: 'medium',
    area: 'reliability',
    refs: ['src/followups.js:583-589', 'src/store.js:823-834'],
    claim:
      'verifyBookingActivation يفحص الشرط (b.packageId.startsWith(\'dc_\') || b.network === \'digital\')، '
      + 'والحجوزات الرقمية الحقيقية لا تحقق أيّاً منهما (network="خدمات رقمية"، '
      + 'package_id بلا بادئة dc_) ⇒ الفرع لا يُنفَّذ. '
      + 'وعلاوة على ذلك الاستعلام داخله يقرأ عمود provider_order_id غير الموجود '
      + '(العمود الفعلي order_id).',
    expected:
      'أن يمرّ فرع DigitalCore على الحجوزات الرقمية الحقيقية، وأن يقرأ العمود الفعلي، '
      + 'وأن يفشل صريحاً عند أي خطأ SQL.',
    observed:
      `حجوزات لها صف digital_orders: ${digitalRows.length}. `
      + `منها يمرّ بالحاجز: ${guardMatched}. `
      + (sqlError ? `والاستعلام الداخلي يرمي: ${sqlError.message}. ` : '')
      + 'الاستعلام الصحيح بـ order_id ينجح.',
    impact:
      'لا يتحقق البوت أبداً من تفعيل المنتجات الرقمية: لا تصل رسالة "تم التفعيل" '
      + 'للعميل، ولا تكتشف المتابعةُ التنشيطَ اليدوي بعد الاستلام. '
      + 'الاستثناء مخفي لأن طبقة الاستدعاء تبتلعه، فلا يظهر أي خطأ في السجلات.',
    fix:
      'صحّح الحاجز ليطابق البيانات الفعلية:\n'
      + '```js\n'
      + "const isDigital = b.network === 'خدمات رقمية' || /^DC-/i.test(b.id || '')\n"
      + '  || (b.packageId && b.packageId.startsWith(\'dc_\'));\n'
      + '```\n'
      + 'وصحّح العمود:\n'
      + '```sql\n'
      + 'SELECT status, order_id FROM digital_orders WHERE booking_id = ?\n'
      + '```\n'
      + 'وأضف اختباراً يمرّ على verifyBookingActivation مع صف digital_orders حقيقي.',
    reproduced,
  });
}

main();
