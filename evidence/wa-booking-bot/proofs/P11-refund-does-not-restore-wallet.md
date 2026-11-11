# P11 — استرداد دفعة من محفظة العميل عبر اللوحة لا يُعيد الرصيد

- **Severity:** medium
- **Area:** money-path
- **Subject:** wa-booking-bot
- **Refs:** src/refunds.js:96-111, src/customers.js:270-292, src/flow.js:1142
- **Verdict:** REPRODUCED

## Claim

refunds.setStatus(id, 'done') يحرّر الكوبون ويسجّل في ops_log، لكنه لا يستدعي customers.addBalance — بخلاف مسار الاسترداد عبر واتساب.

## Expected

أن يعود المبلغ إلى محفظة العميل إن كان الدفع من الرصيد، وأن يُسجَّل ذلك كحركة رصيد (balance_transactions).

## Observed

رصيد المحفظة قبل الاسترداد: 500. بعده: 500. حركات الرصيد المسجّلة: لا شيء. حالة الاسترداد صارت done والحجز تبقى paid — أي أن الحدث المالي حدث بلا أثر على المحفظة. ملاحظة على البيانات الحيّة: الاستردادات المكتملة الموجودة في القاعدة كلها مدفوعة نقداً (فودافون كاش) وليس من المحفظة، فالعيب كامن وليس منفّذاً بعد.

## Impact

لو دفع عميل من رصيد محفظته ثم استُردّ طلبه من لوحة الإدارة: رصيده لا يعود بل ينقص عن قيمته الفعلية. كما أن سجل حركات الرصيد لا يوثّق شيئاً، ما يجعل الفرق غير قابل للتدقيق. المسار البديل عبر واتساب (flow.js) يفعل ذلك بشكل صحيح — الخلل في مسار لوحة الإدارة وحده.

## Fix

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
