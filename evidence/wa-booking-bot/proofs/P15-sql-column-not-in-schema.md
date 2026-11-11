# P15 — عمود SQL مستعمل وغير موجود في المخطط

- **Severity:** high
- **Area:** reliability
- **Subject:** wa-booking-bot
- **Refs:** src/followups.js:585
- **Verdict:** REPRODUCED

## Claim

كل عمود يظهر في استعلام SQL داخل src/ يجب أن يكون موجوداً في مخطط القاعدة الحقيقية. العمود الناقص يجعل الاستعلام يرمي استثناءً وقت التشغيل لا وقت البناء.

## Expected

أن ينجح كل استعلام. أي عمود ناقص يظهر كخطأ SQL يُبتلع في طبقة الاستدعاء، فيظهر للمستخدم كـ"الخاصية غير موجودة" لا كخطأ برمجي.

## Observed

1 موضعاً:
  src/followups.js:585 — جدول digital_orders: provider_order_id

## Impact

المسار الذي يحوي الاستعلام يفشل صامتاً. في حالة التحقق من تفعيل المنتجات الرقمية، هذا يعني أن التحقق لا يعمل أبداً ولا أحد يعرف. قد تكون آثاره مالية: مسار تحقق لا ينفّذ يبدو كأنه نجح.

## Fix

صحّح اسم العمود في الاستعلام. ولمنع تكرارها:
- أضف اختباراً ينفّذ كل مسار تحقق على صف حقيقي في قاعدة معزولة؛
- أضف فحصاً في CI يمرّ على المخطط الحيّ ويقارنه بالأعمدة المستعملة (هذا الـproof نفسه).

## Raw output

```

--- نطاق الفحص ---
مستعلامات SQL مفحوصة: 387
جداول مذكورة: owner_accounts, owner_members, bookings, customers, admin_status_log, followup_log, chat_log, auto_rules, chats, coupons, coupon_redemptions, balance_transactions, custom_faqs, digital_orders, funnel_events, handoffs, trusted_payments, ops_log, ratings, refunds, seasons, learned_knowledge, packages, settings, webhook_events, payment_claims, shadow_evaluations, services, stock_waitlist, customer_aliases, tickets

--- أعمدة مستعملة وغير موجودة في المخطط ---
src/followups.js:585  جدول digital_orders  ⇒  provider_order_id
    SELECT status, provider_order_id FROM digital_orders WHERE booking_id = ?
```
