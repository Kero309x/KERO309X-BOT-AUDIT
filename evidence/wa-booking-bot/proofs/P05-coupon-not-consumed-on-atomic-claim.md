# P05 — المطالبة الذرّية للدفع لا تستهلك الكوبون

- **Severity:** high
- **Area:** money-path
- **Subject:** wa-booking-bot
- **Refs:** src/store.js:1511-1640, src/bookings.js:309-323, src/payment_verifier.js:337
- **Verdict:** REPRODUCED

## Claim

store.claimPaymentAtomically يكتب bookings.status='paid' بـ SQL مباشر، ولا يستدعي bookings.applyCouponStatusSideEffects، فتبقى coupon_redemptions بحالة 'reserved'.

## Expected

أن تُستهلك الكوبون داخل نفس المعاملة الذرّية التي تؤكّد الدفع، حتى لا تبقى الكوبون محجوزاً (reserved) بعد sale.

## Observed

الحجز أصبح paid والدفعة claimed، لكن حالة استرداد الكوبون بقيت "reserved". عند استدعاء applyCouponStatusSideEffects يدوياً تتحول إلى "redeemed" — أي أن الدالة سليمة والمسار الذرّي هو الذي لا يستدعيها.

## Impact

الكوبون يبقى محجوزاً ولا يُستهلك ولا يُحرَّر: لا يُحتسب في used_count، ولا تتحقق حدود الاستخدام (usage_limit) عند الدفع الفعلي. الكوبون يبقى عالقاً على العميل وقد يُمنع لاحقاً بدون سبب.

## Fix

انقل آثار الكوبون داخل معاملة claimPaymentAtomically نفسها: داخل دالة المعاملة، بعد UPDATE bookings، نفّذ UPDATE coupon_redemptions SET status='redeemed', redeemed_at=? WHERE booking_id=? أو استدعِ bookings.applyCouponStatusSideEffects(id, 'paid') من داخل المعاملة مع تسجيل أخطائها في ops_log بدل ابتلاعها.

## Raw output

```

--- تهيئة حجز بكوبون محجوز + دفعة غير مُطالَبة ---
حالة الاسترداد قبل: reserved
حالة الحجز قبل: pending
حالة الدفعة قبل: unclaimed

--- تشغيل المسار الذرّي الفعلي: store.claimPaymentAtomically ---
نتيجة claimPaymentAtomically: {"success":true,"bookingId":"BKG-P05","trustedPaymentId":1,"claimedAt":"2026-11-11T18:18:39.141Z","amount":100,"matchMethod":"exact_ref"}

--- الحالة بعد المطالبة الذرّية ---
حالة الحجز: paid  (sms_verified=1)
حالة الدفعة: claimed
حالة استرداد الكوبون: reserved  (redeemed_at=null)

--- دليل المقارنة — نفس الحجز بعد نداء صريح لتطبيق آثار الكوبون ---
بعد applyCouponStatusSideEffects(id,'paid') ⇒ حالة الاسترداد: redeemed
إذن الدالة تعمل بشكل صحيح — المشكلة أن المسار الذرّي لا يستدعيها أصلاً.

--- من يستدعي applyCouponStatusSideEffects فعلياً؟ ---
  src/bookings.js:309: function applyCouponStatusSideEffects(id, status) {
  src/bookings.js:347: applyCouponStatusSideEffects(id, patch.status);
  src/bookings.js:438: applyCouponStatusSideEffects(id, patch.status);
  src/bookings.js:1513: applyCouponStatusSideEffects,
  src/payment_verifier.js:337: bookings.applyCouponStatusSideEffects(booking.id, bookings.STATUS.PAID);
  src/telegram_bot.js:456: bookings.applyCouponStatusSideEffects(bId, 'cancelled');
src/store.js (claimPaymentAtomically) لا يظهر في القائمة ⇒ لا يستدعيها.
```
