# P12 — ضمانات المسار المالي التي تعمل فعلاً (شاهد إيجابي)

- **Severity:** info
- **Area:** money-path
- **Subject:** wa-booking-bot
- **Refs:** src/store.js:payment_claims, src/store.js:bookings, src/followups.js, src/server.js, src/queue.js
- **Verdict:** REPRODUCED

## Claim

حواجز الأمان الأساسية قائمة فعلاً: تفرد الدفعة، تفرد مرجع SMS، منع الشراء الرقمي المزدوج، وذرّية المطالبة. هذا الشاهد يثبت وجودها وعملها.

## Expected

أن تبقى هذه الضمانات قائمة، وأن تُختبر بتests ثابتة حتى لا تنكسر بصمت أثناء التطوير.

## Observed

ضمانات فاحصة: 19. ناجحة: 19. فاشلة: 0. مثال مُنفَّذ: تأكيدان متزامنان لنفس الدفعة على حجزين — واحد نجح والثاني رُفض بـ PaymentAlreadyClaimed، وصف payment_claims ظل واحداً.

## Impact

لا أثر — هذا إثباتPositive，确认 أن الحمايات الأساسية سليمة، وأن النتائج المتكررة في باقي التقرير عيوب محدودة لا انهيار عام في النموذج.

## Fix

لا إصلاح مطلوب. المطلوب هو تحويل هذه الضمانات إلى اختبارات ثابتة (regression tests) كي لا تُكسر بصمت أثناء التطوير.

## Raw output

```

--- الضمانة 1 — تفرد الدفعة الواحدة (payment_claims) ---
[PASS] فهرس فريد على payment_claims.booking_id
        idx_payment_claims_booking, idx_payment_claims_tp
[PASS] فهرس فريد على payment_claims.trusted_payment_id
[PASS] لا حجز له أكثر من مطالبة واحدة
        تكرارات: 0
[PASS] لا دفعة لها أكثر من مطالبة واحدة
        تكرارات: 0

--- الضمانة 2 — تفرد مرجع SMS على bookings ---
  idx_bookings_smsref_norm: CREATE UNIQUE INDEX idx_bookings_smsref_norm
    ON bookings(sms_ref_norm) WHERE sms_ref_norm IS NOT NULL AND sms_ref_norm <> ''
[PASS] فهرس فريد على sms_ref_norm
[PASS] لا مرجع مطبّع مكرر بين الحجوزات
        تكرارات: 0

--- الضمانة 3 — منع الشراء المزدوج (digital_orders) ---
[PASS] digital_orders.booking_id مفتاح أساسي
[PASS] لا حجز رقمي له أكثر من طلب شراء
        تكرارات: 0

--- الضمانة 4 — دقّة مطابقة المبلغ ---
[PASS] AMOUNT_TOLERANCE = 0
        القيمة: 0

--- الضمانة 5 — ذرّية المطالبة: تأكيدان متزامنان لنفس الدفعة ---
محاولة 1 (الحجز الأول): نجحت
محاولة 2 (حجز ثانٍ، نفس الدفعة): رُفضت — PaymentAlreadyClaimed: دفعة SMS رقم 1 مستهلكة مسبقًا (الحالة: claimed).
محاولة 3 (تكرار المحاولة الأولى): رُفضت — BookingAlreadyPaid: الحجز BKG-P12 مدفوع ومؤكد مسبقًا.
صفوف payment_claims بعد المحاولات: 1
[PASS] الدفعة تُطالَب مرة واحدة فقط

--- الضمانة 6 — توقيع الـwebhook fail-closed ---
[PASS] يرفض عند غياب السرّ
[PASS] يرفض عند غياب التوقيع
[PASS] يستخدم timingSafeEqual

--- الضمانة 7 — مركزية إرسال واتساب ---
نداءات مباشرة لواجهة OpenWA خارج src/openwa.js: 0
[PASS] كل حركة واتساب تمرّ عبر src/openwa.js (لا fetch مباشر)
[PASS] لا يوجد skipThrottle:true خارج src/openwa.js
[PASS] openwa.sendText يمرّ بـ acquireSlot
[PASS] openwa.reply يمرّ بـ acquireSlot
[PASS] queue.js يحتوي قاطع الدائرة CircuitBreaker
[PASS] queue.js يحتوي محدد المعدل الصادر

--- الخلاصة ---
ضمانات فاحصة: 19 — ناجحة: 19 — فاشلة: 0
```
