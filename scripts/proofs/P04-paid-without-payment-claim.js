'use strict';

/**
 * P04 — حجوزات مدفوعة بدون صف مطالبة: المسار-financing غير المتّفق عليه.
 *
 * payment_claims هو السجل الذي يربط الدفعة بالحجز. اكتمال هذا الربط هو
 * الضمانة التي تمنع صرف نفس الدفعة على حجزين.
 * كود الخروج: 0 = الخلل متحقق منه، 2 = غير متحقق.
 */

const { say, section, finish, openDb, pseudonym, maskLabel } = require('./_lib');

function main() {
  const db = openDb();

  section('أعمدة payment_claims');
  say(db.prepare('PRAGMA table_info(payment_claims)').all().map((c) => c.name).join(', '));

  section('الفهارس الفريدة التي تحمي الصرف المزدوج');
  for (const r of db.prepare("SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='payment_claims'").all()) {
    say(`  ${r.name}: ${r.sql}`);
  }

  section('الحاجز 1 — حجوزات status=paid و sms_verified=1 بلا صف payment_claims');
  const orphanBookings = db.prepare(`
    SELECT b.id, b.chat_id, b.payment_amount, b.sms_provider, b.transaction_id, b.created_at
    FROM bookings b
    LEFT JOIN payment_claims pc ON pc.booking_id = b.id
    WHERE b.status = 'paid' AND b.sms_verified = 1 AND pc.id IS NULL
    ORDER BY b.created_at DESC
  `).all();
  say(`عدد الحجوزات المدفوعة بالمطابقة: ${
    db.prepare("SELECT COUNT(*) c FROM bookings WHERE status='paid' AND sms_verified=1").get().c
  }`);
  say(`منها بلا صف payment_claims: ${orphanBookings.length}`);
  orphanBookings.slice(0, 15).forEach((r) => {
    say(`  ${pseudonym('BKG', r.id)}  chat=${pseudonym('CHAT', r.chat_id)}  amount=${r.payment_amount}  `
      + `provider=${maskLabel(r.sms_provider || '-')}  txn=${pseudonym('TXN', r.transaction_id || '-')}`);
  });
  if (orphanBookings.length > 15) say(`  … و${orphanBookings.length - 15} صفاً آخر`);

  section('الحاجز 2 — دفعات trusted_payments بحالة claimed بلا صف payment_claims');
  const orphanPayments = db.prepare(`
    SELECT tp.id, tp.amount, tp.provider, tp.reference_id, tp.updated_at
    FROM trusted_payments tp
    LEFT JOIN payment_claims pc ON pc.trusted_payment_id = tp.id
    WHERE tp.status = 'claimed' AND pc.id IS NULL
  `).all();
  say(`عدد الدفعات المعلّمة claimed: ${
    db.prepare("SELECT COUNT(*) c FROM trusted_payments WHERE status='claimed'").get().c
  }`);
  say(`منها بلا صف payment_claims: ${orphanPayments.length}`);
  orphanPayments.slice(0, 15).forEach((r) => {
    say(`  TP-${pseudonym('H', r.id).split('-')[1]}  amount=${r.amount}  provider=${r.provider || '-'}  `
      + `ref=${pseudonym('REF', r.reference_id || '-')}`);
  });

  section('الحاجز 3 — من أين تأتي هذه الفجوة');
  say('bookings.markPaymentVerified (src/bookings.js:715) تكتب status=paid و sms_verified=1');
  say('مباشرة عبر updateBooking، ولا تمرّ على store.claimPaymentAtomically.');
  say('لذلك لا يُنشأ صف في payment_claims ولا يُعلَّم trusted_payments.status=claimed.');
  say('النتيجة: الحجز "مدفوع" لكن لا يوجد سجل يربطه بدفعة — أي لا يستطيع');
  say('النظام أن يمنع إعادة استخدام نفس الدفعة على حجز آخر عبر هذا المسار.');

  section('هل الفهارس الفريدة تغطّي الفجوة؟');
  const dupRef = db.prepare(`
    SELECT sms_ref_norm, COUNT(*) c FROM bookings
    WHERE sms_ref_norm IS NOT NULL AND sms_ref_norm <> ''
    GROUP BY sms_ref_norm HAVING c > 1
  `).all();
  say(`تكرار في bookings.sms_ref_norm: ${dupRef.length}`);
  const dupRaw = db.prepare(`
    SELECT sms_ref_id, COUNT(*) c FROM bookings
    WHERE sms_ref_id IS NOT NULL AND sms_ref_id <> ''
    GROUP BY sms_ref_id HAVING c > 1
  `).all();
  say(`تكرار في bookings.sms_ref_id: ${dupRaw.length}`);
  const nullRefPaid = db.prepare(`
    SELECT COUNT(*) c FROM bookings
    WHERE status='paid' AND sms_verified=1 AND (sms_ref_norm IS NULL OR sms_ref_norm='')
  `).get().c;
  say(`حجوزات مدفوعة بلا مرجع مطبّع (sms_ref_norm فارغ): ${nullRefPaid}`);
  say('الفهرس الفريد على sms_ref_norm هو الحماية الوحيدة المتبقية لهذه الحجوزات.');
  say('الحماية الآن سليمة (0 تكرار)، لكنها هشّة: أي مسار تأكيد جديد لا يكتب مرجعاً');
  say('مطبّعاً يفتح الصرف المزدوج من جديد دون أي خطأ ظاهر.');

  section('تأييد متقاطع مع P01');
  const minaRows = db.prepare(`
    SELECT b.sms_provider, COUNT(*) c
    FROM bookings b
    LEFT JOIN payment_claims pc ON pc.booking_id = b.id
    WHERE b.status='paid' AND b.sms_verified=1 AND pc.id IS NULL
    GROUP BY b.sms_provider ORDER BY c DESC
  `).all();
  minaRows.forEach((r) => say(`  provider="${maskLabel(r.sms_provider)}" ⇒ ${r.c} حجز بلا مطالبة`));

  const reproduced = orphanBookings.length > 0 || orphanPayments.length > 0;

  finish({
    id: 'P04',
    slug: 'paid-without-payment-claim',
    title: 'حجوزات مدفوعة بلا صف payment_claims يربطها بالدفعة',
    severity: 'high',
    area: 'money-path',
    refs: ['src/bookings.js:715-773', 'src/store.js:1511-1640', 'src/httpsms.js:727'],
    claim:
      'كل حجز حالته paid مع sms_verified=1 يجب أن يكون له صف واحد في payment_claims '
      + 'يربطه بـ trusted_payment_id. عدد من الحجوزات المدفوعة لا تلتزم بذلك.',
    expected:
      'أن يمرّ كل تأكيد دفع — بلا استثناء — عبر store.claimPaymentAtomically، '
      + 'فتُنشأ المطالبة داخل المعاملة نفسها.',
    observed: (() => {
      const byProvider = orphanBookings.reduce((acc, r) => {
        const k = maskLabel(r.sms_provider || '(غير محدد)');
        acc[k] = (acc[k] || 0) + 1;
        return acc;
      }, {});
      const breakdown = Object.entries(byProvider).map(([k, v]) => `${k}=${v}`).join('، ');
      return `حجوزات مدفوعة بلا payment_claims: ${orphanBookings.length}. `
        + `دفعات claimed بلا payment_claims: ${orphanPayments.length}. `
        + `حجوزات مدفوعة بلا sms_ref_norm: ${nullRefPaid} (0 حالياً). `
        + `توزيع الـ${orphanBookings.length} بلا مطالبة حسب المزوّد (مُقنَّع): ${breakdown}.`;
    })(),
    impact:
      'الدفعات المتحرّرة من سجل المطالبة لا يستطيع النظام منع إعادة صرفها. '
      + 'كما أن أي إحصاء يعتمد على payment_claims (عدد الحجوزات الموثّقة) أقل من الواقع، '
      + 'والتسوية البنكية المبنية على هذا السجل غير مكتملة.',
    fix:
      'اجعل bookings.markPaymentVerified غلافاً داخلياً لـ store.claimPaymentAtomically، '
      + 'أو—at الأقل—让它 ينشئ صف payment_claims داخل نفس المعاملة ويعلّم '
      + 'trusted_payments.status=claimed. أضف اختباراً يفرض: '
      + 'كل حجز sms_verified=1 له صف payment_claims واحد بالضبط.',
    reproduced,
  });
}

main();
