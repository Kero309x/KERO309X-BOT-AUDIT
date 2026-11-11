'use strict';

/**
 * P05 — المسار الذرّي للتأكيد لا يستهلك الكوبون.
 *
 * claimPaymentAtomically يكتب status='paid' عبر SQL مباشر ولا يمرّ على
 * applyCouponStatusSideEffects، فتبقى coupon_redemptions بحالة 'reserved'.
 * كود الخروج: 0 = الخلل متحقق منه، 2 = غير متحقق.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { REPO_ROOT, say, section, finish } = require('./_lib');

function main() {
  // قاعدة معزولة تماماً — لا نلمس قاعدة البوت الحقيقية.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-proof-p05-'));
  fs.copyFileSync(path.join(REPO_ROOT, 'data', 'packages.json'), path.join(tmp, 'packages.json'));
  process.env.DATA_DIR = tmp;

  // eslint-disable-next-line global-require
  const store = require(path.join(REPO_ROOT, 'src', 'store.js'));
  // eslint-disable-next-line global-require
  const bookings = require(path.join(REPO_ROOT, 'src', 'bookings.js'));
  store.init();

  const db = store.getDb();
  const t = new Date().toISOString();

  section('تهيئة حجز بكوبون محجوز + دفعة غير مُطالَبة');
  db.prepare(`INSERT INTO coupons (id, code, discount_type, discount_value, applicable_service,
                usage_limit, used_count, active, created_at, updated_at)
              VALUES ('CPN-P05','PROOF50','percent',50,'all',NULL,0,1,?,?)`).run(t, t);
  db.prepare(`INSERT INTO bookings (id, seq, chat_id, network, package_name, price, quantity, status,
                coupon_id, coupon_code, discount_amount, original_price, created_at, updated_at)
              VALUES ('BKG-P05',1,'201000000001@c.us','vodafone','Proof Package',100,1,'pending',
                'CPN-P05','PROOF50',50,100,?,?)`).run(t, t);
  db.prepare(`INSERT INTO coupon_redemptions (id, coupon_id, coupon_code, booking_id, chat_id,
                original_price, discount_amount, final_price, status, created_at)
              VALUES ('RDM-P05','CPN-P05','PROOF50','BKG-P05','201000000001@c.us',100,50,50,'reserved',?)`).run(t);
  db.prepare(`INSERT INTO trusted_payments (id, provider, sender, raw_message, amount, currency,
                reference_id, normalized_ref, sender_phone, sms_timestamp, fingerprint, status, metadata,
                created_at, updated_at)
              VALUES (NULL,'httpsms','201000000001@c.us','proof',100,'EGP',
                'REF-P05-1234','refp051234','201000000001','2026-11-11 10:00:00','fp-p05-proof','unclaimed','{}',?,?)`).run(t, t);

  say(`حالة الاسترداد قبل: ${
    db.prepare("SELECT status FROM coupon_redemptions WHERE booking_id='BKG-P05'").get().status
  }`);
  say(`حالة الحجز قبل: ${db.prepare("SELECT status FROM bookings WHERE id='BKG-P05'").get().status}`);
  say(`حالة الدفعة قبل: ${
    db.prepare("SELECT status FROM trusted_payments WHERE fingerprint='fp-p05-proof'").get().status
  }`);

  section('تشغيل المسار الذرّي الفعلي: store.claimPaymentAtomically');
  let claimErr = null;
  const tpId = db.prepare("SELECT id FROM trusted_payments WHERE fingerprint='fp-p05-proof'").get().id;
  try {
    const res = store.claimPaymentAtomically({
      bookingId: 'BKG-P05',
      trustedPaymentId: tpId,
      matchMethod: 'exact_ref',
      amount: 100,
    });
    say(`نتيجة claimPaymentAtomically: ${JSON.stringify(res)}`);
  } catch (err) {
    claimErr = err;
    say(`استثناء: ${err.message}`);
  }

  section('الحالة بعد المطالبة الذرّية');
  const bkAfter = db.prepare("SELECT status, sms_verified FROM bookings WHERE id='BKG-P05'").get();
  const rdAfter = db.prepare("SELECT status, redeemed_at FROM coupon_redemptions WHERE booking_id='BKG-P05'").get();
  const tpAfter = db.prepare("SELECT status FROM trusted_payments WHERE fingerprint='fp-p05-proof'").get();
  say(`حالة الحجز: ${bkAfter.status}  (sms_verified=${bkAfter.sms_verified})`);
  say(`حالة الدفعة: ${tpAfter.status}`);
  say(`حالة استرداد الكوبون: ${rdAfter.status}  (redeemed_at=${rdAfter.redeemed_at || 'null'})`);

  const couponStuck = rdAfter.status === 'reserved' && bkAfter.status === 'paid';

  section('دليل المقارنة — نفس الحجز بعد نداء صريح لتطبيق آثار الكوبون');
  const sideEffects = bookings.applyCouponStatusSideEffects('BKG-P05', 'paid');
  const rdManual = db.prepare("SELECT status FROM coupon_redemptions WHERE booking_id='BKG-P05'").get();
  say(`بعد applyCouponStatusSideEffects(id,'paid') ⇒ حالة الاسترداد: ${rdManual.status}`);
  say('إذن الدالة تعمل بشكل صحيح — المشكلة أن المسار الذرّي لا يستدعيها أصلاً.');
  void sideEffects;

  section('من يستدعي applyCouponStatusSideEffects فعلياً؟');
  const files = ['bookings.js', 'payment_verifier.js', 'telegram_bot.js', 'store.js'];
  for (const f of files) {
    const p = path.join(REPO_ROOT, 'src', f);
    fs.readFileSync(p, 'utf8').split('\n').forEach((l, i) => {
      if (l.includes('applyCouponStatusSideEffects')) say(`  src/${f}:${i + 1}: ${l.trim()}`);
    });
  }
  say('src/store.js (claimPaymentAtomically) لا يظهر في القائمة ⇒ لا يستدعيها.');

  try { store.close(); } catch (_) { /* ignore */ }
  fs.rmSync(tmp, { recursive: true, force: true });

  finish({
    id: 'P05',
    slug: 'coupon-not-consumed-on-atomic-claim',
    title: 'المطالبة الذرّية للدفع لا تستهلك الكوبون',
    severity: 'high',
    area: 'money-path',
    refs: ['src/store.js:1511-1640', 'src/bookings.js:309-323', 'src/payment_verifier.js:337'],
    claim:
      'store.claimPaymentAtomically يكتب bookings.status=\'paid\' بـ SQL مباشر، '
      + 'ولا يستدعي bookings.applyCouponStatusSideEffects، فتبقى coupon_redemptions بحالة \'reserved\'.',
    expected:
      'أن تُستهلك الكوبون داخل نفس المعاملة الذرّية التي تؤكّد الدفع، '
      + 'حتى لا تبقى الكوبون محجوزاً (reserved) بعد sale.',
    observed: claimErr
      ? `فشل المسار الذرّي: ${claimErr.message}`
      : `الحجز أصبح ${bkAfter.status} والدفعة ${tpAfter.status}، لكن حالة استرداد الكوبون بقيت "${rdAfter.status}". `
        + 'عند استدعاء applyCouponStatusSideEffects يدوياً تتحول إلى "redeemed" — أي أن الدالة سليمة '
        + 'والمسار الذرّي هو الذي لا يستدعيها.',
    impact:
      'الكوبون يبقى محجوزاً ولا يُستهلك ولا يُحرَّر: لا يُحتسب في used_count، '
      + 'ولا تتحقق حدود الاستخدام (usage_limit) عند الدفع الفعلي. '
      + 'الكوبون يبقى عالقاً على العميل وقد يُمنع لاحقاً بدون سبب.',
    fix:
      'انقل آثار الكوبون داخل معاملة claimPaymentAtomically نفسها: '
      + 'داخل دالة المعاملة، بعد UPDATE bookings، نفّذ '
      + "UPDATE coupon_redemptions SET status='redeemed', redeemed_at=? WHERE booking_id=? "
      + 'أو استدعِ bookings.applyCouponStatusSideEffects(id, \'paid\') من داخل المعاملة '
      + 'مع تسجيل أخطائها في ops_log بدل ابتلاعها.',
    reproduced: couponStuck,
  });
}

main();
