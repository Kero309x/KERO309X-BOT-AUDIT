# Medium findings — wa-booking-bot — متجر باقات وخدمات رقمية

A path that exists, is reachable, and does nothing — or that moves money in one direction only. Both are customer-visible.

| ID | Finding | Area | Verdict | Proof |
|---|---|---|---|---|
| P07 | التحقق من التفعيل الرقمي معطّل: حاجز خاطئ + استعلام على عمود غير موجود | reliability | REPRODUCED | [proof](../../evidence/wa-booking-bot/proofs/P07-followups-digital-activation-dead.md) |
| P11 | استرداد دفعة من محفظة العميل عبر اللوحة لا يُعيد الرصيد | money-path | REPRODUCED | [proof](../../evidence/wa-booking-bot/proofs/P11-refund-does-not-restore-wallet.md) |
| P16 | أخطاء تُبتلع بلا تسجيل — وخصوصاً في المسار المالي | reliability | REPRODUCED | [proof](../../evidence/wa-booking-bot/proofs/P16-swallowed-error-scan.md) |

---

## P07 — التحقق من التفعيل الرقمي معطّل: حاجز خاطئ + استعلام على عمود غير موجود

- **Severity:** medium
- **Area:** reliability
- **Refs:** src/followups.js:583-589, src/store.js:823-834
- **Verdict:** REPRODUCED
- **Proof:** [P07-followups-digital-activation-dead.md](../../evidence/wa-booking-bot/proofs/P07-followups-digital-activation-dead.md)

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
- **Verdict:** REPRODUCED
- **Proof:** [P11-refund-does-not-restore-wallet.md](../../evidence/wa-booking-bot/proofs/P11-refund-does-not-restore-wallet.md)

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

---

## P16 — أخطاء تُبتلع بلا تسجيل — وخصوصاً في المسار المالي

- **Severity:** medium
- **Area:** reliability
- **Refs:** src/digitalcore.js:154, src/digitalcore.js:174, src/digitalcore.js:175, src/digitalcore.js:189, src/digitalcore.js:286, src/payment_verifier.js:420
- **Verdict:** REPRODUCED
- **Proof:** [P16-swallowed-error-scan.md](../../evidence/wa-booking-bot/proofs/P16-swallowed-error-scan.md)

### Claim

كل خطأ يجب أن يُسجَّل على الأقل. الخطأ الذي يُبتلع في catch يسجّل فقط يعني أن مساراً مالياً يستمر كأنه نجح.

### Observed

catch فارغ: 227. catch يسجّل فقط: 0. promises معلّقة بمعالج فارغ: 78. منها في مسار مال: 6. المواضع: src/digitalcore.js:154، src/digitalcore.js:174، src/digitalcore.js:175، src/digitalcore.js:189، src/digitalcore.js:286، src/payment_verifier.js:420.

### Impact

في مسار الدفع: فشل تحديث رصيد أو كوبون أو تأكيد حجز يبتلع الخطأ، فتُسجَّل الدفعة بينما لم تكتمل آثارها. الفرق يظهر لاحقاً كخلل تسوية لا كخطأ.

### Fix

في مسار المال: ارمي الخطأ داخل المعاملة حتى تُلغى العملية بالكامل، أو سجّله في ops_log مع كل التفاصيل وأعِد الحالة صراحةً. في غير مسار المال: الـcatch الفارغ مقبول إذا كان الغرض تجاهل خطأ متوقّع — لكن اترك تعليقاً يشرح لماذا.

## Raw output

```

--- catch فارغ — لا يسجّل ولا يفعل شيئاً ---
src/admin/layout.js:17  } catch (_) {}
src/admin/owners.js:685  } catch (_) {}
src/admin/routes/coupons.js:43  } catch (_) {}
src/admin/routes/customers.js:770  } catch (_) {}
src/admin/routes/customers.js:779  } catch (_) {}
src/admin/routes/customers.js:819  } catch (_) {}
src/admin/routes/customers.js:830  } catch (_) {}
src/admin/routes/customers.js:842  } catch (_) {}
src/admin/routes/handoffs.js:70  } catch (_) {}
src/admin/routes/handoffs.js:107  } catch (_) {}
src/admin/routes/handoffs.js:115  } catch (_) {}
src/admin/routes/handoffs.js:123  } catch (_) {}
src/admin/routes/onboarding.js:614  try { localStorage.setItem('wa_admin_theme', next); } catch(e){}
src/admin/routes/onboarding.js:625  } catch(e){}
src/admin/routes/onboarding.js:1150  } catch (_) {}
src/admin/routes/store.js:34  } catch (_) {}
src/admin/routes/store.js:50  } catch (_) {}
src/admin/views.js:43  } catch (_) {}
src/ai_brain.js:55  } catch (_) {}
src/ai_brain.js:65  } catch (_) {}
src/ai_brain.js:192  } catch (_) {}
src/ai_brain.js:204  } catch (_) {}
src/audio_transcriber.js:44  } catch (_) {}
src/audio_transcriber.js:77  } catch (_) {}
src/bank_reconciliation.js:148  } catch (_) {}
src/bookings.js:673  try { require('./funnel').logStage(booking.chatId, 'paid'); } catch (_) { /* تجاهل */ }
src/bookings.js:771  try { require('./funnel').logStage(booking.chatId, 'paid'); } catch (_) { /* تجاهل */ }
src/booking_admin_commands.js:909  } catch (_) {}
src/booking_admin_commands.js:1080  } catch (_) {}
src/booking_admin_commands.js:1149  } catch (_) {}
src/booking_admin_commands.js:1302  } catch (_) {}
src/config.js:59  } catch (_) {}
src/customers.js:401  } catch (_) {}
src/customers.js:459  } catch (_) {}
src/dashboard_api.js:65  } catch (_) {}
src/flow/helpers.js:68  } catch (_) {}
src/flow/helpers.js:320  } catch (_) {}
src/flow/helpers.js:378  } catch (_) {}
src/flow/helpers.js:384  } catch (_) {}
src/flow/helpers.js:390  } catch (_) {}
src/flow/helpers.js:414  } catch (_) {}
src/flow/helpers.js:427  } catch (_) {}
src/flow/helpers.js:436  } catch (_) {}
src/flow.js:191  } catch (_) {}
src/flow.js:219  } catch (_) {}
src/flow.js:253  } catch (_) {}
src/flow.js:804  } catch (_) {}
src/flow.js:812  } catch (_) {}
src/flow.js:869  } catch (_) {}
src/flow.js:897  } catch (_) {}
src/flow.js:925  } catch (_) {}
src/flow.js:935  } catch (_) {}
src/flow.js:949  } catch (_) {}
src/flow.js:969  } catch (_) {}
src/flow.js:990  } catch (_) {}
src/flow.js:994  } catch (_) {}
src/flow.js:1000  } catch (_) {}
src/flow.js:1021  } catch (_) {}
src/flow.js:1072  } catch (_) {}
src/flow.js:1091  } catch (_) {}
src/flow.js:1123  } catch (_) {}
src/flow.js:1130  } catch (_) {}
src/flow.js:1162  } catch (_) {}
src/flow.js:1186  } catch (_) {}
src/flow.js:1197  } catch (_) {}
src/flow.js:1228  } catch (_) {}
src/flow.js:1248  } catch (_) {}
src/flow.js:1308  } catch (_) {}
src/flow.js:1324  } catch (_) {}
src/flow.js:1670  } catch (_) {}
src/flow.js:1919  } catch (_) {}
src/flow.js:1924  } catch (_) {}
src/flow.js:1932  } catch (_) {}
src/flow.js:1960  } catch (_) {}
src/flow.js:2145  } catch (_) {}
src/flow.js:2169  try { customers.setBlocked(targetChatId, false); } catch (_) {}
src/flow.js:2176  try { customers.setBlocked(altChat, false); } catch (_) {}
src/flow.js:2181  } catch (_) {}
src/flow.js:2362  } catch (_) {}
src/flow.js:2582  } catch (_) {}
src/flow.js:2638  } catch (_) {}
src/flow.js:2666  } catch (_) {}
src/flow.js:2669  } catch (_) {}
src/flow.js:2770  } catch (_) {}
src/flow.js:2783  } catch (_) {}
src/flow.js:2814  } catch (_) {}
src/flow.js:2983  } catch (_) {}
src/flow.js:3257  } catch (_) {}
src/flow.js:3299  try { fs.mkdirSync(backupDir, { recursive: true }); } catch (_) {}
src/flow.js:3529  } catch (_) {}
src/flow.js:3736  } catch (_) {}
src/flow.js:3854  } catch (_) {}
src/flow.js:3895  } catch (_) {}
src/flow.js:3923  } catch (_) {}
src/flow.js:3975  } catch (_) {}
src/flow.js:4046  } catch (_) {}
src/flow.js:4073  } catch (_) {}
src/flow.js:4396  } catch (_) {}
src/flow.js:4408  } catch (_) {}
src/flow.js:4468  } catch (_) {}
src/flow.js:4506  } catch (_) {}
src/flow.js:4558  try { handoff.record({ chatId, customerName: name, body, reason: canned.id }); } catch (_) {}
src/flow.js:5003  } catch (_) {}
src/flow.js:5169  } catch (_) {}
src/flow.js:5172  } catch (_) {}
src/flow.js:5237  try { handoff.record({ chatId, customerName: name, body, reason: 'main_menu_conversational' }); } catch (_) {}
src/flow.js:5725  try { funnel.logStage(chatId, 'network'); } catch (_) { /* تجاهل */ }
src/flow.js:5763  try { handoff.record({ chatId, customerName: name, body, reason: 'network_conversational' }); } catch (_) {}
src/flow.js:5767  } catch (_) {}
src/flow.js:5859  try { handoff.record({ chatId, customerName: name, body, reason: 'package_conversational' }); } catch (_) {}
src/flow.js:5863  } catch (_) {}
src/flow.js:5888  } catch (_) {}
src/flow.js:5901  } catch (_) {}
src/flow.js:5932  } catch (_) {}
src/flow.js:5947  try { funnel.logStage(chatId, 'package'); funnel.logStage(chatId, 'requirements'); } catch (_) { /* تجاهل */ }
src/flow.js:5980  } catch (_) {}
src/flow.js:6033  } catch (_) {}
src/flow.js:6072  try { funnel.logStage(chatId, 'requirements'); } catch (_) { /* تجاهل */ }
src/flow.js:6132  } catch (_) {}
src/flow.js:6445  try { funnel.logStage(chatId, 'confirm'); } catch (_) { /* تجاهل */ }
src/flow.js:6618  try { funnel.logStage(chatId, 'confirm'); } catch (_) { /* تجاهل */ }
src/flow.js:6724  } catch (_) {}
src/flow.js:6734  try { funnel.logStage(chatId, 'confirm'); } catch (_) { /* تجاهل */ }
src/flow.js:6827  } catch (_) {}
src/flow.js:6919  } catch (_) {}
src/flow.js:7032  } catch (_) {}
src/flow.js:7085  try { funnel.logStage(chatId, 'confirm'); } catch (_) { /* تجاهل */ }
src/flow.js:7206  } catch (_) {}
src/flow.js:7212  } catch (_) {}
src/flow.js:7337  } catch (_) {}
src/flow.js:7395  try { funnel.logStage(chatId, 'confirm'); } catch (_) { /* تجاهل */ }
src/flow.js:7597  } catch (_) {}
src/flow.js:7748  } catch (_) {}
src/flow.js:7899  try { funnel.logStage(chatId, 'confirm'); } catch (_) { /* تجاهل */ }
src/flow.js:7966  try { funnel.logStage(chatId, 'coupon'); } catch (_) { /* تجاهل */ }
src/flow.js:7972  try { funnel.logStage(chatId, 'confirm'); } catch (_) { /* تجاهل */ }
src/flow.js:8039  try { funnel.logStage(chatId, 'confirm'); } catch (_) { /* تجاهل */ }
src/flow.js:8060  try { funnel.logStage(chatId, 'confirm'); } catch (_) { /* تجاهل */ }
src/flow.js:8101  try { funnel.logStage(chatId, 'confirm'); } catch (_) { /* تجاهل */ }
src/flow.js:8255  } catch (_) {}
src/flow.js:8555  try { funnel.logStage(chatId, 'payment'); } catch (_) { /* تجاهل */ }
src/flow.js:8615  } catch (_) {}
src/flow.js:8799  } catch (_) {}
src/flow.js:8870  } catch (_) { /* تجاهل - التحقق يسقط على السعر الكتالوجي */ }
src/flow.js:8884  } catch (_) {}
src/flow.js:9016  } catch (_) {}
src/flow.js:9664  } catch (_) {}
src/followups.js:82  } catch (_) {}
src/followups.js:164  } catch (_) {}
src/followups.js:171  } catch (_) {}
src/followups.js:387  } catch (_) {}
src/followups.js:930  } catch (_) {}
src/followups.js:1076  } catch (_) {}
src/followups.js:1085  } catch (_) {}
src/followups.js:1112  } catch (_) {}
src/fraud_shield.js:58  } catch (_) {}
src/fraud_shield.js:238  } catch (_) {}
src/fraud_shield.js:360  } catch (_) {}
src/httpsms.js:698  } catch (_) { /* تجاهل */ }
src/openwa.js:21  } catch (_) {}
src/openwa.js:142  try { process.kill(Number(pid), 'SIGKILL'); } catch (_) {}
src/openwa.js:155  try { process.kill(num, 'SIGKILL'); } catch (_) {}
src/openwa.js:162  } catch (_) {}
src/packages.js:119  } catch (_) {}
src/packages.js:132  } catch (_) {}
src/packages.js:154  } catch (_) {}
src/packages.js:183  } catch (_) {}
src/packages.js:281  } catch (_) {}
src/packages.js:373  } catch (_) {}
src/packages.js:394  } catch (_) {}
src/packages.js:465  } catch (_) {}
src/packages.js:578  } catch (_) {}
src/payment_accounts.js:15  } catch (_) {}
src/payment_accounts.js:26  } catch (_) {}
src/payment_verifier.js:293  } catch (_) { /* تجاهل */ }
src/queue.js:77  } catch (_) {}
src/queue.js:552  try { res(); } catch (_) {}
src/queue.js:557  try { rej(err); } catch (_) {}
src/receipt_extractor.js:88  } catch (_) {}
src/receipt_extractor.js:116  try { fs.unlinkSync(tempPath); } catch (_) {}
src/receipt_extractor.js:181  } catch {}
src/receipt_extractor.js:194  } catch {}
src/receipt_extractor.js:209  try { fs.unlinkSync(tempPath); } catch (_) {}
src/red_commands.js:313  } catch (_) {}
src/red_commands.js:324  } catch (_) {}
src/red_commands.js:488  } catch (_) {}
src/red_commands.js:508  } catch (_) {}
src/red_commands.js:692  } catch (_) {}
src/red_commands.js:751  } catch (_) {}
src/red_commands.js:777  } catch (_) {}
src/red_commands.js:905  } catch (_) {}
src/replies.js:242  } catch (_) {}
src/server.js:277  } catch (_) {}
src/server.js:846  try { fs.unlinkSync(lockFile); } catch (_) {}
src/server.js:849  } catch (_) {}
src/server.js:1036  } catch (_) {}
src/server_metrics.js:35  } catch (_) {}
src/smart_analyzer.js:284  } catch (_) {}
src/smart_analyzer.js:297  } catch (_) {}
src/store.js:771  } catch (_) { /* تجاهل */ }
src/store.js:1322  } catch (_) { /* سجل قديم اختياري */ }
src/store.js:2246  try { db.close(); } catch (_) { /* تجاهل */ }
src/telecom_packer.js:568  } catch (_) {}
src/telegram_bot.js:640  } catch (_) {}
src/telegram_bot.js:739  } catch (_) {}
src/telegram_bot.js:859  } catch (_) {}
src/temp_c7_handler.js:21  } catch (_) {}
src/vodafone_api.js:153  } catch (_e) {}
src/vodafone_api.js:348  } catch (_) {}
src/vodafone_api.js:699  } catch (_) {}
src/vodafone_api.js:868  } catch (_err) {}
src/vodafone_api.js:895  } catch (_) {}
src/vodafone_api.js:992  } catch (_e) {}
src/vodafone_api.js:1077  } catch (_) {}
src/vodafone_api.js:1220  } catch (_) {}
src/vodafone_api.js:1232  } catch (_) {}
src/vodafone_api.js:1247  } catch (_) {}
src/vodafone_api.js:1340  } catch (_) {}
src/vodafone_api.js:1356  } catch (_) {}
src/vodafone_api.js:1369  } catch (_) {}
src/vodafone_api.js:2460  } catch (_) {}
src/vodafone_api.js:2720  } catch (_) {}
src/vodafone_api.js:2952  } catch (_) {}
src/vodafone_api.js:3066  } catch (_) {}
src/we_api.js:85  } catch (_) {}
src/we_api.js:450  } catch (_) {}
src/we_api.js:572  } catch (_) {}

--- catch يسجّل فقط (لا يعيد الأثر) ---
لا شيء.

--- promises معلّقة (floating) بمعالج فارغ ---
src/admin/routes/bookings.js:110  await notify.paymentConfirmed(fresh || b, { source: 'dashboard' }).catch(() => {});
src/admin/routes/bookings.js:122  .catch(() => {});
src/admin/routes/bookings.js:153  .catch(() => {});
src/admin/routes/bookings.js:304  .catch(() => {});
src/admin/routes/bookings.js:409  .catch(() => {});
src/admin/routes/bookings.js:446  notify.paymentConfirmed(fresh || b, { source: 'dashboard' }).catch(() => {});
src/admin/routes/bookings.js:497  notify.paymentConfirmed(fresh || b, { source: 'dashboard' }).catch(() => {});
src/admin/routes/bookings.js:546  notify.paymentConfirmed(fresh || b, { source: 'dashboard' }).catch(() => {});
src/admin/routes/bookings.js:606  .catch(() => {});
src/admin/routes/customers.js:710  ).catch(() => {});
src/admin/routes/customers.js:719  ).catch(() => {});
src/admin/routes/customers.js:914  openwa.sendText(chatId, msg).catch(() => {});
src/booking_admin_commands.js:949  weApi.syncWeOwnerToDb(res, password).catch(() => {});
src/digest.js:436  sendDigest(now).catch(() => {});
src/digitalcore.js:154  ⚠️ مسار مال  getAccountInfoCached().catch(() => {});
src/digitalcore.js:174  ⚠️ مسار مال  refreshCache().catch(() => {});
src/digitalcore.js:175  ⚠️ مسار مال  getAccountInfoCached().catch(() => {});
src/digitalcore.js:189  ⚠️ مسار مال  refreshCache().catch(() => {});
src/digitalcore.js:286  ⚠️ مسار مال  openwa.sendText(adminChat, alertMsg).catch(() => {});
src/flow.js:549  say(targetChat, redReply, null, { typingOpts: { skipDelay: true } }).catch(() => {});
src/flow.js:651  say(targetChat, reply, null, { typingOpts: { skipDelay: true } }).catch(() => {});
src/flow.js:666  say(targetChat, reply, null, { typingOpts: { skipDelay: true } }).catch(() => {});
src/flow.js:676  say(targetChat, reply, null, { typingOpts: { skipDelay: true } }).catch(() => {});
src/flow.js:686  say(targetChat, reply, null, { typingOpts: { skipDelay: true } }).catch(() => {});
src/flow.js:700  say(targetChat, reply, null, { typingOpts: { skipDelay: true } }).catch(() => {});
src/flow.js:710  say(targetChat, reply, null, { typingOpts: { skipDelay: true } }).catch(() => {});
src/flow.js:720  say(targetChat, reply, null, { typingOpts: { skipDelay: true } }).catch(() => {});
src/flow.js:730  say(targetChat, reply, null, { typingOpts: { skipDelay: true } }).catch(() => {});
src/flow.js:755  ).catch(() => {});
src/flow.js:766  say(targetChat, reply, null, { typingOpts: { skipDelay: true } }).catch(() => {});
src/flow.js:803  say(targetChat, '⚠️ لا توجد حجوزات مسجلة لهذا العميل لتأكيدها بالسالب.').catch(() => {});
src/flow.js:811  say(targetChat, `⚠️ الحجز *${targetBooking.id}* مؤكد ومفعل بالفعل مسبقاً.`).catch(() => {});
src/flow.js:846  ).catch(() => {});
src/flow.js:868  ).catch(() => {});
src/flow.js:896  ).catch(() => {});
src/flow.js:924  ).catch(() => {});
src/flow.js:948  ).catch(() => {});
src/flow.js:968  ).catch(() => {});
src/flow.js:989  ).catch(() => {});
src/flow.js:993  say(targetChat, getAdminGuideText()).catch(() => {});
src/flow.js:999  say(targetChat, serverMetrics.formatMetricsMessage()).catch(() => {});
src/flow.js:1020  ).catch(() => {});
src/flow.js:1049  ).catch(() => {});
src/flow.js:1051  say(targetChat, `❌ تعذر أخذ النسخة الاحتياطية: ${err.message}`).catch(() => {});
src/flow.js:1071  ).catch(() => {});
src/flow.js:1090  ).catch(() => {});
src/flow.js:1122  say(targetChat, '⚠️ لا توجد أي حجوزات مسجلة لهذا العميل لإلغائها.').catch(() => {});
src/flow.js:1129  say(targetChat, `⚠️ الحجز *${targetBooking.id}* ملغي بالفعل مسبقاً.`).catch(() => {});
src/flow.js:1161  ).catch(() => {});
src/flow.js:1185  ).catch(() => {});
src/flow.js:1196  say(targetChat, '⚠️ لا توجد حجوزات مسجلة لهذا العميل لتمديدها.').catch(() => {});
src/flow.js:1227  ).catch(() => {});
src/flow.js:2581  ).catch(() => {});
src/flow.js:3857  }).catch(() => {});
src/flow.js:3917  }).catch(() => {});
src/flow.js:4076  ).catch(() => {});
src/flow.js:4510  notifyAdmin(`🚨 *محادثة/استفسار يحتاج متابعة من العميل*\r\nالعميل: ${name} (${chatId})\r\n${body}`).catch(() => {});
src/flow.js:4564  notifyAdmin(`🔔 *رسالة من العميل*\r\n${name} (${chatId}):\r\n${body}`).catch(() => {});
src/flow.js:5174  notifyAdmin(`📱 *رقم خط مستلم من العميل للمتابعة*\r\nالعميل: ${name} (${chatId})\r\nالرقم: ${phoneCheck.phone} (${phoneC
src/flow.js:5238  notifyAdmin(`🔔 *استفسار/محادثة من العميل*\r\nالعميل: ${name} (${chatId})\r\n${body}`).catch(() => {});
src/flow.js:5764  notifyAdmin(`🔔 *استفسار من العميل في مرحلة الشبكات*\r\nالعميل: ${name} (${chatId})\r\n${body}`).catch(() => {});
src/flow.js:5860  notifyAdmin(`🔔 *استفسار من العميل في مرحلة الباقات*\r\nالعميل: ${name} (${chatId})\r\n${body}`).catch(() => {});
src/followups.js:520  .catch(() => {});
src/httpsms.js:758  .catch(() => {});
src/openwa.js:302  await setTyping(chatId, 'typing').catch(() => {});
src/openwa.js:307  setTyping(chatId, 'typing').catch(() => {});
src/openwa.js:328  if (humanize && config.typingIndicator) setTyping(chatId, 'paused').catch(() => {});
src/payment_verifier.js:420  ⚠️ مسار مال  ).catch(() => {});
src/queue.js:75  notify.notifyAdmin(alertMsg).catch(() => {});
src/queue.js:531  const prevChain = (chatChains.get(chatId) || Promise.resolve()).catch(() => {});
src/queue.js:563  const settled = currentChain.catch(() => {});
src/server.js:371  flow.notifyAdmin('✅ *تمت استعادة اتصال البوت تلقائياً*\nعادت الجلسة للعمل بعد معالجة الانقطاع.').catch(() => {});
src/server.js:409  flow.notifyAdmin('⚠️ *واتساب يطلب مسح QR*\nالجلسة تحتاج إعادة ربط. افتح داشبورد OpenWA وامسح الرمز.').catch(() => {});
src/server.js:420  flow.notifyAdmin('🚨 *تنبيه قيد من واتساب*\nتم تفعيل قاطع الدائرة وإيقاف الإرسال مؤقتاً لحماية الرقم.').catch(() => {});
src/server.js:881  drainWebhookEvents().catch(() => {});
src/server.js:1000  dc.checkLowBalanceAlert(10).catch(() => {});
src/server.js:1003  dc.checkLowBalanceAlert(10).catch(() => {});
src/server.js:1240  flow.notifyAdmin(`⛔ *عطل قاتل أوقف البوت*\n${String((err && err.message) || err).slice(0, 300)}\nأعد التشغيل من start-bo

--- الخلاصة ---
catch فارغ: 227
catch يسجّل فقط: 0
promises معلّقة: 78
منها في مسار مال: 6
  src/digitalcore.js:154
  src/digitalcore.js:174
  src/digitalcore.js:175
  src/digitalcore.js:189
  src/digitalcore.js:286
  src/payment_verifier.js:420
```

