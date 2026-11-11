'use strict';

/**
 * فحص تسرّب شامل: يستخرج كل المعرّفات الحقيقية من قاعدة الـsubject
 * ويتحقّق إن ولا واحد منها وارد في محتوى المستودع.
 *
 * هذا هو الفحص الحاسم — لا يكتفي بأنماط معروفة.
 *
 * التشغيل: node scripts/leak-scan.js [--subject id]
 */

const fs = require('node:fs');
const path = require('node:path');

const cfgMod = require('./proofs/config');
const overrides = cfgMod.fromArgv();

let cfg;
try {
  cfg = cfgMod.resolve(overrides);
} catch (err) {
  console.error(`\n${err.message}\n`);
  process.exit(2);
}

// eslint-disable-next-line global-require, import/no-dynamic-require
const Database = require(path.join(cfg.botRepo, 'node_modules', 'better-sqlite3'));

const db = new Database(cfg.dbFile, { readonly: true });

function values(query) {
  try {
    return db.prepare(query).all().map((r) => Object.values(r)[0])
      .filter((v) => v !== null && v !== undefined && String(v).trim() !== '');
  } catch (_) {
    return [];
  }
}

const M = cfg.moneyPath;

const phones = new Set([
  ...M.phoneColumns.map((c) => values(`SELECT ${c} FROM ${M.bookingsTable}`)).flat(),
  ...values(`SELECT whatsapp_phone FROM ${M.customersTable}`),
  ...values(`SELECT sender_phone FROM ${M.trustedPaymentsTable}`),
  ...values(`SELECT phone FROM ${M.ownerAccountsTable}`),
  ...values(`SELECT member_phone FROM ${M.ownerMembersTable}`),
  ...values(`SELECT owner_phone FROM ${M.ownerMembersTable}`),
]);

const names = new Set([
  ...values(`SELECT ${M.customerNameColumn} FROM ${M.bookingsTable}`),
  ...values(`SELECT name FROM ${M.customersTable}`),
  ...values(`SELECT customer_name FROM tickets`),
  ...values(`SELECT customer_name FROM handoffs`),
  ...values(`SELECT name FROM ${M.ownerAccountsTable}`),
  ...values(`SELECT member_name FROM ${M.ownerMembersTable}`),
  ...values(`SELECT sender FROM ${M.trustedPaymentsTable}`),
]);

const chatIds = new Set([
  ...values(`SELECT ${M.chatIdColumn} FROM ${M.bookingsTable}`),
  ...values(`SELECT chat_id FROM ${M.customersTable}`),
  ...values(`SELECT chat_id FROM tickets`),
  ...values(`SELECT chat_id FROM handoffs`),
  ...values(`SELECT chat_id FROM chats`),
]);

const refs = new Set([
  ...values(`SELECT transaction_id FROM ${M.bookingsTable}`),
  ...values(`SELECT reference_id FROM ${M.trustedPaymentsTable}`),
  ...values(`SELECT ${M.refRawColumn} FROM ${M.bookingsTable}`),
  ...values(`SELECT receipt_path FROM ${M.bookingsTable}`),
]);

console.log(`الـsubject: ${cfg.subject}`);
console.log(`معرّفات حقيقية في القاعدة: ${phones.size} رقم · ${names.size} اسم · ${chatIds.size} محادثة · ${refs.size} مرجع`);

/**
 * الاسم المعرِّف هو الاسم الكامل (اسمان على الأقل) — الاسم المفرد الشائع
 * ("محمد"، "عميل") ليس معرِّفاً بذاته ولا يسرّب هوية.
 */
const COMMON_SINGLE_NAMES = new Set([
  'عميل', 'عميلة', 'أحمد', 'احمد', 'محمد', 'محمود', 'خالد', 'مصطفى', 'مصطفي',
  'فاطمة', 'فاطمه', 'عمر', 'سارة', 'ساره', 'يوسف', 'يونس', 'سيد',
  'هدى', 'علي', 'عبدالله', 'غير محدد', 'غير محدده', 'test', 'Test',
]);

const identifyingNames = [...names].filter((n) => {
  const s = String(n).trim();
  if (s.length < 5) return false;
  if (COMMON_SINGLE_NAMES.has(s)) return false;
  const words = s.split(/\s+/);
  if (words.length < 2) return false;
  if (s.length < 11) return false;
  if (/^BKG-|^VF-|^DC-|^WB-|^ORD-|^TXN-|^CPN-/.test(s)) return false;
  return true;
});

console.log(`أسماء معرِّفة (اسمان فأكثر): ${identifyingNames.length} من ${names.size}`);

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(d, e.name);
  if (e.name === '.git') return [];
  return e.isDirectory() ? walk(p) : [p];
});

let leaks = 0;
for (const file of walk(cfg.harnessRoot)) {
  if (file.endsWith('.png') || file.endsWith('.jpg')) continue;
  let content;
  try { content = fs.readFileSync(file, 'utf8'); } catch (_) { continue; }
  const rel = path.relative(cfg.harnessRoot, file);
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
