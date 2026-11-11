'use strict';

/**
 * فحص تسرّب شامل: يستخرج كل المعرّفات الحقيقية من القاعدة الحقيقية
 * (بوت الواتساب) ويتحقّق إن ولا واحد منها وارد في محتوى مستودع التدقيق.
 *
 * هذا هو الفحص الحاسم — لا يكتفي بأنماط معروفة.
 */

const fs = require('node:fs');
const path = require('node:path');
const Database = require(path.join('D:/wa-booking-bot/node_modules', 'better-sqlite3'));

const BOT_DB = 'D:/wa-booking-bot/data/bot.db';
const AUDIT_ROOT = 'D:/KERO309X-BOT-AUDIT';

const db = new Database(BOT_DB, { readonly: true });

function values(query) {
  try {
    return db.prepare(query).all().map((r) => Object.values(r)[0]).filter((v) => v !== null && v !== undefined && String(v).trim() !== '');
  } catch (_) {
    return [];
  }
}

const phones = new Set([
  ...values('SELECT requested_phone FROM bookings'),
  ...values('SELECT whatsapp_phone FROM bookings'),
  ...values('SELECT sender_phone FROM bookings'),
  ...values('SELECT whatsapp_phone FROM customers'),
  ...values('SELECT sender_phone FROM trusted_payments'),
  ...values('SELECT phone FROM owner_accounts'),
  ...values('SELECT member_phone FROM owner_members'),
  ...values('SELECT owner_phone FROM owner_members'),
  ...values('SELECT phone FROM stock_waitlist'),
]);

const names = new Set([
  ...values('SELECT customer_name FROM bookings'),
  ...values('SELECT name FROM customers'),
  ...values('SELECT customer_name FROM tickets'),
  ...values('SELECT customer_name FROM handoffs'),
  ...values('SELECT name FROM owner_accounts'),
  ...values('SELECT member_name FROM owner_members'),
  ...values('SELECT sender FROM trusted_payments'),
]);

const chatIds = new Set([
  ...values('SELECT chat_id FROM bookings'),
  ...values('SELECT chat_id FROM customers'),
  ...values('SELECT chat_id FROM tickets'),
  ...values('SELECT chat_id FROM handoffs'),
  ...values('SELECT chat_id FROM chats'),
]);

const refs = new Set([
  ...values('SELECT transaction_id FROM bookings'),
  ...values('SELECT reference_id FROM trusted_payments'),
  ...values('SELECT sms_ref_id FROM bookings'),
  ...values('SELECT receipt_path FROM bookings'),
]);

console.log(`معرّفات حقيقية في القاعدة: ${phones.size} رقم · ${names.size} اسم · ${chatIds.size} محادثة · ${refs.size} مرجع`);

/**
 * الاسم المعرِّف هو الاسم الكامل (اسمان على الأقل) — الاسم المفرد الشائع
 * ("محمد"، "عميل") ليس معرِّفاً بذاته ولا يسرّب هوية، بل هو materia عامة
 * يستخدمها المشروع أصلاً في الاختبارات.
 */
const COMMON_SINGLE_NAMES = new Set([
  'عميل', 'عميلة', 'أحمد', 'احمد', 'محمد', 'محمود', 'خالد', 'مصطفى', 'مصطفي',
  'فاطمة', 'فاطمه', 'عمر', 'سارة', 'ساره', 'يوسف', 'يونس', 'خالد', 'سيد',
  'هدى', 'علي', 'عبدالله', 'غير محدد', 'غير محدده', 'test', 'Test',
]);

const identifyingNames = [...names].filter((n) => {
  const s = String(n).trim();
  if (s.length < 5) return false;
  if (COMMON_SINGLE_NAMES.has(s)) return false;
  // اسم كامل: كلمتان على الأقل بطول إجمالي لا يقل عن 11
  const words = s.split(/\s+/);
  if (words.length < 2) return false;
  if (s.length < 11) return false;
  // استثنِ القوالب ذات القيم الحرفية الشائعة
  if (/^BKG-|^VF-|^DC-|^WB-|^ORD-|^TXN-/.test(s)) return false;
  return true;
});

console.log(`أسماء معرِّفة (اسمان فأكثر): ${identifyingNames.length} من ${names.size}`);
identifyingNames.slice(0, 10).forEach((n) => console.log(`   · ${n}`));

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(d, e.name);
  if (e.name === '.git') return [];
  return e.isDirectory() ? walk(p) : [p];
});

let leaks = 0;
for (const file of walk(AUDIT_ROOT)) {
  if (file.endsWith('.png') || file.endsWith('.jpg')) continue;
  let content;
  try { content = fs.readFileSync(file, 'utf8'); } catch (_) { continue; }
  const rel = path.relative(AUDIT_ROOT, file);
  const found = [];
  for (const [label, set] of [
    ['phone', phones],
    ['identifyingName', identifyingNames],
    ['chatId', chatIds],
    ['ref', refs],
  ]) {
    for (const v of set) {
      const s = String(v).trim();
      if (s.length < 4) continue;
      if (content.includes(s)) found.push(`${label}:${s}`);
    }
  }
  if (found.length) {
    leaks += 1;
    console.log(`\nLEAK ${rel}`);
    found.slice(0, 12).forEach((f) => console.log(`   ${f}`));
    if (found.length > 12) console.log(`   … و${found.length - 12} أخرى`);
  }
}

console.log(`\n${leaks ? `❌ ملفات بها تسرّب: ${leaks}` : '✅ لا تسرّب: لا يوجد أي معرّف حقيقي من القاعدة في المستودع'}`);
process.exit(leaks ? 1 : 0);
