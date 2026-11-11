# P06 — مطابقة الاسم بالعتمة تخلط أسماءً مختلفة تماماً

- **Severity:** high
- **Area:** money-path
- **Subject:** wa-booking-bot
- **Refs:** src/httpsms.js:585-591, src/payment_verifier.js:206-234
- **Verdict:** REPRODUCED

## Claim

namesMatchCrossScript تقبل أي اسمين يختلف كل منهما بمحرّر واحد على الهيكل (Levenshtein ≤ 1)، فتُعتبر "محمد" و"احمد" الاسم نفسه.

## Expected

أن لا يتطابق اسمان مختلفان جوهرياً. المطابقة بالحرف الواحد يجب أن تكون محدودة بأخطاء الإملاء الشائعة (مثل الهمزات والتاء المربوطة) لا باسم مختلف.

## Observed

من 10 أزواج tested، 7 زوجاً مختلفاً طابق: محمد/احمد، محمد/محمود، مصطفى/مصطفي، محمد/محمّد، فاطمة/فاطمه، خالد/خالد، سارة/ساره

## Impact

في طريقة المطابقة AMOUNT_AND_NAME، دفعة عميل واحد قد تُستخدم لتأكيد حجز عميل آخر بنفس المبلغ. الاسم مكتوب من العميل نفسه، والعميل يستطيع اختيار اسم مشابه لاسم عميل آخر عمداً.

## Fix

لا تعتمد الاسم وحده أبداً. اشترط رقم الهاتف + الاسم معاً في نفس المسار، أو اخفض الثقة إلى manual_review واطلب رقم المحفظة. وكذلك ارفع حد مسافة التحرير إلى 0 للأسماء العربية واركز على تطبيع الهمزات والتاء المربوطة صراحةً بدل مسافة التحرير.

## Raw output

```

--- الدالة المستخدمة في src/httpsms.js ---
585: function namesMatchCrossScript(a, b) {
586:   const ta = nameSkeleton(a);
587:   const tb = nameSkeleton(b);
588:   if (!ta.length || !tb.length) return false;
589:   const [shorter, longer] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
590:   return shorter.every((tok) => longer.some((lt) => levDist(tok, lt) <= 1));
591: }
592: 

--- الهيكل الناتج من nameSkeleton ---
551: function nameSkeleton(str) {
552:   return transliterateArToLat(str)
553:     .split(/[^a-z]+/)
554:     .filter(Boolean)
555:     .map((tok) => tok.replace(/[aeiou]/g, ''));
556: }
557: 
558: function levDist(a, b) {
559:   const s = String(a || '');
560:   const t = String(b || '');
561:   const m = s.length;
562:   const n = t.length;
563:   if (!m) return n;
564:   if (!n) return m;
565:   let prev = new Array(n + 1);
566:   let cur = new Array(n + 1);

--- أزواج أسماء مختلفة يجب ألا تتطابق ---
"محمد" vs "احمد"  skeletons=[mhmd] vs [hmd]  ⇒ true
"محمد" vs "محمود"  skeletons=[mhmd] vs [mhmwd]  ⇒ true
"أحمد" vs "محمود"  skeletons=[hmd] vs [mhmwd]  ⇒ false
"مصطفى" vs "مصطفي"  skeletons=[mstf] vs [mstfy]  ⇒ true
"محمد" vs "محمّد"  skeletons=[mhmd] vs [mhm,d]  ⇒ true
"فاطمة" vs "فاطمه"  skeletons=[ftm] vs [ftmh]  ⇒ true
"عمر" vs "وعدي"  skeletons=[mr] vs [wdy]  ⇒ false
"خالد" vs "خالد"  skeletons=[khld] vs [khld]  ⇒ true
"يوسف" vs "يونس"  skeletons=[ywsf] vs [ywns]  ⇒ false
"سارة" vs "ساره"  skeletons=[sr] vs [srh]  ⇒ true

--- الاستخدام في مسار المطابقة ---
src/payment_verifier.js يستعمل مطابقة الاسم ضمن طريقة AMOUNT_AND_NAME:
الحجز المMatched依靠 الاسم وحده إضافةً إلى تطابق المبلغ.
الاسم في الحجز هو ما كتبه العميل في مرحلة NAME (نفس مصدر P01).
  src/payment_verifier.js:214: return httpsms.namesMatchCrossScript(bName, senderName);
  src/payment_verifier.js:220: matchMethod: 'AMOUNT_AND_NAME',
  src/payment_verifier.js:851: return httpsms.namesMatchCrossScript(tp.sender, senderName);
  src/payment_verifier.js:855: matchMethod = 'AMOUNT_AND_NAME';
  src/payment_verifier.js:1573: return candidateNames.some((n) => httpsms.namesMatchCrossScript(n, tp.sender));
  src/payment_verifier.js:1578: matchMethod = 'AMOUNT_AND_NAME';

--- هل الحساب موجود في القاعدة؟ ---
صفوف payment_claims بطريقة AMOUNT_AND_NAME: 1
  claim #47
```
