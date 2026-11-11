# Medium findings

A path that exists, is reachable, and does nothing — or that moves money in one direction only. Both are customer-visible.

| ID | Finding | Area | Proof |
|---|---|---|---|
| P07 | التحقق من التفعيل الرقمي معطّل: حاجز خاطئ + استعلام على عمود غير موجود | reliability | [proof](../../evidence/proofs/P07-followups-digital-activation-dead.md) |
| P11 | استرداد دفعة من محفظة العميل عبر اللوحة لا يُعيد الرصيد | money-path | [proof](../../evidence/proofs/P11-refund-does-not-restore-wallet.md) |

---

## P07 — التحقق من التفعيل الرقمي معطّل: حاجز خاطئ + استعلام على عمود غير موجود

- **Severity:** medium
- **Area:** reliability
- **Refs:** src/followups.js:583-589, src/store.js:823-834
- **Proof:** [P07-followups-digital-activation-dead.md](../../evidence/proofs/P07-followups-digital-activation-dead.md)

### Claim

verifyBookingActivation يفحص الشرط (b.packageId.startsWith('dc_') || b.network === 'digital')، والحجوزات الرقمية الحقيقية لا تحقق أيّاً منهما (network="خدمات رقمية"، package_id بلا بادئة dc_) ⇒ الفرع لا يُنفَّذ. وعلاوة على ذلك الاستعلام داخله يقرأ عمود provider_order_id غير الموجود (العمود الفعلي order_id).

### Observed

حجوزات لها صف digital_orders: 29. منها يمرّ بالحاجز: 0. والاستعلام الداخلي يرمي: no such column: provider_order_id. الاستعلام الصحيح بـ order_id ينجح.

### Impact

لا يتحقق البوت أبداً من تفعيل المنتجات الرقمية: لا تصل رسالة "تم التفعيل" للعميل، ولا تكتشف المتابعةُ التنشيطَ اليدوي بعد الاستلام. الاستثناء مخفي لأن طبقة الاستدعاء تبتلعه، فلا يظهر أي خطأ في السجلات.

### Fix

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

---

## P11 — استرداد دفعة من محفظة العميل عبر اللوحة لا يُعيد الرصيد

- **Severity:** medium
- **Area:** money-path
- **Refs:** src/refunds.js:96-111, src/customers.js:270-292, src/flow.js:1142
- **Proof:** [P11-refund-does-not-restore-wallet.md](../../evidence/proofs/P11-refund-does-not-restore-wallet.md)

### Claim

refunds.setStatus(id, 'done') يحرّر الكوبون ويسجّل في ops_log، لكنه لا يستدعي customers.addBalance — بخلاف مسار الاسترداد عبر واتساب.

### Observed

رصيد المحفظة قبل الاسترداد: 500. بعده: 500. حركات الرصيد المسجّلة: لا شيء. حالة الاسترداد صارت done والحجز تبقى paid — أي أن الحدث المالي حدث بلا أثر على المحفظة. ملاحظة على البيانات الحيّة: الاستردادات المكتملة الموجودة في القاعدة كلها مدفوعة نقداً (فودافون كاش) وليس من المحفظة، فالعيب كامن وليس منفّذاً بعد.

### Impact

لو دفع عميل من رصيد محفظته ثم استُردّ طلبه من لوحة الإدارة: رصيده لا يعود بل ينقص عن قيمته الفعلية. كما أن سجل حركات الرصيد لا يوثّق شيئاً، ما يجعل الفرق غير قابل للتدقيق. المسار البديل عبر واتساب (flow.js) يفعل ذلك بشكل صحيح — الخلل في مسار لوحة الإدارة وحده.

### Fix

في refunds.setStatus، عند status==='done'، أعد المبلغ إلى المحفظة إن كان الدفع من الرصيد:
```js
if (status === STATUS.DONE && existing.status !== STATUS.DONE) {
  const bk = bookings.findBooking(existing.booking_id);
  if (bk && bk.paymentMethod === 'wallet') {
    customers.addBalance(existing.chat_id, existing.amount, {
      bookingId: existing.booking_id, type: 'refund',
      reason: `استرداد ${existing.id}`,
    });
  }
}
```
معGuard على عدم التكرار (سجل是否存在 حركة استرداد سابقة للحجز).

## Raw output

```

--- مسار setStatus في src/refunds.js ---
85: function setStatus(id, status) {
86:   if (!Object.values(STATUS).includes(status)) return null;
87:   const existing = get(id);
88:   if (!existing) return null;
89:   // done/rejected حالة نهائية (الواجهة لا تعرض تغييرًا بعدهما): العودة لـ
90:   // requested/تفاوض تعيد فتح طلب انتهى فعلًا وتكسر عدّاد الإيراد والصندوق
91:   if ((existing.status === STATUS.DONE || existing.status === STATUS.REJECTED) && status !== existing.status) {
92:     return null;
93:   }
94:   getDb().prepare('UPDATE refunds SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), String(id).toUpperCase());
95:   const updated = get(id);
96:   if (status === STATUS.DONE && existing.status !== STATUS.DONE) {
97:     noteBookingRefund(existing);
98:     // عند إتمام الاسترداد: تحرير الكوبون المستهلَك + قيد مالي على رصيد العميل
99:     try {
100:       require('./coupons').releaseCouponForBooking(existing.booking_id, 'refunded');
101:     } catch (couponErr) {
102:       console.error('[refunds] تعذّر تحرير الكوبون بعد الاسترداد:', couponErr.message);
103:     }
104:     try {
105:       // المبلغ الخارج عادةً تحويل بنكي (وليس رصيد محفظة) — لا نخصم من رصيد العميل،
106:       // لكن نسجّل الحركة في سجل العمليات كدليل مالي قابل للتدقيق.
107:       require('./opslog').logOps('dashboard', 'استرداد مكتمل', existing.booking_id, `المبلغ: ${existing.amount} | الطلب: ${existing.id}`);
108:     } catch (opsErr) {
109:       console.error('[refunds] تعذّر تسجيل الاسترداد في سجل العمليات:', opsErr.message);
110:     }
111:   }
112:   return updated;
113: }
114: 
115: /** عند إتمام الاسترداد ندوّن على الحجز: المبلغ خرج فعلًا من الصندوق */
116: function noteBookingRefund(ref) {

--- من يستدعي customers.addBalance؟ ---
  src/admin/routes/customers.js:628: customers.addBalance(chatId, initialBalance, {
  src/admin/routes/customers.js:712: customers.addBalance(chatId, amount, { reason, type: 'manual_credit', addedBy: 'admin' });
  src/bookings.js:635: customers.addBalance(booking.chatId, surplus, {
  src/bookings.js:661: customers.addBalance(booking.chatId, cbAmt, {
  src/bookings.js:759: customers.addBalance(booking.chatId, cbAmt, {
  src/customers.js:270: function addBalance(chatId, amount, { bookingId = null, type = 'deposit', reason = '', addedBy = 'admin' } = {}) {
  src/customers.js:539: addBalance,
  src/flow.js:909: customers.addBalance(targetId, amountVal, { reason, type: 'manual_credit' });
  src/flow.js:1142: customers.addBalance(targetChat, refundAmt, {
  src/flow.js:2564: customers.addBalance(targetChatId, amountVal, { reason, type: 'manual_credit' });
  src/flow.js:2749: customers.addBalance(targetBooking.chatId, refundAmt, {
  src/payment_verifier.js:370: customers.addBalance(booking.chatId, surplus, {
  src/telegram_bot.js:724: const newBalance = customers.addBalance(targetChat, amount, {
src/refunds.js لا يظهر في القائمة.

--- مسار الاسترداد عبر واتساب للمقارنة ---
  src/flow.js:909: customers.addBalance(targetId, amountVal, { reason, type: 'manual_credit' });
}
  src/flow.js:1142: customers.addBalance(targetChat, refundAmt, {
reason: `استرداد حجز ملغي ${targetBooking.id}: ${reason}`,
  src/flow.js:2564: customers.addBalance(targetChatId, amountVal, { reason, type: 'manual_credit' });
}
  src/flow.js:2749: customers.addBalance(targetBooking.chatId, refundAmt, {
reason: `استرداد حجز ملغي ${targetBooking.id}: ${reason}`,

--- محاكاة: استرداد عبر لوحة الإدارة على قاعدة معزولة ---
رصيد المحفظة قبل الاسترداد: 500
نتيجة setStatus('RF-P11','done'): done
رصيد المحفظة بعد الاسترداد: 500
حركات الرصيد المسجّلة: []
حالة الاسترداد في القاعدة: done
حالة الحجز: paid

--- الدليل من القاعدة الحقيقية — استردادات مكتملة ---
استردادات بحالة done: 2
  RF-997879e0  booking=BKG-b398db1b  amount=320  payment_method=فودافون كاش  chat=CHAT-0aeeb34e
  RF-a054fc4b  booking=BKG-b398db1b  amount=320  payment_method=فودافون كاش  chat=CHAT-0aeeb34e
منها حجوزات دُفعت من المحفظة: 0
```

