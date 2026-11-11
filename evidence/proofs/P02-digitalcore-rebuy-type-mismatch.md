# P02 — مسار إعادة الشراء الرقمي في اللوحة يخرج دائماً قبل الشراء

- **Severity:** critical
- **Area:** money-path
- **Refs:** src/admin/routes/digitalcore.js:1506, src/store.js:936-949
- **Verdict:** REPRODUCED

## Claim

المسار يستدعي store.claimDigitalOrder(...) ثم يختبر claim.claimed، بينما الدالة تُرجع boolean، فالحقل claimed غير موجود والاختبار always true.

## Expected

أن يختبر المسار القيمة المُرجعة كما هي: `if (!store.claimDigitalOrder(b.id)) { … }`، أو أن تُرجع الدالة كائناً يحمل الحقل claimed.

## Observed

claimDigitalOrder تُرجع true (boolean). claim.asked undefined ⇒ `!claim.claimed` = true ⇒ إعادة توجيه إلى settings-fail قبل أي نداء شراء، في كل مرة وبغض النظر عن حالة الحجز.

## Impact

عميل دفع ولم يُسلَّم منتجه الرقمي. الإدارة لا تستطيع إتمام الشراء من اللوحة وأي طلب شراء يدوي يخرج بنفس النتيجة. لا يوجد أثر في القاعدة يدل على ذلك.

## Fix

```js
const claimed = store.claimDigitalOrder(b.id);
if (!claimed) {
  return res.redirect(303, `${BASE}/digitalcore?msg=settings-fail`);
}
```
وحذف المعاملات prodId و qty لأنها غير مستخدمة في توقيع الدالة.

## Raw output

```

--- المستهلك في src/admin/routes/digitalcore.js ---
1502:     }
1503:     if (existingClaim && existingClaim.status !== 'purchased') {
1504:       store.releaseDigitalOrder(b.id);
1505:     }
1506:     const claim = store.claimDigitalOrder(b.id, prodId, qty);
1507:     if (!claim.claimed) {
1508:       return res.redirect(303, `${BASE}/digitalcore?msg=settings-fail`);
1509:     }
1510:     try {
1511:       const buyRes = await digitalcore.buyProduct({ id: prodId, count: qty, ref: b.id });
1512:       if (buyRes && buyRes.success) {
1513:         const orderId = buyRes.orderId || (buyRes.raw && (buyRes.raw.order_id || buyRes.raw.id)) || 'DC-RETRY';

--- المنتج في src/store.js ---
936: function claimDigitalOrder(bookingId) {
937:   if (!bookingId) return false;
938:   try {
939:     const res = getDb()
940:       .prepare(
941:         `INSERT OR IGNORE INTO digital_orders (booking_id, status, created_at, updated_at)
942:          VALUES (?, 'claimed', ?, ?)`,
943:       )
944:       .run(String(bookingId), now(), now());
945:     return res.changes > 0;
946:   } catch (_) {
947:     return false;
948:   }
949: }
950: 
951: /** تحديث حالة الطلب الرقمي (نجاح/فشل). */
952: function updateDigitalOrder(bookingId, patch = {}) {
953:   if (!bookingId) return false;

--- محاكاة تنفيذ سطر التحقق على قيمة حقيقية من claimDigitalOrder ---
db.prepare(...).run(...) ⇒ changes = 1
claimDigitalOrder(...) ترجع بالضبط: true (typeof boolean)

--- تطبيق شرط التحقق كما هو مكتوب في المسار ---
const claim = store.claimDigitalOrder(b.id, prodId, qty);  ⇒  claim = true
claim.claimed = undefined   (undefined:Claim غير موجود على boolean)
if (!claim.claimed) { return res.redirect(303, '/admin/digitalcore?msg=settings-fail'); }
الشرط يتحقق (يدخل التفاف): true

--- النتيجة ---
الحجز المدفوع الذي يضغط الأدمن "إعادة شراء" لا يُشحن أبداً،
ويُعاد التوجيه إلى settings-fail قبل أي نداء لـ digitalcore.buyProduct.
```
