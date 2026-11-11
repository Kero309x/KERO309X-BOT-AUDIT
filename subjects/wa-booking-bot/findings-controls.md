# Verified guardrails and baselines — wa-booking-bot — متجر باقات وخدمات رقمية

Not defects. These are the control points: the properties that were checked and hold, and the measurements that the other findings were taken against. They are published so the audit is not read as a claim that nothing works.

| ID | Finding | Area | Verdict | Proof |
|---|---|---|---|---|
| P12 | ضمانات المسار المالي التي تعمل فعلاً (شاهد إيجابي) | money-path | REPRODUCED | [proof](../../evidence/wa-booking-bot/proofs/P12-money-path-guards-that-hold.md) |
| P13 | خط أساس الاختبارات والتدقيق الثابت | quality | REPRODUCED | [proof](../../evidence/wa-booking-bot/proofs/P13-test-and-lint-baseline.md) |

---

## P12 — ضمانات المسار المالي التي تعمل فعلاً (شاهد إيجابي)

- **Severity:** info
- **Area:** money-path
- **Refs:** src/store.js:payment_claims, src/store.js:bookings, src/followups.js, src/server.js, src/queue.js
- **Verdict:** REPRODUCED
- **Proof:** [P12-money-path-guards-that-hold.md](../../evidence/wa-booking-bot/proofs/P12-money-path-guards-that-hold.md)

### Claim

حواجز الأمان الأساسية قائمة فعلاً: تفرد الدفعة، تفرد مرجع SMS، منع الشراء الرقمي المزدوج، وذرّية المطالبة. هذا الشاهد يثبت وجودها وعملها.

### Observed

ضمانات فاحصة: 19. ناجحة: 19. فاشلة: 0. مثال مُنفَّذ: تأكيدان متزامنان لنفس الدفعة على حجزين — واحد نجح والثاني رُفض بـ PaymentAlreadyClaimed، وصف payment_claims ظل واحداً.

### Impact

لا أثر — هذا إثباتPositive，确认 أن الحمايات الأساسية سليمة، وأن النتائج المتكررة في باقي التقرير عيوب محدودة لا انهيار عام في النموذج.

### Fix

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

---

## P13 — خط أساس الاختبارات والتدقيق الثابت

- **Severity:** info
- **Area:** quality
- **Refs:** package.json:19-22, AGENTS.md:12-13
- **Verdict:** REPRODUCED
- **Proof:** [P13-test-and-lint-baseline.md](../../evidence/wa-booking-bot/proofs/P13-test-and-lint-baseline.md)

### Claim

خط الأساس الحالي: كل الاختبارات ناجحة (عدا اختبارات الصوتيةMissing التبعية)، والتدقيق الثابت بلا أخطاء لكن بتحذيرات. الأرقام موثّقة للمقارنة قبل/بعد.

### Observed

الاختبارات: 808 (ناجحة 807، فاشلة 1، متخطّاة 0) بمدة 67292.7502 ms. lint: 1 أخطاء و 202 تحذيراً بمدة 14 ثانية. AGENTS.md يذكر 398 اختبار بينما الواقع 808.

### Impact

لا أثر مباشر. خط الأساس مرجع لقياس أثر أي إصلاح: أي change يقلّل عدد الاختبارات أو يزيد الأخطاء يجب أن يُرفض.

### Fix

حدّث AGENTS.md بالأرقام المقيسة، وأضف `eslint . --max-warnings 0` إلى سير العمل بعد تنظيف التحذيرات، واجعل npm test شرطاً في المراجعة.

## Raw output

```
خط الأساس يُلتقط من الشجرة الحالية. أي إصلاح لاحق يغيّر هذه الأرقام.
يُحفظ المخرجات الكاملة في evidence/baseline/.

--- npm run lint ---
المدة: 14 ثانية
الملخص: ✖ 203 problems (1 error, 202 warnings)
كود الخروج: 1
أخطاء: 1 — تحذيرات: 202

--- npm test ---
المدة: 69 ثانية
الاختبارات: 808 — الناجحة: 807 — الفاشلة: 1 — المتخطّاة: 0
duration_ms: 67292.7502
كود الخروج: 1

--- الاختبارات الفاشلة ---
  test at test\audio_transcriber.test.js:17:1
  ✖ transcribe.py: normalize_spoken_digits converts spoken Egyptian numbers to digits (1308.8311ms)

--- ملاحظة على توثيق المشروع ---
AGENTS.md يذكر "398" اختبار. الواقع المُقاس: 808.
AGENTS.md يذكر "صفر أخطاء" في lint — Reality: 1 أخطاء و202 تحذيراً.
التوثيق أدقّ من أن يُترك على حاله؛ صحّحه في نفس التعديل الذي يحدّث الأرقام.
```

