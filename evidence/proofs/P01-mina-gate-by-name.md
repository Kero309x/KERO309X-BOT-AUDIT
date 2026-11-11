# P01 — بوابة التفعيل الخاص تُفتح باسم يكتبه العميل نفسه

- **Severity:** critical
- **Area:** money-path
- **Refs:** src/flow.js:376-397, src/flow.js:6442, src/flow.js:8373-8380, src/bookings.js:715-745
- **Verdict:** REPRODUCED

## Claim

الدالة isMinaRamses في src/flow.js تُرجع true عندما يطابق الاسم أي نص يطابق /mina\s*ramsis|mina\s*ramses/i، والاسم حقل يكتبه العميل في مرحلة NAME. بعدها يمرّر الكود الحجز إلى markPaymentVerified بمبلغ 0 فيتحوّل إلى paid مع smsVerified=true.

## Expected

أن تكون البوابة مربوطة بمعرّف المحادثة أو برقم الهاتف المسجّل فقط، ولا تُفتح أبداً بمجرد كتابة العميل لاسمه.

## Observed

عميل بمعرّف محادثة جديد (2010******99@c.us) يكتب اسماً يطابق النمط /mina\s*ramsis|mina\s*ramses/i في حقل الاسم ⇒ isMinaRamses => true، والحجز ينتقل إلى markPaymentVerified({ amount: 0 }) فتصبح حالته paid مع smsVerified=true ومعالجة المنتج الرقمي تُنفَّذ.

## Impact

أي زائر يستطيع الحصول على منتج رقمي مجاناً بمجرد كتابة اسمين في حقل الاسم. الأثر ينتقل مباشرة إلى المسار المالي: المنتج يُشحن بدون دفعة، مع تسجيل sms_verified=true ما يفسد أي إحصاء للإيراد لاحقاً.

## Fix

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
