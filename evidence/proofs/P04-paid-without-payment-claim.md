# P04 — حجوزات مدفوعة بلا صف payment_claims يربطها بالدفعة

- **Severity:** high
- **Area:** money-path
- **Refs:** src/bookings.js:715-773, src/store.js:1511-1640, src/httpsms.js:727
- **Verdict:** REPRODUCED

## Claim

كل حجز حالته paid مع sms_verified=1 يجب أن يكون له صف واحد في payment_claims يربطه بـ trusted_payment_id. عدد من الحجوزات المدفوعة لا تلتزم بذلك.

## Expected

أن يمرّ كل تأكيد دفع — بلا استثناء — عبر store.claimPaymentAtomically، فتُنشأ المطالبة داخل المعاملة نفسها.

## Observed

حجوزات مدفوعة بلا payment_claims: 18. دفعات claimed بلا payment_claims: 3. حجوزات مدفوعة بلا sms_ref_norm: 0 (0 حالياً). توزيع الـ18 بلا مطالبة حسب المزوّد (مُقنَّع): م*** (م*** ر***)=13، B*** M*** (I***)=5.

## Impact

الدفعات المتحرّرة من سجل المطالبة لا يستطيع النظام منع إعادة صرفها. كما أن أي إحصاء يعتمد على payment_claims (عدد الحجوزات الموثّقة) أقل من الواقع، والتسوية البنكية المبنية على هذا السجل غير مكتملة.

## Fix

اجعل bookings.markPaymentVerified غلافاً داخلياً لـ store.claimPaymentAtomically، أو—at الأقل—让它 ينشئ صف payment_claims داخل نفس المعاملة ويعلّم trusted_payments.status=claimed. أضف اختباراً يفرض: كل حجز sms_verified=1 له صف payment_claims واحد بالضبط.

## Raw output

```

--- أعمدة payment_claims ---
id, booking_id, trusted_payment_id, claimed_at, claimed_amount, match_method, evidence

--- الفهارس الفريدة التي تحمي الصرف المزدوج ---
  sqlite_autoindex_payment_claims_1: null
  sqlite_autoindex_payment_claims_2: null
  idx_payment_claims_booking: CREATE UNIQUE INDEX idx_payment_claims_booking ON payment_claims(booking_id)
  idx_payment_claims_tp: CREATE UNIQUE INDEX idx_payment_claims_tp ON payment_claims(trusted_payment_id)

--- الحاجز 1 — حجوزات status=paid و sms_verified=1 بلا صف payment_claims ---
عدد الحجوزات المدفوعة بالمطابقة: 53
منها بلا صف payment_claims: 18
  BKG-137d4fb4  chat=CHAT-2f25a24b  amount=750  provider=م*** (م*** ر***)  txn=TXN-d7f94889
  BKG-678fc791  chat=CHAT-14cca865  amount=330  provider=B*** M*** (I***)  txn=TXN-16924bf4
  BKG-ed37a21b  chat=CHAT-2f25a24b  amount=750  provider=م*** (م*** ر***)  txn=TXN-2ed3c613
  BKG-82fe6e51  chat=CHAT-2f25a24b  amount=300  provider=م*** (م*** ر***)  txn=TXN-df425a80
  BKG-6e195f5f  chat=CHAT-2f25a24b  amount=250  provider=م*** (م*** ر***)  txn=TXN-e709bd3c
  BKG-017683df  chat=CHAT-2f25a24b  amount=150  provider=م*** (م*** ر***)  txn=TXN-3f322a18
  BKG-c52dcab1  chat=CHAT-2f25a24b  amount=300  provider=م*** (م*** ر***)  txn=TXN-00001691
  BKG-ac397bd6  chat=CHAT-2f25a24b  amount=300  provider=م*** (م*** ر***)  txn=TXN-aa26d706
  BKG-10597d17  chat=CHAT-4d5b84e3  amount=330  provider=B*** M*** (I***)  txn=TXN-88252c3a
  BKG-ad74981b  chat=CHAT-2f25a24b  amount=300  provider=م*** (م*** ر***)  txn=TXN-e6a5c6c3
  BKG-5db90a93  chat=CHAT-2f25a24b  amount=1000  provider=م*** (م*** ر***)  txn=TXN-7c972370
  BKG-066346d9  chat=CHAT-2f25a24b  amount=750  provider=م*** (م*** ر***)  txn=TXN-44eb9ac7
  BKG-e2851d37  chat=CHAT-2f25a24b  amount=500  provider=م*** (م*** ر***)  txn=TXN-e39fb594
  BKG-ff99d4c0  chat=CHAT-2f25a24b  amount=300  provider=م*** (م*** ر***)  txn=TXN-afc8dd3d
  BKG-46811204  chat=CHAT-2f25a24b  amount=500  provider=م*** (م*** ر***)  txn=TXN-4a6831aa
  … و3 صفاً آخر

--- الحاجز 2 — دفعات trusted_payments بحالة claimed بلا صف payment_claims ---
عدد الدفعات المعلّمة claimed: 64
منها بلا صف payment_claims: 3
  TP-6b86b273  amount=250  provider=Vodafone Cash  ref=REF-8fec0223
  TP-2ac878b0  amount=180  provider=Vodafone Cash  ref=REF-15865cb7
  TP-cba28b89  amount=280  provider=Banque Misr (InstaPay)  ref=REF-2a5a7334

--- الحاجز 3 — من أين تأتي هذه الفجوة ---
bookings.markPaymentVerified (src/bookings.js:715) تكتب status=paid و sms_verified=1
مباشرة عبر updateBooking، ولا تمرّ على store.claimPaymentAtomically.
لذلك لا يُنشأ صف في payment_claims ولا يُعلَّم trusted_payments.status=claimed.
النتيجة: الحجز "مدفوع" لكن لا يوجد سجل يربطه بدفعة — أي لا يستطيع
النظام أن يمنع إعادة استخدام نفس الدفعة على حجز آخر عبر هذا المسار.

--- هل الفهارس الفريدة تغطّي الفجوة؟ ---
تكرار في bookings.sms_ref_norm: 0
تكرار في bookings.sms_ref_id: 0
حجوزات مدفوعة بلا مرجع مطبّع (sms_ref_norm فارغ): 0
الفهرس الفريد على sms_ref_norm هو الحماية الوحيدة المتبقية لهذه الحجوزات.
الحماية الآن سليمة (0 تكرار)، لكنها هشّة: أي مسار تأكيد جديد لا يكتب مرجعاً
مطبّعاً يفتح الصرف المزدوج من جديد دون أي خطأ ظاهر.

--- تأييد متقاطع مع P01 ---
  provider="م*** (م*** ر***)" ⇒ 13 حجز بلا مطالبة
  provider="B*** M*** (I***)" ⇒ 5 حجز بلا مطالبة
```
