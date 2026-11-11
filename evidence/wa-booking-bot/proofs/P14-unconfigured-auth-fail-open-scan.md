# P14 — مصادقة مفتوحة عند غياب المفتاح — فحص عام

- **Severity:** critical
- **Area:** security
- **Subject:** wa-booking-bot
- **Refs:** src/payment_verifier.js:57, src/payment_verifier.js:59, src/payment_verifier.js:63, src/payment_verifier.js:65
- **Verdict:** REPRODUCED

## Claim

أي دالة تتحقق من مفتاح أو توكن وتُرجع "مقبول" عندما يكون المفتاح غائباً تُفتح بلا مصادقة في كل بيئة لا يوجد فيها production.

## Expected

أن تفشل المصادقة مغلقاً دائماً: غياب المفتاح أو غياب الترويسة يعني رفض الطلب، بغض النظر عن قيمة أي متغيّر بيئة.

## Observed

4 موضعاً، منها 4 في مسار حسّاس. المواضع الحسّاسة: src/payment_verifier.js:57، src/payment_verifier.js:59، src/payment_verifier.js:63، src/payment_verifier.js:65.

## Impact

في بيئة staging أو development أو أي نشر بلا NODE_ENV=production صحيح، يقبل المسار طلباً بلا أي مفتاح. لو كان المسار يستقبل دفعاً أو بيانات عميل، يصبح الحقن ممكناً بلا مصادقة.

## Fix

اجعل الفشل مغلقاً في كل الحالات:
```js
if (!configuredKey) return false;
if (!headerKey) return false;
```
ولا تعتمد على NODE_ENV لتحديد مستوى الأمان.

## Raw output

```

--- المواضع التي تعطي "مقبول" عند غياب المفتاح ---
src/payment_verifier.js:57  [مفتاح غائب ⇒ يُقبل]
    if (!configuredKey) {
src/payment_verifier.js:59  [مقبول خارج production]
    return process.env.NODE_ENV !== 'production';
src/payment_verifier.js:63  [مفتاح غائب ⇒ يُقبل]
    if (!headerKey) {
src/payment_verifier.js:65  [غياب الترويسة ⇒ يُقبل]
    if (process.env.NODE_ENV === 'test' || !req.rawHeaders) return true;

--- منها في مسار حسّاس ---
src/payment_verifier.js:57  — مفتاح غائب ⇒ يُقبل
src/payment_verifier.js:59  — مقبول خارج production
src/payment_verifier.js:63  — مفتاح غائب ⇒ يُقبل
src/payment_verifier.js:65  — غياب الترويسة ⇒ يُقبل
مواضع حسّاسة: 4 من 4
```
