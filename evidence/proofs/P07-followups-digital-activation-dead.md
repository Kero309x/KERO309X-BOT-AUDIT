# P07 — التحقق من التفعيل الرقمي معطّل: حاجز خاطئ + استعلام على عمود غير موجود

- **Severity:** medium
- **Area:** reliability
- **Refs:** src/followups.js:583-589, src/store.js:823-834
- **Verdict:** REPRODUCED

## Claim

verifyBookingActivation يفحص الشرط (b.packageId.startsWith('dc_') || b.network === 'digital')، والحجوزات الرقمية الحقيقية لا تحقق أيّاً منهما (network="خدمات رقمية"، package_id بلا بادئة dc_) ⇒ الفرع لا يُنفَّذ. وعلاوة على ذلك الاستعلام داخله يقرأ عمود provider_order_id غير الموجود (العمود الفعلي order_id).

## Expected

أن يمرّ فرع DigitalCore على الحجوزات الرقمية الحقيقية، وأن يقرأ العمود الفعلي، وأن يفشل صريحاً عند أي خطأ SQL.

## Observed

حجوزات لها صف digital_orders: 29. منها يمرّ بالحاجز: 0. والاستعلام الداخلي يرمي: no such column: provider_order_id. الاستعلام الصحيح بـ order_id ينجح.

## Impact

لا يتحقق البوت أبداً من تفعيل المنتجات الرقمية: لا تصل رسالة "تم التفعيل" للعميل، ولا تكتشف المتابعةُ التنشيطَ اليدوي بعد الاستلام. الاستثناء مخفي لأن طبقة الاستدعاء تبتلعه، فلا يظهر أي خطأ في السجلات.

## Fix

صحّح الحاجز ليطابق البيانات الفعلية:
```js
const isDigital = b.network === 'خدمات رقمية' || /^DC-/i.test(b.id || '')
  || (b.packageId && b.packageId.startsWith('dc_'));
```
وصحّح العمود:
```sql
SELECT status, order_id FROM digital_orders WHERE booking_id = ?
```
وأضف اختباراً يمرّ على verifyBookingActivation مع صف digital_orders حقيقي.

## Raw output

```

--- الاستعلام في src/followups.js ---
579:     return { verified: true, method: 'TEST_DRY_RUN' };
580:   }
581: 
582:   // 1. باقات واشتراكات ديجيتال كور (DigitalCore)
583:   if (b.packageId && (b.packageId.startsWith('dc_') || b.network === 'digital')) {
584:     const d = store.getDb();
585:     const dOrder = d.prepare('SELECT status, provider_order_id FROM digital_orders WHERE booking_id = ?').get(b.id);
586:     if (dOrder && (dOrder.status === 'completed' || dOrder.status === 'success')) {
587:       return { verified: true, method: 'DIGITALCORE_API_COMPLETED' };
588:     }
589:     return { verified: false, reason: 'DIGITALCORE_ORDER_NOT_COMPLETED' };
590:   }
591: 
592:   const reqPhone = String(b.requestedPhone || '').trim().replace(/[\s\-_]/g, '').replace(/^(\+?20|0020)/, '');

--- المخطط الفعلي لجدول digital_orders ---
  booking_id (TEXT)
  status (TEXT)
  order_id (TEXT)
  items (TEXT)
  error (TEXT)
  created_at (TEXT)
  updated_at (TEXT)
يحتوي provider_order_id: false
يحتوي order_id: true

--- حاجز الدخول إلى فرع DigitalCore — هل يصل أصلاً؟ ---
حجوزات لها صف في digital_orders: 29
  id=DC-050  package_id=gemini_pro_18m  network="خدمات رقمية"  ⇒Guard=false
  id=DC-052  package_id=gemini_pro_18m  network="خدمات رقمية"  ⇒Guard=false
  id=DC-051  package_id=gemini_pro_18m  network="خدمات رقمية"  ⇒Guard=false
  id=DC-053  package_id=coursera_plus_12m  network="خدمات رقمية"  ⇒Guard=false
  id=DC-054  package_id=gemini_pro_18m  network="خدمات رقمية"  ⇒Guard=false
  id=DC-055  package_id=coursera_plus_12m  network="خدمات رقمية"  ⇒Guard=false
حجوزات رقمية يمرّ شرط (packageId.startsWith('dc_') || network==='digital'): 0 من 29
الحجوزات الرقمية الحقيقية تح network="خدمات رقمية" ومعرّف package_id بلا بادئة dc_.
⇒ فرع DigitalCore في verifyBookingActivation شيفرة ميتة: لا يُنفَّذ أبداً.

--- تشغيل الاستعلام كما هو مكتوب (لو وصل الفرع) ---
خطأ SQL: no such column: provider_order_id
رمز الخطأ: SQLITE_ERROR

--- الاستعلام الصحيح ---
نجح ⇒ undefined

--- الأثر ---
verifyBookingActivation لا يتحقق من تفعيل المنتجات الرقمية إطلاقاً:
1) الحاجز لا يمرّ ⇒ فرع DigitalCore لا يُنفَّذ.
2) لو مرّ، الاستعلام يرمي استثناءً على عمود غير موجود.
النتيجة: لا تصل رسالة "تم التفعيل" للعميل الرقمي، ولا يكتشف المتابعةُ
التنشيط اليدوي بعد الاستلام. الاستثناء مخفي لأن الاستدعاء يبتلعه.
```
