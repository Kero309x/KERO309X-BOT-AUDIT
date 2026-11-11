# High findings

These are safety properties the design claims to hold and does not. None of them is an attack in itself; each one removes a guard that another part of the system is relying on.

| ID | Finding | Area | Proof |
|---|---|---|---|
| P04 | حجوزات مدفوعة بلا صف payment_claims يربطها بالدفعة | money-path | [proof](../../evidence/proofs/P04-paid-without-payment-claim.md) |
| P05 | المطالبة الذرّية للدفع لا تستهلك الكوبون | money-path | [proof](../../evidence/proofs/P05-coupon-not-consumed-on-atomic-claim.md) |
| P06 | مطابقة الاسم بالعتمة تخلط أسماءً مختلفة تماماً | money-path | [proof](../../evidence/proofs/P06-name-fuzzy-match-collides.md) |
| P08 | اعتماديات في مسار الإنتاج غير معلنة أو مُعلنة dev فقط | deployment | [proof](../../evidence/proofs/P08-undeclared-production-dependency.md) |
| P09 | تغيير مسار DATA_DIR يحوّل كل الإرسال إلى وضع المحاكاة | deployment | [proof](../../evidence/proofs/P09-data-dir-triggers-mock-sends.md) |

---

## P04 — حجوزات مدفوعة بلا صف payment_claims يربطها بالدفعة

- **Severity:** high
- **Area:** money-path
- **Refs:** src/bookings.js:715-773, src/store.js:1511-1640, src/httpsms.js:727
- **Proof:** [P04-paid-without-payment-claim.md](../../evidence/proofs/P04-paid-without-payment-claim.md)

### Claim

كل حجز حالته paid مع sms_verified=1 يجب أن يكون له صف واحد في payment_claims يربطه بـ trusted_payment_id. عدد من الحجوزات المدفوعة لا تلتزم بذلك.

### Observed

حجوزات مدفوعة بلا payment_claims: 18. دفعات claimed بلا payment_claims: 3. حجوزات مدفوعة بلا sms_ref_norm: 0 (0 حالياً). توزيع الـ18 بلا مطالبة حسب المزوّد: مفتوح (مينا رمسيس)=13، Banque Misr (InstaPay)=5.

### Impact

الدفعات المتحرّرة من سجل المطالبة لا يستطيع النظام منع إعادة صرفها. كما أن أي إحصاء يعتمد على payment_claims (عدد الحجوزات الموثّقة) أقل من الواقع، والتسوية البنكية المبنية على هذا السجل غير مكتملة.

### Fix

اجعل bookings.markPaymentVerified غلافاً داخلياً لـ store.claimPaymentAtomically، أو—at الأقل—让它 ينشئ صف payment_claims داخل نفس المعاملة ويعلّم trusted_payments.status=claimed. أضف اختباراً يفرض: كل حجز sms_verified=1 له صف payment_claims واحد بالضبط.

## Raw output

```

--- أعمدة payment_claims ---
id, booking_id, trusted_payment_id, claimed_at, claimed_amount, match_method, evidence

--- الفهارس الفريدة التي تحمي الصرف المزدوج ---
  sqlite_autoindex_payment_claims_1: null
  sqlite_autoindex_payment_claims_2: null
  idx_payment_claims_booking: CREATE UNIQUE INDEX idx_payment_claims_booking ON payment_claims(booking_id)
  idx_payment_claims_tp: CREATE UNIQUE INDEX idx_payment_claims_tp ON payment_claims(trusted_payment_id)

--- الحاجز 1 — حجوزات status=paid و sms_verified=1 بلا صف payment_claims ---
عدد الحجوزات المدفوعة بالمطابقة: 53
منها بلا صف payment_claims: 18
  BKG-137d4fb4  chat=CHAT-2f25a24b  amount=750  provider=مفتوح (مينا رمسيس)  txn=TXN-d7f94889
  BKG-678fc791  chat=CHAT-14cca865  amount=330  provider=Banque Misr (InstaPay)  txn=TXN-16924bf4
  BKG-ed37a21b  chat=CHAT-2f25a24b  amount=750  provider=مفتوح (مينا رمسيس)  txn=TXN-2ed3c613
  BKG-82fe6e51  chat=CHAT-2f25a24b  amount=300  provider=مفتوح (مينا رمسيس)  txn=TXN-df425a80
  BKG-6e195f5f  chat=CHAT-2f25a24b  amount=250  provider=مفتوح (مينا رمسيس)  txn=TXN-e709bd3c
  BKG-017683df  chat=CHAT-2f25a24b  amount=150  provider=مفتوح (مينا رمسيس)  txn=TXN-3f322a18
  BKG-c52dcab1  chat=CHAT-2f25a24b  amount=300  provider=مفتوح (مينا رمسيس)  txn=TXN-00001691
  BKG-ac397bd6  chat=CHAT-2f25a24b  amount=300  provider=مفتوح (مينا رمسيس)  txn=TXN-aa26d706
  BKG-10597d17  chat=CHAT-4d5b84e3  amount=330  provider=Banque Misr (InstaPay)  txn=TXN-88252c3a
  BKG-ad74981b  chat=CHAT-2f25a24b  amount=300  provider=مفتوح (مينا رمسيس)  txn=TXN-e6a5c6c3
  BKG-5db90a93  chat=CHAT-2f25a24b  amount=1000  provider=مفتوح (مينا رمسيس)  txn=TXN-7c972370
  BKG-066346d9  chat=CHAT-2f25a24b  amount=750  provider=مفتوح (مينا رمسيس)  txn=TXN-44eb9ac7
  BKG-e2851d37  chat=CHAT-2f25a24b  amount=500  provider=مفتوح (مينا رمسيس)  txn=TXN-e39fb594
  BKG-ff99d4c0  chat=CHAT-2f25a24b  amount=300  provider=مفتوح (مينا رمسيس)  txn=TXN-afc8dd3d
  BKG-46811204  chat=CHAT-2f25a24b  amount=500  provider=مفتوح (مينا رمسيس)  txn=TXN-4a6831aa
  … و3 صفاً آخر

--- الحاجز 2 — دفعات trusted_payments بحالة claimed بلا صف payment_claims ---
عدد الدفعات المعلّمة claimed: 64
منها بلا صف payment_claims: 3
  TP-6b86b273  amount=250  provider=Vodafone Cash  ref=REF-8fec0223
  TP-2ac878b0  amount=180  provider=Vodafone Cash  ref=REF-15865cb7
  TP-cba28b89  amount=280  provider=Banque Misr (InstaPay)  ref=REF-2a5a7334

--- الحاجز 3 — من أين تأتي هذه الفجوة ---
bookings.markPaymentVerified (src/bookings.js:715) تكتب status=paid و sms_verified=1
مباشرة عبر updateBooking، ولا تمرّ على store.claimPaymentAtomically.
لذلك لا يُنشأ صف في payment_claims ولا يُعلَّم trusted_payments.status=claimed.
النتيجة: الحجز "مدفوع" لكن لا يوجد سجل يربطه بدفعة — أي لا يستطيع
النظام أن يمنع إعادة استخدام نفس الدفعة على حجز آخر عبر هذا المسار.

--- هل الفهارس الفريدة تغطّي الفجوة؟ ---
تكرار في bookings.sms_ref_norm: 0
تكرار في bookings.sms_ref_id: 0
حجوزات مدفوعة بلا مرجع مطبّع (sms_ref_norm فارغ): 0
الفهرس الفريد على sms_ref_norm هو الحماية الوحيدة المتبقية لهذه الحجوزات.
الحماية الآن سليمة (0 تكرار)، لكنها هشّة: أي مسار تأكيد جديد لا يكتب مرجعاً
مطبّعاً يفتح الصرف المزدوج من جديد دون أي خطأ ظاهر.

--- تأييد متقاطع مع P01 ---
  provider="مفتوح (مينا رمسيس)" ⇒ 13 حجز بلا مطالبة
  provider="Banque Misr (InstaPay)" ⇒ 5 حجز بلا مطالبة
```

---

## P05 — المطالبة الذرّية للدفع لا تستهلك الكوبون

- **Severity:** high
- **Area:** money-path
- **Refs:** src/store.js:1511-1640, src/bookings.js:309-323, src/payment_verifier.js:337
- **Proof:** [P05-coupon-not-consumed-on-atomic-claim.md](../../evidence/proofs/P05-coupon-not-consumed-on-atomic-claim.md)

### Claim

store.claimPaymentAtomically يكتب bookings.status='paid' بـ SQL مباشر، ولا يستدعي bookings.applyCouponStatusSideEffects، فتبقى coupon_redemptions بحالة 'reserved'.

### Observed

الحجز أصبح paid والدفعة claimed، لكن حالة استرداد الكوبون بقيت "reserved". عند استدعاء applyCouponStatusSideEffects يدوياً تتحول إلى "redeemed" — أي أن الدالة سليمة والمسار الذرّي هو الذي لا يستدعيها.

### Impact

الكوبون يبقى محجوزاً ولا يُستهلك ولا يُحرَّر: لا يُحتسب في used_count، ولا تتحقق حدود الاستخدام (usage_limit) عند الدفع الفعلي. الكوبون يبقى عالقاً على العميل وقد يُمنع لاحقاً بدون سبب.

### Fix

انقل آثار الكوبون داخل معاملة claimPaymentAtomically نفسها: داخل دالة المعاملة، بعد UPDATE bookings، نفّذ UPDATE coupon_redemptions SET status='redeemed', redeemed_at=? WHERE booking_id=? أو استدعِ bookings.applyCouponStatusSideEffects(id, 'paid') من داخل المعاملة مع تسجيل أخطائها في ops_log بدل ابتلاعها.

## Raw output

```

--- تهيئة حجز بكوبون محجوز + دفعة غير مُطالَبة ---
حالة الاسترداد قبل: reserved
حالة الحجز قبل: pending
حالة الدفعة قبل: unclaimed

--- تشغيل المسار الذرّي الفعلي: store.claimPaymentAtomically ---
نتيجة claimPaymentAtomically: {"success":true,"bookingId":"BKG-P05","trustedPaymentId":1,"claimedAt":"2026-11-11T17:21:37.166Z","amount":100,"matchMethod":"exact_ref"}

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

---

## P06 — مطابقة الاسم بالعتمة تخلط أسماءً مختلفة تماماً

- **Severity:** high
- **Area:** money-path
- **Refs:** src/httpsms.js:585-591, src/payment_verifier.js:206-234
- **Proof:** [P06-name-fuzzy-match-collides.md](../../evidence/proofs/P06-name-fuzzy-match-collides.md)

### Claim

namesMatchCrossScript تقبل أي اسمين يختلف كل منهما بمحرّر واحد على الهيكل (Levenshtein ≤ 1)، فتُعتبر "محمد" و"احمد" الاسم نفسه.

### Observed

من 10 أزواج tested، 7 زوجاً مختلفاً طابق: محمد/احمد، محمد/محمود، مصطفى/مصطفي، محمد/محمّد، فاطمة/فاطمه، خالد/خالد، سارة/ساره

### Impact

في طريقة المطابقة AMOUNT_AND_NAME، دفعة عميل واحد قد تُستخدم لتأكيد حجز عميل آخر بنفس المبلغ. الاسم مكتوب من العميل نفسه، والعميل يستطيع اختيار اسم مشابه لاسم عميل آخر عمداً.

### Fix

لا تعتمد الاسم وحده أبداً. اشترط رقم الهاتف + الاسم معاً في نفس المسار، أو اخفض الثقة إلى manual_review واطلب رقم المحفظة. وكذلك ارفع حد مسافة التحرير إلى 0 للأسماء العربية واركز على تطبيع الهمزات والتاء المربوطة صراحةً بدل مسافة التحرير.

## Raw output

```

--- الدالة المستخدمة في src/httpsms.js ---
585: function namesMatchCrossScript(a, b) {
586:   const ta = nameSkeleton(a);
587:   const tb = nameSkeleton(b);
588:   if (!ta.length || !tb.length) return false;
589:   const [shorter, longer] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
590:   return shorter.every((tok) => longer.some((lt) => levDist(tok, lt) <= 1));
591: }
592: 

--- الهيكل الناتج من nameSkeleton ---
551: function nameSkeleton(str) {
552:   return transliterateArToLat(str)
553:     .split(/[^a-z]+/)
554:     .filter(Boolean)
555:     .map((tok) => tok.replace(/[aeiou]/g, ''));
556: }
557: 
558: function levDist(a, b) {
559:   const s = String(a || '');
560:   const t = String(b || '');
561:   const m = s.length;
562:   const n = t.length;
563:   if (!m) return n;
564:   if (!n) return m;
565:   let prev = new Array(n + 1);
566:   let cur = new Array(n + 1);

--- أزواج أسماء مختلفة يجب ألا تتطابق ---
"محمد" vs "احمد"  skeletons=[mhmd] vs [hmd]  ⇒ true
"محمد" vs "محمود"  skeletons=[mhmd] vs [mhmwd]  ⇒ true
"أحمد" vs "محمود"  skeletons=[hmd] vs [mhmwd]  ⇒ false
"مصطفى" vs "مصطفي"  skeletons=[mstf] vs [mstfy]  ⇒ true
"محمد" vs "محمّد"  skeletons=[mhmd] vs [mhm,d]  ⇒ true
"فاطمة" vs "فاطمه"  skeletons=[ftm] vs [ftmh]  ⇒ true
"عمر" vs "وعدي"  skeletons=[mr] vs [wdy]  ⇒ false
"خالد" vs "خالد"  skeletons=[khld] vs [khld]  ⇒ true
"يوسف" vs "يونس"  skeletons=[ywsf] vs [ywns]  ⇒ false
"سارة" vs "ساره"  skeletons=[sr] vs [srh]  ⇒ true

--- الاستخدام في مسار المطابقة ---
src/payment_verifier.js يستعمل مطابقة الاسم ضمن طريقة AMOUNT_AND_NAME:
الحجز المMatched依靠 الاسم وحده إضافةً إلى تطابق المبلغ.
الاسم في الحجز هو ما كتبه العميل في مرحلة NAME (نفس مصدر P01).
  src/payment_verifier.js:214: return httpsms.namesMatchCrossScript(bName, senderName);
  src/payment_verifier.js:220: matchMethod: 'AMOUNT_AND_NAME',
  src/payment_verifier.js:851: return httpsms.namesMatchCrossScript(tp.sender, senderName);
  src/payment_verifier.js:855: matchMethod = 'AMOUNT_AND_NAME';
  src/payment_verifier.js:1573: return candidateNames.some((n) => httpsms.namesMatchCrossScript(n, tp.sender));
  src/payment_verifier.js:1578: matchMethod = 'AMOUNT_AND_NAME';

--- هل الحساب موجود في القاعدة؟ ---
صفوف payment_claims بطريقة AMOUNT_AND_NAME: 1
  claim #47
```

---

## P08 — اعتماديات في مسار الإنتاج غير معلنة أو مُعلنة dev فقط

- **Severity:** high
- **Area:** deployment
- **Refs:** src/we_api.js:18-29, package.json:31-39
- **Proof:** [P08-undeclared-production-dependency.md](../../evidence/proofs/P08-undeclared-production-dependency.md)

### Claim

src/we_api.js — وهو في مسار الإنتاج — يستدعي playwright و playwright-core. كلاهما devDependency، وواحد منهما غير مذكور في package.json إطلاقاً.

### Observed

غير معلنة إطلاقاً: playwright-core. devDependency مستخدمة في الإنتاج: playwright. محاكاة require في بيئة بلا playwright: الفشل لا يُترجم إلى رسالة واضحة.

### Impact

بعد `npm ci --omit=dev` على السيرفر تفشل ميزات WE Family بصمت: الـcatch يبتلع الاستثناء فلا يظهر خطأ في السجلات، ولا يعرف المشغّل أن الميزة معطّلة. كما أن البناء حسب DEPLOYMENT.md يستخدم --omit=dev بالضبط.

### Fix

انقل الاعتماديات المستخدمة في الإنتاج إلى dependencies:
```json
"dependencies": {
  "better-sqlite3": "^13.0.3",
  "dotenv": "^16.4.5",
  "express": "^4.21.2",
  "playwright": "^1.64.0",
  "playwright-core": "^1.64.0"
}
```
أو اعزلها خلف lazy require مع رسالة خطأ صريحة:
```js
let chromium = null;
try { ({ chromium } = require('playwright-core')); }
catch (err) { console.error('[we_api] Playwright غير مثبّت — ميزة WE Family معطّلة:', err.message); }
```

## Raw output

```

--- الاعتماديات المعلنة ---
dependencies: better-sqlite3, dotenv, express
devDependencies: eslint, playwright

--- مسح كل الاستيرادات في src/ ---

--- الاستيرادات الخارجية المستخدمة في src/ ---
better-sqlite3  [معلنة في dependencies]
    src/store.js:5
dotenv  [معلنة في dependencies]
    src/config.js:20
express  [معلنة في dependencies]
    src/admin/routes/bookings.js:25
    src/admin/routes/catalog.js:15
    src/admin/routes/coupons.js:20
    src/admin/routes/customers.js:25
    … و16 موضعاً آخر
playwright  [devDependency فقط]
    src/we_api.js:24
playwright-core  [غير معلنة إطلاقاً]
    src/we_api.js:20

--- ماذا يحدث عند npm ci --omit=dev؟ ---
playwright: 1 استيراد
playwright-core: 1 استيراد
كلاهما devDependency ⇒ لن يكون موجوداً في node_modules على السيرفر.

--- ماذا يفعل الكود عند فشل الاستيراد؟ ---
17: 
18: let playwrightChromium = null;
19: try {
20:   const pw = require('playwright-core');
21:   playwrightChromium = pw.chromium;
22: } catch (_) {
23:   try {
24:     const pw = require('playwright');
25:     playwrightChromium = pw.chromium;
26:   } catch (_err) {
27:     // Playwright اختياري عند العمل عبر واجهة الموبايل المباشرة
28:   }
29: }
---

--- محاكاة: require في بيئة بلا playwright ---
محاولة تحميل src/we_api.js ⇒ نجح
في الإنتاج هذا يعني: ميزة WE Family تسقط بصمت — لا استثناء ظاهر.
```

---

## P09 — تغيير مسار DATA_DIR يحوّل كل الإرسال إلى وضع المحاكاة

- **Severity:** high
- **Area:** deployment
- **Refs:** src/openwa.js:9-24, src/followups.js:53-57
- **Proof:** [P09-data-dir-triggers-mock-sends.md](../../evidence/proofs/P09-data-dir-triggers-mock-sends.md)

### Claim

openwa.isTestEnvironment تستنتج "بيئة اختبار" من أن DATA_DIR مختلف عن <repo>/data، ولا تعتمد على NODE_ENV إلا في الاتجاه المعاكس. followups.isTestEnvironment توقف المتابعات إذا احوى المسار على "wa-booking-".

### Observed

DATA_DIR=<repo>/data ⇒ isTestEnvironment=false (إرسال حقيقي). DATA_DIR=/opt/wa-booking-bot/data ⇒ isTestEnvironment=true (كل الإرسال MOCK). حتى مع NODE_ENV=production.

### Impact

النقل إلى السيرفر بالشكل الموصوف في DEPLOYMENT.md (DATA_DIR=/opt/wa-booking-bot/data) يُطفئ الرسائل فوراً بعد التشغيل: البوت يستقبل ويُسجّل ويرد على قاعدة البيانات، لكنه لا يرسل ولا كلمة للعميل ولا إشعاراً للأدمن. الخطأ يظهر كـ"العميل لا يرد" لا كخطأ تقني.

### Fix

اجعل NODE_ENV هو المرجع الوحيد:
```js
function isTestEnvironment() {
  return process.env.NODE_ENV === 'test';
}
```
وفي followups.js احذف شرط المطابقة النصية للمسار، واعتمد على NODE_ENV=test وحده. أضف تحذيراً صريحاً عند الإقلاع إن طُلب المحاكاة في بيئة إنتاج.

## Raw output

```

--- openwa.isTestEnvironment في src/openwa.js ---
15: function isTestEnvironment() {
16:   if (process.env.NODE_ENV === 'test') return true;
17:   if (process.env.DATA_DIR) {
18:     try {
19:       const resolved = path.resolve(process.env.DATA_DIR);
20:       if (resolved !== PROD_DATA_DIR) return true;
21:     } catch (_) {}
22:   }
23:   return false;
24: }
25: 
26: /**
27:  * يتحقق ما إذا كان رقم المحادثة هو رقم المالك / الأدمن المسجل.
28:  * في بيئة الاختبار يسمح بالإرسال فقط للأدمن إذا رغب، ويمنع تماماً مراسلة أي عميل خارجي.
29:  */
30: function isOwnerChatId(chatId) {

--- followups.isTestEnvironment في src/followups.js ---
53: function isTestEnvironment() {
54:   if (process.env.NODE_ENV === 'test') return true;
55:   if (process.env.DATA_DIR && process.env.DATA_DIR.includes('wa-booking-')) return true;
56:   return false;
57: }
58: 
59: /* ------------------------------------------------------------------ */

--- أين تُستخدم النتيجة؟ ---
  src/openwa.js:15: function isTestEnvironment() {
  src/openwa.js:239: if (isTestEnvironment() && !isOwnerChatId(chatId)) {
  src/openwa.js:256: if (isTestEnvironment() && !isOwnerChatId(chatId)) {
  src/followups.js:53: function isTestEnvironment() {
  src/followups.js:121: const enforceCap = !isTestEnvironment() || process.env.FOLLOWUP_ENFORCE_CAP_IN_TEST === 'true';
  src/followups.js:178: const enforceCap = !isTestEnvironment() || process.env.FOLLOWUP_ENFORCE_CAP_IN_TEST === 'true';
  src/followups.js:578: if (dryRun && isTestEnvironment() && store.listOwnerAccounts().length === 0) {

--- محاكاة الحالات ---
DATA_DIR = <repo>/data (الوضع الحالي على ويندوز)
  isTestEnvironment() ⇒ false
DATA_DIR = /opt/wa-booking-bot/data (المسار المقترح في الدليل)
  isTestEnvironment() ⇒ true
DATA_DIR = <repo>/data + NODE_ENV=production
  isTestEnvironment() ⇒ false
DATA_DIR = /opt/wa-booking-bot/data + NODE_ENV=test
  isTestEnvironment() ⇒ true

--- النتيجة ---
bool: isTestEnvironment = true ⇐ كل outbound.sendText / reply يتحوّل إلى MOCK،
ولا يُرسل أي شيء إلى واتساب. لا تحذير، لا خطأ في السجل — صمت تام.
followups.isTestEnvironment يوقف المتابعات التلقائية إذا احتوى مسار
DATA_DIR على السلسلة "wa-booking-" — وهي شائعة في أسماء مجلدات النشر.
```

