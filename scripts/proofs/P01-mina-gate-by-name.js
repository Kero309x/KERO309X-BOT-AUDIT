'use strict';

/**
 * P01 — بوابة "مينا رمسيس" تُفتح باسم يكتبه العميل نفسه ⇒ منتج مجاني.
 *
 * الدليل: نستخرج الدالة الفعلية من src/flow.js كما هي ونشغّلها في بيئة معزولة
 * (vm) بدل إعادة كتابة منطقها، ثم نربطها بمسار التفعيل في نفس الملف.
 * كود الخروج: 0 = الخلل متحقق منه، 2 = غير متحقق (مُصلَح).
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { REPO_ROOT, say, section, finish, openDb, pseudonym } = require('./_lib');

const FLOW = path.join(REPO_ROOT, 'src', 'flow.js');

/**
 * يستخرج نص دالة من مصدر JS.
 * ملاحظة: يجب تخطّي قائمة المعاملات أولاً، لأن قيمها الافتراضية قد تحتوي
 * أقواساً معقوفة (مثل `draft = {}`) تسبق جسم الدالة.
 */
function extractFunction(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`الدالة ${name} غير موجودة`);

  // 1) تجاوز قائمة المعاملات: ننتظر عودة عمق الأقواسParentheses إلى الصفر.
  let paren = 0;
  let bodyStart = -1;
  for (let j = src.indexOf('(', start); j < src.length; j += 1) {
    const ch = src[j];
    if (ch === '(') paren += 1;
    else if (ch === ')') {
      paren -= 1;
      if (paren === 0) {
        bodyStart = src.indexOf('{', j);
        break;
      }
    }
  }
  if (bodyStart === -1) throw new Error(`تعذّر 찾ة جسم الدالة ${name}`);

  // 2) مطابقة الأقواس المعقوفة من جسم الدالة حتى الإغلاق.
  let depth = 0;
  for (let j = bodyStart; j < src.length; j += 1) {
    if (src[j] === '{') depth += 1;
    else if (src[j] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(start, j + 1);
    }
  }
  throw new Error(`تعذّر إغلاق الدالة ${name}`);
}

function main() {
  const src = fs.readFileSync(FLOW, 'utf8');
  const fnText = extractFunction(src, 'isMinaRamses');

  section('الدالة الفعلية من src/flow.js (كما تُشحن)');
  say(fnText);

  // تشغيل الدالة المستخرجة فعليًا في بيئة معزولة.
  // customers.get يُربّى على سجل فارغ: لا يوجد عميل بهذا المعرّف.
  const sandbox = {
    customers: { get: () => null },
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(`${fnText}\nthis.__isMinaRamses = isMinaRamses;`, sandbox);
  const isMinaRamses = sandbox.__isMinaRamses;

  const ATTACKER_CHAT = '201099999999@c.us';

  section('الحالة 1 — عميل عادي يكتب اسمه');
  const normalName = 'أحمد حسن';
  const normalResult = isMinaRamses(ATTACKER_CHAT, { customerName: normalName }, normalName);
  say(`draft.customerName = ${JSON.stringify(normalName)}`);
  say(`isMinaRamses(...) => ${normalResult}`);

  section('الحالة 2 — عميل يكتب الاسم الذي يفتح البوابة');
  const attackNames = ['mina ramses', 'Mina Ramsis', 'mina  ramses', 'مينا رمسيس'];
  let opened = false;
  for (const n of attackNames) {
    const r = isMinaRamses(ATTACKER_CHAT, { customerName: n }, n);
    say(`draft.customerName = ${JSON.stringify(n)}  =>  ${r}`);
    if (r) opened = true;
  }

  section('الحالة 3 — الحقل الذي يمرره العميل فعليًا');
  say('draft.customerName مصدره: state NAME — العميل يكتب الاسم بنفسه.');
  say('-flow.js:6483 → draft.customerName = raw');
  say('  (الاسم يُخزَّن في جدول chats كـ draft JSON، ثم يُقرأ لاحقًا في isMinaRamses)');

  section('الحالة 4 — مسار التفعيل الذي يتبع البوابة');
  const callSites = [];
  const lines = src.split('\n');
  lines.forEach((l, i) => {
    if (l.includes('isMinaRamses(chatId')) callSites.push(`flow.js:${i + 1}: ${l.trim()}`);
  });
  callSites.forEach((c) => say(c));

  const freeGate = lines.findIndex((l) => l.includes('markPaymentVerified(booking.id') && l.includes('FREE_MINA'));
  section('الحالة 5 — ما الذي يحدث بعد فتح البوابة');
  if (freeGate >= 0) {
    const window = lines.slice(freeGate, freeGate + 12).join('\n');
    say(window);
  }

  section('الحالة 6 — الدليل من القاعدة الحقيقية (أرقام منقّاة)');
  try {
    const db = openDb();
    const cols = db.prepare('PRAGMA table_info(bookings)').all().map((c) => c.name);
    const hasRef = cols.includes('sms_ref_id');
    const hasProv = cols.includes('sms_provider');
    say(`bookings.sms_ref_id موجود: ${hasRef}`);
    say(`bookings.sms_provider موجود: ${hasProv}`);
    if (hasRef) {
      const rows = db
        .prepare("SELECT id, chat_id, sms_ref_id, sms_provider, payment_amount, status FROM bookings WHERE sms_ref_id LIKE 'MINA_%' OR transaction_id LIKE 'FREE_MINA_%'")
        .all();
      say(`حجوزات بوابة المينا في القاعدة: ${rows.length}`);
      for (const r of rows) {
        say(
          `  ${pseudonym('BKG', r.id)}  chat=${pseudonym('CHAT', r.chat_id)}  `
          + `ref=${r.sms_ref_id}  amount=${r.payment_amount}  status=${r.status}`,
        );
      }
    }
    if (hasProv) {
      const provRows = db
        .prepare("SELECT id, sms_provider, status FROM bookings WHERE sms_provider LIKE '%رمسيس%' OR sms_provider LIKE '%special%'")
        .all();
      say(`حجوزات بدالة مزوّد "تسجيل خاص": ${provRows.length}`);
      for (const r of provRows) {
        say(`  ${pseudonym('BKG', r.id)}  status=${r.status}  provider=${r.sms_provider}`);
      }
    }
  } catch (err) {
    say(`تعذّرت قراءة القاعدة: ${err.message}`);
  }

  const reproduced = opened && normalResult === false;

  finish({
    id: 'P01',
    slug: 'mina-gate-by-name',
    title: 'بوابة التفعيل الخاص تُفتح باسم يكتبه العميل نفسه',
    severity: 'critical',
    area: 'money-path',
    refs: ['src/flow.js:376-397', 'src/flow.js:6442', 'src/flow.js:8373-8380', 'src/bookings.js:715-745'],
    claim:
      'الدالة isMinaRamses في src/flow.js تُرجع true عندما يطابق الاسم أي نص يطابق '
      + '/mina\\s*ramsis|mina\\s*ramses/i، والاسم حقل يكتبه العميل في مرحلة NAME. '
      + 'بعدها يمرّر الكود الحجز إلى markPaymentVerified بمبلغ 0 فيتحوّل إلى paid مع smsVerified=true.',
    expected:
      'أن تكون البوابة مربوطة بمعرّف المحادثة أو برقم الهاتف المسجّل فقط، '
      + 'ولا تُفتح أبداً بمجرد كتابة العميل لاسمه.',
    observed:
      `عميل بمعرّف محادثة جديد (${ATTACKER_CHAT}) يكتب "mina ramses" في حقل الاسم ⇒ `
      + 'isMinaRamses => true، والحجز ينتقل إلى markPaymentVerified({ amount: 0 }) '
      + 'فتصبح حالته paid مع smsVerified=true ومعالجة المنتج الرقمي تُنفَّذ.',
    impact:
      'أي زائر يستطيع الحصول على منتج رقمي مجاناً بمجرد كتابة اسمين في حقل الاسم. '
      + 'الأثر ينتقل مباشرة إلى المسار المالي: المنتج يُشحن بدون دفعة، مع تسجيل sms_verified=true '
      + 'ما يفسد أي إحصاء للإيراد لاحقاً.',
    fix:
      'اربط البوابة بمعرّف المحادثة/الهاتف فقط واحذف فحص الاسم:\n'
      + '```js\n'
      + "const MINA_CHAT_IDS = new Set(['161276441411718@lid']);\n"
      + "const MINA_PHONES = new Set(['01289086556']);\n"
      + 'function isMinaRamses(chatId, draft = {}) {\n'
      + "  const id = String(chatId || '');\n"
      + '  if (MINA_CHAT_IDS.has(id)) return true;\n'
      + "  const phones = `${draft.phone || ''} ${draft.whatsappPhone || ''}`;\n"
      + '  return [...MINA_PHONES].some((p) => phones.includes(p));\n'
      + '}\n'
      + '```',
    reproduced,
  });
}

main();
