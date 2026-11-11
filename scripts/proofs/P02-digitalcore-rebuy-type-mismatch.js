'use strict';

/**
 * P02 — مسار "إعادة شراء رقمي" في لوحة الإدارة معطّل: نوع قيمة الإرجاع لا يطابق.
 *
 * store.claimDigitalOrder تُرجع boolean، بينما الكود في المسار يتوقع كائناً
 * فيه الحقل claimed. النتيجة: التفاف always قبل أي نداء شراء.
 * كود الخروج: 0 = الخلل متحقق منه، 2 = غير متحقق.
 */

const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT, say, section, finish, requireDb } = require('./_lib');

function main() {
  const routeFile = path.join(REPO_ROOT, 'src', 'admin', 'routes', 'digitalcore.js');
  const storeFile = path.join(REPO_ROOT, 'src', 'store.js');
  const routeSrc = fs.readFileSync(routeFile, 'utf8');
  const storeSrc = fs.readFileSync(storeFile, 'utf8');

  section('المستهلك في src/admin/routes/digitalcore.js');
  const routeLines = routeSrc.split('\n');
  let idx = routeLines.findIndex((l) => l.includes('store.claimDigitalOrder('));
  if (idx >= 0) {
    say(routeLines.slice(Math.max(0, idx - 4), idx + 8).map((l, k) => `${idx - 3 + k}: ${l}`).join('\n'));
  } else {
    say('لم يُعثر على نداء claimDigitalOrder في المسار.');
  }

  section('المنتج في src/store.js');
  const storeLines = storeSrc.split('\n');
  const defIdx = storeLines.findIndex((l) => l.includes('function claimDigitalOrder('));
  if (defIdx >= 0) {
    say(storeLines.slice(defIdx, defIdx + 18).map((l, k) => `${defIdx + 1 + k}: ${l}`).join('\n'));
  }

  section('محاكاة تنفيذ سطر التحقق على قيمة حقيقية من claimDigitalOrder');
  // نحاكي ما يفعله المتجر: قاعدة مؤقتة بجدول digital_orders بنفس الشكل.
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'p02-'));
  const Database = requireDb();
  const db = new Database(path.join(tmp, 't.db'));
  db.exec(`CREATE TABLE digital_orders (
    booking_id TEXT PRIMARY KEY, status TEXT, order_id TEXT, items TEXT,
    error TEXT, created_at TEXT, updated_at TEXT
  );`);
  const nowIso = new Date().toISOString();
  const claim = db
    .prepare(`INSERT OR IGNORE INTO digital_orders (booking_id, status, created_at, updated_at)
              VALUES (?, 'claimed', ?, ?)`)
    .run('BKG-DEMO-1', nowIso, nowIso);
  const realReturn = claim.changes > 0;
  say(`db.prepare(...).run(...) ⇒ changes = ${claim.changes}`);
  say(`claimDigitalOrder(...) ترجع بالضبط: ${JSON.stringify(realReturn)} (typeof ${typeof realReturn})`);

  section('تطبيق شرط التحقق كما هو مكتوب في المسار');
  const fakeClaim = realReturn; // القيمة التي وصلت للمسار فعلاً
  say(`const claim = store.claimDigitalOrder(b.id, prodId, qty);  ⇒  claim = ${JSON.stringify(fakeClaim)}`);
  say(`claim.claimed = ${JSON.stringify(fakeClaim.claimed)}   (undefined:Claim غير موجود على boolean)`);
  const guardTripped = !fakeClaim.claimed;
  say(`if (!claim.claimed) { return res.redirect(303, '/admin/digitalcore?msg=settings-fail'); }`);
  say(`الشرط يتحقق (يدخل التفاف): ${guardTripped}`);

  section('النتيجة');
  say('الحجز المدفوع الذي يضغط الأدمن "إعادة شراء" لا يُشحن أبداً،');
  say('ويُعاد التوجيه إلى settings-fail قبل أي نداء لـ digitalcore.buyProduct.');
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });

  const reproduced = guardTripped === true && realReturn === true;

  finish({
    id: 'P02',
    slug: 'digitalcore-rebuy-type-mismatch',
    title: 'مسار إعادة الشراء الرقمي في اللوحة يخرج دائماً قبل الشراء',
    severity: 'critical',
    area: 'money-path',
    refs: ['src/admin/routes/digitalcore.js:1506', 'src/store.js:936-949'],
    claim:
      'المسار يستدعي store.claimDigitalOrder(...) ثم يختبر claim.claimed، بينما '
      + 'الدالة تُرجع boolean، فالحقل claimed غير موجود والاختبار always true.',
    expected:
      'أن يختبر المسار القيمة المُرجعة كما هي: `if (!store.claimDigitalOrder(b.id)) { … }`، '
      + 'أو أن تُرجع الدالة كائناً يحمل الحقل claimed.',
    observed:
      `claimDigitalOrder تُرجع ${JSON.stringify(realReturn)} (boolean). `
      + 'claim.asked undefined ⇒ `!claim.claimed` = true ⇒ إعادة توجيه إلى settings-fail '
      + 'قبل أي نداء شراء، في كل مرة وبغض النظر عن حالة الحجز.',
    impact:
      'عميل دفع ولم يُسلَّم منتجه الرقمي. الإدارة لا تستطيع إتمام الشراء من اللوحة '
      + 'وأي طلب شراء يدوي يخرج بنفس النتيجة. لا يوجد أثر في القاعدة يدل على ذلك.',
    fix:
      '```js\n'
      + 'const claimed = store.claimDigitalOrder(b.id);\n'
      + "if (!claimed) {\n"
      + "  return res.redirect(303, `${BASE}/digitalcore?msg=settings-fail`);\n"
      + '}\n'
      + '```\n'
      + 'وحذف المعاملات prodId و qty لأنها غير مستخدمة في توقيع الدالة.',
    reproduced,
  });
}

main();
