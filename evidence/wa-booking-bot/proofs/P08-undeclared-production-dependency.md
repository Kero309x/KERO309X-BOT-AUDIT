# P08 — اعتماديات في مسار الإنتاج غير معلنة أو مُعلنة dev فقط

- **Severity:** high
- **Area:** deployment
- **Subject:** wa-booking-bot
- **Refs:** src/we_api.js:18-29, package.json:31-39
- **Verdict:** REPRODUCED

## Claim

src/we_api.js — وهو في مسار الإنتاج — يستدعي playwright و playwright-core. كلاهما devDependency، وواحد منهما غير مذكور في package.json إطلاقاً.

## Expected

كل اعتماد يستخدمه كود الإنتاج يجب أن يكون في dependencies، وإلا يفشل npm ci --omit=dev على السيرفر.

## Observed

غير معلنة إطلاقاً: playwright-core. devDependency مستخدمة في الإنتاج: playwright. محاكاة require في بيئة بلا playwright: الفشل لا يُترجم إلى رسالة واضحة.

## Impact

بعد `npm ci --omit=dev` على السيرفر تفشل ميزات WE Family بصمت: الـcatch يبتلع الاستثناء فلا يظهر خطأ في السجلات، ولا يعرف المشغّل أن الميزة معطّلة. كما أن البناء حسب DEPLOYMENT.md يستخدم --omit=dev بالضبط.

## Fix

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
