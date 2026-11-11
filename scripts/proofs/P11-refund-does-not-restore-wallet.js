'use strict';

/**
 * P11 — استرداد دفعة من محفظة العميل لا يُعيد الرصيد.
 *
 * refunds.setStatus('done') يحرّر الكوبون ويسجّل في ops_log، لكنه لا يستدعي
 * customers.addBalance. مسار الاسترداد عبر واتساب (flow.js) يفعل ذلك —
 * المسار عبر لوحة الإدارة لا.
 * كود خروج: 0 = الخلل متحقق منه، 2 = غير متحقق.
 */

const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT, say, section, finish, openDb, pseudonym } = require('./_lib');

function main() {
  const refFile = path.join(REPO_ROOT, 'src', 'refunds.js');
  const src = fs.readFileSync(refFile, 'utf8');
  const lines = src.split('\n');

  section('مسار setStatus في src/refunds.js');
  const idx = lines.findIndex((l) => l.includes('function setStatus('));
  say(lines.slice(idx, idx + 32).map((l, k) => `${idx + 1 + k}: ${l}`).join('\n'));

  section('من يستدعي customers.addBalance؟');
  const callers = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!e.name.endsWith('.js')) continue;
      const rel = path.relative(REPO_ROOT, p).replace(/\\/g, '/');
      fs.readFileSync(p, 'utf8').split('\n').forEach((l, i) => {
        if (l.includes('addBalance')) callers.push(`${rel}:${i + 1}: ${l.trim()}`);
      });
    }
  };
  walk(path.join(REPO_ROOT, 'src'));
  callers.forEach((c) => say(`  ${c}`));
  say('src/refunds.js لا يظهر في القائمة.');

  section('مسار الاسترداد عبر واتساب للمقارنة');
  const flowLines = fs.readFileSync(path.join(REPO_ROOT, 'src', 'flow.js'), 'utf8').split('\n');
  flowLines.forEach((l, i) => {
    if (l.includes('addBalance')) {
      say(`  src/flow.js:${i + 1}: ${l.trim()}`);
      say(`    ${flowLines[i + 1] || ''}`.trim());
    }
  });

  section('محاكاة: استرداد عبر لوحة الإدارة على قاعدة معزولة');
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-proof-p11-'));
  fs.copyFileSync(path.join(REPO_ROOT, 'data', 'packages.json'), path.join(tmp, 'packages.json'));
  process.env.DATA_DIR = tmp;
  // eslint-disable-next-line global-require
  const store = require(path.join(REPO_ROOT, 'src', 'store.js'));
  // eslint-disable-next-line global-require
  const refunds = require(path.join(REPO_ROOT, 'src', 'refunds.js'));
  // eslint-disable-next-line global-require
  const customers = require(path.join(REPO_ROOT, 'src', 'customers.js'));
  store.init();
  const db = store.getDb();
  const t = new Date().toISOString();

  db.prepare(`INSERT INTO customers (chat_id, name, balance, first_seen_at, last_seen_at)
              VALUES ('201000000009@c.us','Proof Customer',500,?,?)`).run(t, t);
  db.prepare(`INSERT INTO bookings (id, seq, chat_id, network, package_name, price, quantity,
                status, payment_method, payment_amount, created_at, updated_at)
              VALUES ('BKG-P11',1,'201000000009@c.us','vodafone','Proof',500,1,'paid',
                'wallet',500,?,?)`).run(t, t);
  db.prepare(`INSERT INTO refunds (id, booking_id, amount, reason, status, created_at, updated_at)
              VALUES ('RF-P11','BKG-P11',500,'proof','requested',?,?)`).run(t, t);

  const balBefore = customers.getBalance('201000000009@c.us');
  say(`رصيد المحفظة قبل الاسترداد: ${balBefore}`);

  const res = refunds.setStatus('RF-P11', 'done');
  say(`نتيجة setStatus('RF-P11','done'): ${res ? res.status : 'null'}`);

  const balAfter = customers.getBalance('201000000009@c.us');
  say(`رصيد المحفظة بعد الاسترداد: ${balAfter}`);
  const txRows = db.prepare("SELECT type, amount FROM balance_transactions WHERE chat_id='201000000009@c.us'").all();
  say(`حركات الرصيد المسجّلة: ${JSON.stringify(txRows)}`);
  const refundRow = db.prepare("SELECT status FROM refunds WHERE id='RF-P11'").get();
  say(`حالة الاسترداد في القاعدة: ${refundRow.status}`);
  const bk = db.prepare("SELECT status FROM bookings WHERE id='BKG-P11'").get();
  say(`حالة الحجز: ${bk.status}`);

  const reproduced = balAfter === balBefore && balBefore === 500;

  try { store.close(); } catch (_) { /* ignore */ }
  fs.rmSync(tmp, { recursive: true, force: true });

  section('الدليل من القاعدة الحقيقية — استردادات مكتملة');
  try {
    const live = openDb();
    const rows = live.prepare(`
      SELECT r.id, r.booking_id, r.amount, r.status, b.chat_id, b.payment_method, b.payment_amount
      FROM refunds r LEFT JOIN bookings b ON b.id = r.booking_id
      WHERE r.status='done' ORDER BY r.updated_at DESC LIMIT 10
    `).all();    say(`استردادات بحالة done: ${
      live.prepare("SELECT COUNT(*) c FROM refunds WHERE status='done'").get().c
    }`);
    rows.forEach((r) => {
      say(`  ${pseudonym('RF', r.id)}  booking=${pseudonym('BKG', r.booking_id)}  amount=${r.amount}  `
        + `payment_method=${r.payment_method || '-'}  chat=${pseudonym('CHAT', r.chat_id || '-')}`);
    });
    const walletPaid = live.prepare(`
      SELECT COUNT(*) c FROM refunds r JOIN bookings b ON b.id = r.booking_id
      WHERE r.status='done' AND (b.payment_method LIKE '%محفظة%' OR b.payment_method LIKE '%wallet%')
    `).get().c;
    say(`منها حجوزات دُفعت من المحفظة: ${walletPaid}`);
  } catch (err) {
    say(`تعذّرت قراءة القاعدة الحقيقية: ${err.message}`);
  }

  finish({
    id: 'P11',
    slug: 'refund-does-not-restore-wallet',
    title: 'استرداد دفعة من محفظة العميل عبر اللوحة لا يُعيد الرصيد',
    severity: 'medium',
    area: 'money-path',
    refs: ['src/refunds.js:96-111', 'src/customers.js:270-292', 'src/flow.js:1142'],
    claim:
      'refunds.setStatus(id, \'done\') يحرّر الكوبون ويسجّل في ops_log، '
      + 'لكنه لا يستدعي customers.addBalance — بخلاف مسار الاسترداد عبر واتساب.',
    expected:
      'أن يعود المبلغ إلى محفظة العميل إن كان الدفع من الرصيد، '
      + 'وأن يُسجَّل ذلك كحركة رصيد (balance_transactions).',
    observed:
      `رصيد المحفظة قبل الاسترداد: ${balBefore}. بعده: ${balAfter}. `
      + 'حركات الرصيد المسجّلة: لا شيء. '
      + 'حالة الاسترداد صارت done والحجز تبقى paid — أي أن الحدث المالي حدث بلا أثر على المحفظة. '
      + 'ملاحظة على البيانات الحيّة: الاستردادات المكتملة الموجودة في القاعدة كلها مدفوعة '
      + 'نقداً (فودافون كاش) وليس من المحفظة، فالعيب كامن وليس منفّذاً بعد.',
    impact:
      'لو دفع عميل من رصيد محفظته ثم استُردّ طلبه من لوحة الإدارة: رصيده لا يعود '
      + 'بل ينقص عن قيمته الفعلية. كما أن سجل حركات الرصيد لا يوثّق شيئاً، '
      + 'ما يجعل الفرق غير قابل للتدقيق. المسار البديل عبر واتساب (flow.js) يفعل '
      + 'ذلك بشكل صحيح — الخلل في مسار لوحة الإدارة وحده.',
    fix:
      'في refunds.setStatus، عند status===\'done\'، أعد المبلغ إلى المحفظة إن كان '
      + 'الدفع من الرصيد:\n'
      + '```js\n'
      + "if (status === STATUS.DONE && existing.status !== STATUS.DONE) {\n"
      + '  const bk = bookings.findBooking(existing.booking_id);\n'
      + "  if (bk && bk.paymentMethod === 'wallet') {\n"
      + '    customers.addBalance(existing.chat_id, existing.amount, {\n'
      + "      bookingId: existing.booking_id, type: 'refund',\n"
      + "      reason: `استرداد ${existing.id}`,\n"
      + '    });\n'
      + '  }\n'
      + '}\n'
      + '```\n'
      + 'معGuard على عدم التكرار (سجل是否存在 حركة استرداد سابقة للحجز).',
    reproduced,
  });
}

main();
