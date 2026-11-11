# P03 — webhook الخاص بالرسائل البنكية مفتوح في كل بيئة غير production

- **Severity:** critical
- **Area:** security
- **Refs:** src/payment_verifier.js:52-71, src/server.js:466-467
- **Verdict:** REPRODUCED

## Claim

verifyWebhookAuth تُرجع `process.env.NODE_ENV !== 'production'` عند غياب المفتاح، وتُرجع true أيضاً عند غياب الترويسة عندما لا يكون NODE_ENV=test.

## Expected

الفشل مغلق دائماً: غياب المفتاح أو غياب الترويسة يعني رفض الطلب، بغض النظر عن قيمة NODE_ENV.

## Observed

NODE_ENV=production ⇒ false (مغلق، سليم). NODE_ENV=staging ⇒ true. NODE_ENV=development ⇒ true. NODE_ENV غير محدد ⇒ true. مع مفتاح صحيح ⇒ false.

## Impact

أي نشر تجريبي أو بيئة إنتاج مضبوطة خطأ (مثلاً systemd بلا NODE_ENV) يجعل المسار يقبل أي طلب بلا مصادقة. الطلب المُزيف يدخل trusted_payments ويُطابَق مع حجز فيُسجَّل كدفعة حقيقية — أي تحويل رصيد غير مدفوع إلى "مدفوع".

## Fix

اجعل الفشل مغلقاً دائماً:
```js
function verifyWebhookAuth(req) {
  if (!req) return false;
  const headers = req.headers || {};
  const query = req.query || {};
  const configuredKey = (config.httpsms && config.httpsms.apiKey)
    || process.env.HTTPSMS_API_KEY || process.env.WEBHOOK_SECRET || '';
  if (!configuredKey) return false;
  const headerKey = headers['x-api-key'] || headers['authorization']
    || query.api_key || query.token;
  if (!headerKey) return false;
  const cleanHeader = String(headerKey).replace(/^Bearer\s+/i, '').trim();
  return safeEqual(cleanHeader, String(configuredKey).trim());
}
```

## Raw output

```

--- verifyWebhookAuth في src/payment_verifier.js ---
52: function verifyWebhookAuth(req) {
53:   if (!req) return false;
54:   const headers = req.headers || {};
55:   const query = req.query || {};
56:   const configuredKey = (config.httpsms && config.httpsms.apiKey) || process.env.HTTPSMS_API_KEY || process.env.WEBHOOK_SECRET;
57:   if (!configuredKey) {
58:     // في حالة عدم ضبط مفتاح، نسمح في بيئة الاختبار والتطوير فقط
59:     return process.env.NODE_ENV !== 'production';
60:   }
61: 
62:   const headerKey = headers['x-api-key'] || headers['authorization'] || query.api_key || query.token;
63:   if (!headerKey) {
64:     // إذا تم استدعاء الـ handler في بيئة الاختبار كـ mock بدون headers
65:     if (process.env.NODE_ENV === 'test' || !req.rawHeaders) return true;
66:     return false;
67:   }
68: 
69:   const cleanHeader = String(headerKey).replace(/^Bearer\s+/i, '').trim();
70:   return cleanHeader === String(configuredKey).trim();
71: }
72: 
73: /**

--- المسارات التي تستخدمه في src/server.js ---
src/server.js:438: if (!paymentVerifier.verifyWebhookAuth(req)) {

--- المسار البديل: توقيع webhook الرئيسي (fail-closed) للمقارنة ---
68: function verifySignature(rawBody, signatureHeader) {
69:   const secret = config.openwa.webhookSecret;
70:   // fail-closed: بدون سر متفق عليه ما نقبلش أي تسليم (التوقيع مطلوب، لا ثقة بالشبكة)
71:   if (!secret) return false;
72:   if (!signatureHeader) return false;
73: 
74:   const given = String(signatureHeader).replace(/^sha256=/i, '').trim();
75:   const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
76: 
77:   const a = Buffer.from(given, 'utf8');
78:   const b = Buffer.from(expected, 'utf8');
79:   if (a.length !== b.length) return false;
80:   return crypto.timingSafeEqual(a, b);
81: }
82: 
83: /* ------------------------------------------------------------------ */

--- محاكاة السلوك الفعلي لـ verifyWebhookAuth ---
الحالة A — لا مفتاح + production
  NODE_ENV=production  configuredKey=(absent)
  request بلا ترويسة Authorization ⇒ ترجع: false
الحالة B — لا مفتاح + staging
  NODE_ENV=staging  configuredKey=(absent)
  request بلا ترويسة Authorization ⇒ ترجع: true
الحالة C — لا مفتاح + development
  NODE_ENV=development  configuredKey=(absent)
  request بلا ترويسة Authorization ⇒ ترجع: true
الحالة D — لا مفتاح + NODE_ENV غير محدد
  NODE_ENV=undefined  configuredKey=(absent)
  request بلا ترويسة Authorization ⇒ ترجع: true
الحالة E — مفتاح موجود + production
  NODE_ENV=production  configuredKey=present
  request بلا ترويسة Authorization ⇒ ترجع: false

--- النتيجة ---
في بيئة production فقط يُرفض الطلب عند غياب المفتاح (fail-closed).
في أي بيئة أخرى (staging / development / NODE_ENV غير محدد) يُقبل الطلب بلا أي مفتاح.
```
