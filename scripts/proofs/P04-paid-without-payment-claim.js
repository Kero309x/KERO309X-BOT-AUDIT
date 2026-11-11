'use strict';

/**
 * P04 — حجوزات مدفوعة بدون صف مطالبة: المسار غير المتّفق عليه.
 *
 * payment_claims هو السجل الذي يربط الدفعة بالحجز. اكتمال هذا الربط هو
 * الضمانة التي تمنع صرف نفس الدفعة على حجزين.
 *
 * أسماء الجداول والأعمدة تأتي من audit.config.json (moneyPath) — يعمل على أي
 * بوت بنفس النموذج.
 *
 * كود خروج: 0 = الخلل متحقق منه، 2 = غير متحقق، 3 = غير قابل للتطبيق.
 */

const { cfg, say, section, finish, openDb, hasTable, notApplicable, pseudonym, maskLabel } = require('./_lib');

function main() {
  const M = cfg.moneyPath;
  const B = M.bookingsTable;
  const C = M.claimsTable;
  const TP = M.trustedPaymentsTable;
  const SV = M.smsVerifiedColumn;
  const PROV = M.providerColumn;
  const REFN = M.refNormalizedColumn;
  const REFR = M.refRawColumn;
  const PAID = M.paidStatus;

  const db = openDb();
  for (const t of [B, C, TP]) {
    if (!hasTable(db, t)) {
      notApplicable({
        id: 'P04',
        slug: 'paid-without-payment-claim',
        title: 'حجوزات مدفوعة بلا صف payment_claims يربطها بالدفعة',
        severity: 'high',
        area: 'money-path',
        refs: [`${B}`, `${C}`],
        claim: 'كل حجز مدفوع بالمطابقة يجب أن يكون له صف في جدول المطالبات.',
        expected: 'ارتباط كامل بين الحجز والدفعة.',
        impact: 'الدفعات غير المرتبطة قابلة لإعادة الصرف.',
        fix: 'اضبط moneyPath في audit.config.json أو انقل الدليل لبوت آخر.',
      }, `الجدول ${t} غير موجود في قاعدة هذا الـsubject`);
    }
  }

  section(`أعمدة ${C}`);
  say(db.prepare(`PRAGMA table_info(${C})`).all().map((c) => c.name).join(', '));

  section('الفهارس الفريدة التي تحمي الصرف المزدوج');
  for (const r of db.prepare(`SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='${C}'`).all()) {
    say(`  ${r.name}: ${r.sql}`);
  }

  section(`الحاجز 1 — حجوزات status=${PAID} و ${SV}=1 بلا صف ${C}`);
  const orphanBookings = db.prepare(`
    SELECT b.id, b.chat_id, b.payment_amount, b.${PROV}, b.transaction_id, b.created_at
    FROM ${B} b
    LEFT JOIN ${C} pc ON pc.booking_id = b.id
    WHERE b.status = '${PAID}' AND b.${SV} = 1 AND pc.id IS NULL
    ORDER BY b.created_at DESC
  `).all();
  const totalPaid = db.prepare(`SELECT COUNT(*) c FROM ${B} WHERE status='${PAID}' AND ${SV}=1`).get().c;
  say(`عدد الحجوزات المدفوعة بالمطابقة: ${totalPaid}`);
  say(`منها بلا صف ${C}: ${orphanBookings.length}`);
  orphanBookings.slice(0, 15).forEach((r) => {
    say(`  ${pseudonym('BKG', r.id)}  chat=${pseudonym('CHAT', r.chat_id)}  amount=${r.payment_amount}  `
      + `provider=${maskLabel(r[PROV] || '-')}  txn=${pseudonym('TXN', r.transaction_id || '-')}`);
  });
  if (orphanBookings.length > 15) say(`  … و${orphanBookings.length - 15} صفاً آخر`);

  section(`الحاجز 2 — دفعات ${TP} بحالة claimed بلا صف ${C}`);
  const orphanPayments = db.prepare(`
    SELECT tp.id, tp.amount, tp.provider, tp.reference_id, tp.updated_at
    FROM ${TP} tp
    LEFT JOIN ${C} pc ON pc.trusted_payment_id = tp.id
    WHERE tp.status = 'claimed' AND pc.id IS NULL
  `).all();
  say(`عدد الدفعات المعلّمة claimed: ${
    db.prepare(`SELECT COUNT(*) c FROM ${TP} WHERE status='claimed'`).get().c
  }`);
  say(`منها بلا صف ${C}: ${orphanPayments.length}`);
  orphanPayments.slice(0, 15).forEach((r) => {
    say(`  TP-${pseudonym('H', r.id).split('-')[1]}  amount=${r.amount}  provider=${r.provider || '-'}  `
      + `ref=${pseudonym('REF', r.reference_id || '-')}`);
  });

  section('الحاجز 3 — من أين تأتي هذه الفجوة');
  say(`${B}.markPaymentVerified تكتب status=${PAID} و ${SV}=1`);
  say('مباشرة عبر updateBooking، ولا تمرّ على store.claimPaymentAtomically.');
  say(`لذلك لا يُنشأ صف في ${C} ولا يُعلَّم ${TP}.status=claimed.`);
  say('النتيجة: الحجز "مدفوع" لكن لا يوجد سجل يربطه بدفعة — أي لا يستطيع');
  say('النظام أن يمنع إعادة استخدام نفس الدفعة على حجز آخر عبر هذا المسار.');

  section('هل الفهارس الفريدة تغطّي الفجوة؟');
  const dupRef = db.prepare(`
    SELECT ${REFN}, COUNT(*) c FROM ${B}
    WHERE ${REFN} IS NOT NULL AND ${REFN} <> ''
    GROUP BY ${REFN} HAVING c > 1
  `).all();
  say(`تكرار في ${B}.${REFN}: ${dupRef.length}`);
  const dupRaw = db.prepare(`
    SELECT ${REFR}, COUNT(*) c FROM ${B}
    WHERE ${REFR} IS NOT NULL AND ${REFR} <> ''
    GROUP BY ${REFR} HAVING c > 1
  `).all();
  say(`تكرار في ${B}.${REFR}: ${dupRaw.length}`);
  const nullRefPaid = db.prepare(`
    SELECT COUNT(*) c FROM ${B}
    WHERE status='${PAID}' AND ${SV}=1 AND (${REFN} IS NULL OR ${REFN}='')
  `).get().c;
  say(`حجوزات مدفوعة بلا مرجع مطبّع (${REFN} فارغ): ${nullRefPaid}`);
  say('الفهرس الفريد على المرجع المطبّع هو الحماية الوحيدة المتبقية لهذه الحجوزات.');
  say('الحماية الآن سليمة، لكنها هشّة: أي مسار تأكيد جديد لا يكتب مرجعاً مطبّعاً');
  say('يفتح الصرف المزدوج من جديد دون أي خطأ ظاهر.');

  section('تأييد متقاطع مع أدلة أخرى');
  const byProvider = db.prepare(`
    SELECT b.${PROV}, COUNT(*) c
    FROM ${B} b
    LEFT JOIN ${C} pc ON pc.booking_id = b.id
    WHERE b.status='${PAID}' AND b.${SV}=1 AND pc.id IS NULL
    GROUP BY b.${PROV} ORDER BY c DESC
  `).all();
  byProvider.forEach((r) => say(`  provider="${maskLabel(r[PROV])}" ⇒ ${r.c} حجز بلا مطالبة`));

  const reproduced = orphanBookings.length > 0 || orphanPayments.length > 0;

  finish({
    id: 'P04',
    slug: 'paid-without-payment-claim',
    title: 'حجوزات مدفوعة بلا صف payment_claims يربطها بالدفعة',
    severity: 'high',
    area: 'money-path',
    refs: [`src/store.js:claims`, `src/bookings.js:715-773`],
    claim:
      `كل حجز حالته ${PAID} مع ${SV}=1 يجب أن يكون له صف واحد في ${C} `
      + 'يربطه بـ trusted_payment_id. عدد من الحجوزات المدفوعة لا تلتزم بذلك.',
    expected:
      'أن يمرّ كل تأكيد دفع — بلا استثناء — عبر store.claimPaymentAtomically، '
      + 'فتُنشأ المطالبة داخل المعاملة نفسها.',
    observed: (() => {
      const byProvider = orphanBookings.reduce((acc, r) => {
        const k = maskLabel(r[PROV] || '(غير محدد)');
        acc[k] = (acc[k] || 0) + 1;
        return acc;
      }, {});
      const breakdown = Object.entries(byProvider).map(([k, v]) => `${k}=${v}`).join('، ');
      return `حجوزات مدفوعة بلا ${C}: ${orphanBookings.length}. `
        + `دفعات claimed بلا ${C}: ${orphanPayments.length}. `
        + `حجوزات مدفوعة بلا ${REFN}: ${nullRefPaid}. `
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
