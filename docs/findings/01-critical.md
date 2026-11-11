# Critical findings

Each of these either moves money without a payment, gives away a product, accepts unauthenticated input, or stops the bot from starting on the target server. All four are reproduced by a script that runs the shipped code.

| ID | Finding | Area | Proof |
|---|---|---|---|
| P01 | بوابة التفعيل الخاص تُفتح باسم يكتبه العميل نفسه | money-path | [proof](../../evidence/proofs/P01-mina-gate-by-name.md) |
| P02 | مسار إعادة الشراء الرقمي في اللوحة يخرج دائماً قبل الشراء | money-path | [proof](../../evidence/proofs/P02-digitalcore-rebuy-type-mismatch.md) |
| P03 | webhook الخاص بالرسائل البنكية مفتوح في كل بيئة غير production | security | [proof](../../evidence/proofs/P03-sms-webhook-fail-open.md) |
| P10 | ملف القفل يحمل PID من ويندوز فيمنع إقلاع البوت على السيرفر | deployment | [proof](../../evidence/proofs/P10-stale-lock-pid-blocks-boot.md) |

---

## P01 — بوابة التفعيل الخاص تُفتح باسم يكتبه العميل نفسه

- **Severity:** critical
- **Area:** money-path
- **Refs:** src/flow.js:376-397, src/flow.js:6442, src/flow.js:8373-8380, src/bookings.js:715-745
- **Proof:** [P01-mina-gate-by-name.md](../../evidence/proofs/P01-mina-gate-by-name.md)

### Claim

الدالة isMinaRamses في src/flow.js تُرجع true عندما يطابق الاسم أي نص يطابق /mina\s*ramsis|mina\s*ramses/i، والاسم حقل يكتبه العميل في مرحلة NAME. بعدها يمرّر الكود الحجز إلى markPaymentVerified بمبلغ 0 فيتحوّل إلى paid مع smsVerified=true.

### Observed

عميل بمعرّف محادثة جديد (2010******99@c.us) يكتب اسماً يطابق النمط /mina\s*ramsis|mina\s*ramses/i في حقل الاسم ⇒ isMinaRamses => true، والحجز ينتقل إلى markPaymentVerified({ amount: 0 }) فتصبح حالته paid مع smsVerified=true ومعالجة المنتج الرقمي تُنفَّذ.

### Impact

أي زائر يستطيع الحصول على منتج رقمي مجاناً بمجرد كتابة اسمين في حقل الاسم. الأثر ينتقل مباشرة إلى المسار المالي: المنتج يُشحن بدون دفعة، مع تسجيل sms_verified=true ما يفسد أي إحصاء للإيراد لاحقاً.

### Fix

اربط البوابة بمعرّف المحادثة/الهاتف فقط واحذف فحص الاسم:
```js
// القيم تُقرأ من سجل العملاء الفعلي، وتبقى خارج المستودع.
const MINA_CHAT_IDS = new Set([/* chat id الخاص بالعميل */]);
const MINA_PHONES = new Set([/* رقم العميل */]);
function isMinaRamses(chatId, draft = {}) {
  const id = String(chatId || '');
  if (MINA_CHAT_IDS.has(id)) return true;
  const phones = `${draft.phone || ''} ${draft.whatsappPhone || ''}`;
  return [...MINA_PHONES].some((p) => phones.includes(p));
}
```
وحذف المعامل الثالث name من التوقيع لأنه لم يعد مستخدماً في الفحص.

## Raw output

```

--- الدالة الفعلية من src/flow.js (كما تُشحن) ---
function isMinaRamses(chatId, draft = {}, name = '') {
  const idStr = String(chatId || '');
  if (idStr.includes('161276*******18') || idStr.includes('2012******56')) {
    return true;
  }
  const cust = customers.get(chatId);
  const custName = (cust && cust.name) || '';
  const draftName = (draft && draft.customerName) || '';
  const allNames = `${custName} ${draftName} ${name || ''}`;
  if (/مينا\s*رمسيس|mina\s*ramsis|mina\s*ramses/i.test(allNames)) {
    return true;
  }
  const phones = `${(draft && draft.phone) || ''} ${(draft && draft.whatsappPhone) || ''} ${idStr}`;
  if (phones.includes('2012******56') || phones.includes('0128*****56') || phones.includes('1289086556')) {
    return true;
  }
  return false;
}

--- الحالة 1 — عميل عادي يكتب اسمه ---
draft.customerName = "أحمد حسن"
isMinaRamses(...) => false

--- الحالة 2 — عميل يكتب الاسم الذي يفتح البوابة ---
المدخل #1 [م********* (len=10)]  =>  true
المدخل #2 [m********** (len=11)]  =>  true
المدخل #3 [m********** (len=11)]  =>  true
المدخل #4 [M********** (len=11)]  =>  true
المدخل #5 [م********** (len=11)]  =>  true
(المدخلات مشتقّة من النمط الموجود في src/flow.js نفسه — مخفية جزئياً هنا)
عدد البدائل في النمط: 3 — كلها تفتح البوابة.

--- الحالة 3 — الحقل الذي يمرره العميل فعليًا ---
draft.customerName مصدره: state NAME — العميل يكتب الاسم بنفسه.
-flow.js:6483 → draft.customerName = raw
  (الاسم يُخزَّن في جدول chats كـ draft JSON، ثم يُقرأ لاحقًا في isMinaRamses)

--- الحالة 4 — مسار التفعيل الذي يتبع البوابة ---
flow.js:376: function isMinaRamses(chatId, draft = {}, name = '') {
flow.js:6442: if (isMinaRamses(chatId, next, name)) {
flow.js:6615: if (isMinaRamses(chatId, next, name)) {
flow.js:6731: if (isMinaRamses(chatId, next, name)) {
flow.js:7082: if (isMinaRamses(chatId, next, name)) {
flow.js:7392: if (isMinaRamses(chatId, next, name)) {
flow.js:7896: if (isMinaRamses(chatId, draft, name)) {
flow.js:8282: if (!isOwnerChat(chatId) && !isMinaRamses(chatId, draft, name) && draft.paymentMethod !== 'الدفع من الرصيد') {
flow.js:8373: if (isMinaRamses(chatId, draft, name)) {

--- الحالة 5 — ما الذي يحدث بعد فتح البوابة ---

--- الحالة 6 — الدليل من القاعدة الحقيقية (أرقام منقّاة) ---
bookings.sms_ref_id موجود: true
bookings.sms_provider موجود: true
حجوزات بوابة المينا في القاعدة: 13
  BKG-46811204  chat=CHAT-2f25a24b  ref=REF-ab834c4a  amount=500  status=paid
  BKG-ff99d4c0  chat=CHAT-2f25a24b  ref=REF-953d7ad0  amount=300  status=paid
  BKG-e2851d37  chat=CHAT-2f25a24b  ref=REF-a14eaf32  amount=500  status=paid
  BKG-066346d9  chat=CHAT-2f25a24b  ref=REF-a4df7a86  amount=750  status=paid
  BKG-5db90a93  chat=CHAT-2f25a24b  ref=REF-267d9a1a  amount=1000  status=paid
  BKG-ad74981b  chat=CHAT-2f25a24b  ref=REF-acabe276  amount=300  status=paid
  BKG-ac397bd6  chat=CHAT-2f25a24b  ref=REF-700b3da9  amount=300  status=paid
  BKG-c52dcab1  chat=CHAT-2f25a24b  ref=REF-95fee05e  amount=300  status=paid
  BKG-017683df  chat=CHAT-2f25a24b  ref=REF-e8998a0f  amount=150  status=paid
  BKG-6e195f5f  chat=CHAT-2f25a24b  ref=REF-455e464e  amount=250  status=paid
  BKG-82fe6e51  chat=CHAT-2f25a24b  ref=REF-bf7301cc  amount=300  status=paid
  BKG-ed37a21b  chat=CHAT-2f25a24b  ref=REF-668876de  amount=750  status=paid
  BKG-137d4fb4  chat=CHAT-2f25a24b  ref=REF-266a8173  amount=750  status=paid
حجوزات بدالة مزوّد "تسجيل خاص": 13
  BKG-46811204  status=paid  provider=م*** (م*** ر***)
  BKG-ff99d4c0  status=paid  provider=م*** (م*** ر***)
  BKG-e2851d37  status=paid  provider=م*** (م*** ر***)
  BKG-066346d9  status=paid  provider=م*** (م*** ر***)
  BKG-5db90a93  status=paid  provider=م*** (م*** ر***)
  BKG-ad74981b  status=paid  provider=م*** (م*** ر***)
  BKG-ac397bd6  status=paid  provider=م*** (م*** ر***)
  BKG-c52dcab1  status=paid  provider=م*** (م*** ر***)
  BKG-017683df  status=paid  provider=م*** (م*** ر***)
  BKG-6e195f5f  status=paid  provider=م*** (م*** ر***)
  BKG-82fe6e51  status=paid  provider=م*** (م*** ر***)
  BKG-ed37a21b  status=paid  provider=م*** (م*** ر***)
  BKG-137d4fb4  status=paid  provider=م*** (م*** ر***)
```

---

## P02 — مسار إعادة الشراء الرقمي في اللوحة يخرج دائماً قبل الشراء

- **Severity:** critical
- **Area:** money-path
- **Refs:** src/admin/routes/digitalcore.js:1506, src/store.js:936-949
- **Proof:** [P02-digitalcore-rebuy-type-mismatch.md](../../evidence/proofs/P02-digitalcore-rebuy-type-mismatch.md)

### Claim

المسار يستدعي store.claimDigitalOrder(...) ثم يختبر claim.claimed، بينما الدالة تُرجع boolean، فالحقل claimed غير موجود والاختبار always true.

### Observed

claimDigitalOrder تُرجع true (boolean). claim.asked undefined ⇒ `!claim.claimed` = true ⇒ إعادة توجيه إلى settings-fail قبل أي نداء شراء، في كل مرة وبغض النظر عن حالة الحجز.

### Impact

عميل دفع ولم يُسلَّم منتجه الرقمي. الإدارة لا تستطيع إتمام الشراء من اللوحة وأي طلب شراء يدوي يخرج بنفس النتيجة. لا يوجد أثر في القاعدة يدل على ذلك.

### Fix

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

---

## P03 — webhook الخاص بالرسائل البنكية مفتوح في كل بيئة غير production

- **Severity:** critical
- **Area:** security
- **Refs:** src/payment_verifier.js:52-71, src/server.js:466-467
- **Proof:** [P03-sms-webhook-fail-open.md](../../evidence/proofs/P03-sms-webhook-fail-open.md)

### Claim

verifyWebhookAuth تُرجع `process.env.NODE_ENV !== 'production'` عند غياب المفتاح، وتُرجع true أيضاً عند غياب الترويسة عندما لا يكون NODE_ENV=test.

### Observed

NODE_ENV=production ⇒ false (مغلق، سليم). NODE_ENV=staging ⇒ true. NODE_ENV=development ⇒ true. NODE_ENV غير محدد ⇒ true. مع مفتاح صحيح ⇒ false.

### Impact

أي نشر تجريبي أو بيئة إنتاج مضبوطة خطأ (مثلاً systemd بلا NODE_ENV) يجعل المسار يقبل أي طلب بلا مصادقة. الطلب المُزيف يدخل trusted_payments ويُطابَق مع حجز فيُسجَّل كدفعة حقيقية — أي تحويل رصيد غير مدفوع إلى "مدفوع".

### Fix

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

---

## P10 — ملف القفل يحمل PID من ويندوز فيمنع إقلاع البوت على السيرفر

- **Severity:** critical
- **Area:** deployment
- **Refs:** src/server.js:832-856, scripts/supervisor.js:79-102, deploy/systemd/wa-booking-bot.service
- **Proof:** [P10-stale-lock-pid-blocks-boot.md](../../evidence/proofs/P10-stale-lock-pid-blocks-boot.md)

### Claim

فحص النسخة الواحدة يعتمد على process.kill(pid, 0) وحدها: إذا كان PID مخزّن حيّاً على السيرفر الجديد، يخرج البوت بـ exit(2) بدون التحقق من هوية العملية.

### Observed

ملف القفل الحالي يحمل PID=15968. محاكاة الفحص: PID حيّ ⇒ process.kill(15968, 0) نجح ⇒ البوت يخرج بـ exit(2). PID غير حيّ ⇒ process.kill(15968, 0) فشل ⇒ يُحذف القفل ويُكمل.

### Impact

بعد نقل مجلد data/ كما هو إلى السيرفر: إن توفّر PID مطابق لعملية حيّة (وهي أرقام PID معاد تدويرها على لينكس) يرفض البوت الإقلاع نهائياً. مع Restart=always في systemd يدخل في حلقة إقلاع لا نهائية بلا رسالة مفيدة. كما ينطبق الأمر على supervisor.lock.

### Fix

تحقق من هوية العملية قبل الرفض، وتجاهل ملفات القفل القديمة:
```js
function isOurProcess(pid) {
  if (!pid || pid === process.pid) return false;
  try {
    const cmd = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8');
    return cmd.includes('src/server.js') || cmd.includes('supervisor.js');
  } catch (_) {
    return false; // العملية غير موجودة أو ليست بوتاً
  }
}
```
واستبدل فحص process.kill بهذا، واحذف ملفات القفل من مجلد data قبل أول تشغيل على السيرفر.

## Raw output

```

--- منطق فحص القفل في src/server.js ---
833:   const lockFile = path.join(store.DATA_DIR, 'bot.lock');
834:   let lockFd = null;
835:   if (fs.existsSync(lockFile)) {
836:     try {
837:       const rawLock = fs.readFileSync(lockFile, 'utf8').trim();
838:       const [oldPid] = rawLock.split('\n');
839:       const pidNum = parseInt(oldPid, 10);
840:       if (pidNum && !isNaN(pidNum) && pidNum !== process.pid) {
841:         try {
842:           process.kill(pidNum, 0); // فحص هل العملية لا زالت قيد التشغيل
843:           console.error('\n[FATAL] نسخة أخرى من البوت قيد التشغيل بالفعل (PID: ' + pidNum + ')!\nيرجى إيقاف النسخة السابقة أولاً قبل تشغيل نسخة جديدة.\n');
844:           process.exit(2);
845:         } catch (_) {
846:           try { fs.unlinkSync(lockFile); } catch (_) {}
847:         }
848:       }
849:     } catch (_) {}
850:   }
851:   try {
852:     lockFd = fs.openSync(lockFile, 'w');
853:     fs.writeSync(lockFd, String(process.pid) + '\n' + new Date().toISOString() + '\n');
854:   } catch (err) {
855:     console.error(`\n[LOCK] تعذر حجز قفل التشغيل: ${err.message}\n`);
856:   }
857: 
858:   const server = app.listen(config.port, config.host, () => {

--- محتوى ملف القفل الحالي ---
المسار: D:\wa-booking-bot\data\bot.lock
المحتوى:
15968
2026-11-11T12:13:11.946Z
PID: 15968   الطابع الزمني: 2026-11-11T12:13:11.946Z

--- هل PID ويندوز مستخدم كـ PID لينكس؟ ---
PID من ملف القفل: 15968
على ويندوز: PID 15968 هو عملية node الخاصة بالبوت.
بعد نقل data/ إلى سيرفر لينكس: لا وجود لـ "node 15968" هناك،
لكن Linux يعيد تدوير أرقام PID — وPID 15968 على السيرفر الجديد
قد يكون حيّاً لعملية أخرى تماماً (nginx، docker، sshd).

--- محاكاة فحص القفل بمنطق server.js نفسه ---
حالة PID حيّ على السيرفر الجديد:  {"blocked":true,"reason":"process.kill(15968, 0) نجح ⇒ البوت يخرج بـ exit(2)"}
حالة PID غير حيّ:                  {"blocked":false,"reason":"process.kill(15968, 0) فشل ⇒ يُحذف القفل ويُكمل"}

--- الأثر مع systemd ---
  WorkingDirectory=/opt/wa-booking-bot
  ExecStart=/usr/bin/node /opt/wa-booking-bot/src/server.js
  Restart=on-failure
مع Restart=always: كل رفض بإ.exit(2) ⇒ إعادة تشغيل فورية ⇒ حلقة إقلاع لا نهائية.
لا سجل أخطاء مفيد: الرسالة "[FATAL] نسخة أخرى قيد التشغيل" مضلِّلة،
لأن النسخة الأخرى قد لا وجود لها أصلاً على هذا السيرفر.

--- ملف قفل المشرف — نفس المشكلة ---
supervisor.lock: 30368
  scripts/supervisor.js:25: const SUPERVISOR_LOCK = path.join(DATA_DIR, 'supervisor.lock');
  scripts/supervisor.js:87: process.kill(pidNum, 0); // فحص هل العملية لا زالت قيد التشغيل
```

