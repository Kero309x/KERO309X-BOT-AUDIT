# P09 — تغيير مسار DATA_DIR يحوّل كل الإرسال إلى وضع المحاكاة

- **Severity:** high
- **Area:** deployment
- **Refs:** src/openwa.js:9-24, src/followups.js:53-57
- **Verdict:** REPRODUCED

## Claim

openwa.isTestEnvironment تستنتج "بيئة اختبار" من أن DATA_DIR مختلف عن <repo>/data، ولا تعتمد على NODE_ENV إلا في الاتجاه المعاكس. followups.isTestEnvironment توقف المتابعات إذا احوى المسار على "wa-booking-".

## Expected

أن يكون وضع المحاكاة محكوماً بـ NODE_ENV=test صريحاً فقط، وأن يكون مسار البيانات قابلاً للتغيير بحرية.

## Observed

DATA_DIR=<repo>/data ⇒ isTestEnvironment=false (إرسال حقيقي). DATA_DIR=/opt/wa-booking-bot/data ⇒ isTestEnvironment=true (كل الإرسال MOCK). حتى مع NODE_ENV=production.

## Impact

النقل إلى السيرفر بالشكل الموصوف في DEPLOYMENT.md (DATA_DIR=/opt/wa-booking-bot/data) يُطفئ الرسائل فوراً بعد التشغيل: البوت يستقبل ويُسجّل ويرد على قاعدة البيانات، لكنه لا يرسل ولا كلمة للعميل ولا إشعاراً للأدمن. الخطأ يظهر كـ"العميل لا يرد" لا كخطأ تقني.

## Fix

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
