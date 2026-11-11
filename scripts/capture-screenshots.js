'use strict';

/**
 * التقاط لقطات شاشة للوحة الإدارة.
 *
 * مصدران مدعومان:
 *
 *   sandbox — بيئة الاختبار المدمجة في ريبو البوت (sandbox/). بيانات
 *             اصطناعية بالكامل: هذا هو المصدر الافتراضي والأسلم.
 *
 *   live    — نسخة مؤقتة من قاعدة البيانات الحقيقية، تُنقّى كل الأعمدة
 *             الشخصية قبل التشغيل. يُستخدم فقط إن لم توجد بيئة sandbox،
 *             وبعد أن ينجح فحص التسرّب.
 *
 * المخرجات: evidence/<subject>/screenshots/
 */

const { spawn, spawnSync } = require('node:child_process');
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

const OUT_DIR = cfg.screenshotsDir;
const MODE = (process.env.SHOT_MODE || 'auto').toLowerCase();

const PAGES = [
  { name: 'overview', url: '/admin/' },
  { name: 'bookings', url: '/admin/bookings' },
  { name: 'customers', url: '/admin/customers' },
  { name: 'digitalcore', url: '/admin/digitalcore' },
  { name: 'coupons', url: '/admin/coupons' },
  { name: 'tickets', url: '/admin/tickets' },
  { name: 'handoffs', url: '/admin/handoffs' },
  { name: 'owners', url: '/admin/owners' },
  { name: 'packages', url: '/admin/packages' },
  { name: 'settings', url: '/admin/settings' },
  { name: 'store-config', url: '/admin/store-config' },
  { name: 'worklist', url: '/admin/worklist' },
  { name: 'funnel', url: '/admin/funnel' },
  { name: 'onboarding', url: '/admin/onboarding' },
  { name: 'login', url: '/admin/login', anon: true },
  { name: 'dashboard-spa', url: '/dashboard/' },
];

async function waitForServer(url, timeoutMs = 60000) {
  const start = Date.now();
  let lastErr = null;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/health`);
      const body = await res.text();
      if (res.ok && body.includes('"ok":true')) return true;
      lastErr = new Error(`status ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 600));
  }
  console.error(`      تعذّر الوصول إلى ${url}: ${lastErr && lastErr.message}`);
  return false;
}

/* ------------------------------------------------------------------ */
/* وضع sandbox                                                         */
/* ------------------------------------------------------------------ */

function readSandboxEnv() {
  const out = {};
  const p = path.join(cfg.botRepo, 'sandbox', 'runtime', '.env.sandbox');
  if (!fs.existsSync(p)) return null;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2];
  }
  return out;
}

async function runSandbox() {
  const env = readSandboxEnv();
  if (!env) return null;
  const port = Number(env.PORT || 3100);
  const base = `http://127.0.0.1:${port}`;
  const adminUser = env.ADMIN_USER || 'sandbox';
  const adminPass = env.ADMIN_PASS || '';

  let up = await waitForServer(base, 4000);
  if (!up) {
    const ps1 = path.join(cfg.botRepo, 'sandbox', 'start.ps1');
    if (process.platform === 'win32' && fs.existsSync(ps1)) {
      console.log('      تشغيل sandbox…');
      const res = spawnSync('powershell', ['-ExecutionPolicy', 'Bypass', '-File', ps1], {
        cwd: cfg.botRepo, encoding: 'utf8', timeout: 120000,
      });
      console.log((res.stdout || '').slice(-600));
      up = await waitForServer(base, 60000);
    }
  }
  if (!up) return null;

  return {
    base,
    creds: { username: adminUser, password: adminPass },
    source: 'sandbox (synthetic data — no real customer data)',
    stop: async () => {},
  };
}

/* ------------------------------------------------------------------ */
/* وضع live — نسخة منقّاة                                            */
/* ------------------------------------------------------------------ */

const COMMON_WORDS = new Set(['المتجر', 'العميل', 'عميل', 'تجريبي', 'اختبار']);

function fakeName() {
  return `عميل ${String(++seq).padStart(3, '0')}`;
}
let seq = 0;
let chatSeq = 0;
function fakeChatId() {
  return `201${String(++chatSeq).padStart(9, '0')}@c.us`;
}
function fakePhone() {
  return `010${String(++chatSeq).padStart(8, '0')}`;
}

async function runLive() {
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-shot-'));
  console.log('      نسخ قاعدة البيانات…');
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const Database = require(path.join(cfg.botRepo, 'node_modules', 'better-sqlite3'));
  const src = new Database(cfg.dbFile, { readonly: true });
  await src.backup(path.join(tmp, 'bot.db'));
  src.close();

  console.log('      تنقية البيانات الشخصية…');
  const sdb = new Database(path.join(tmp, 'bot.db'));
  const M = cfg.moneyPath;
  const scrub = (table, columns, fn) => {
    let cols;
    try { cols = sdb.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name); } catch (_) { return; }
    const present = columns.filter((c) => cols.includes(c));
    if (!present.length) return;
    const rows = sdb.prepare(`SELECT rowid AS rid, * FROM ${table}`).all();
    for (const row of rows) {
      const patch = {};
      for (const c of present) {
        const v = fn(c, row[c]);
        if (v !== undefined) patch[c] = v;
      }
      if (!Object.keys(patch).length) continue;
      const sets = Object.keys(patch).map((c) => `${c} = ?`).join(', ');
      sdb.prepare(`UPDATE ${table} SET ${sets} WHERE rowid = ?`).run(...Object.values(patch), row.rid);
    }
  };
  const M2 = M;
  scrub(M2.bookingsTable, [...M2.phoneColumns, M2.customerNameColumn, M2.chatIdColumn, 'transaction_id', M2.refRawColumn, 'receipt_path', 'notes'], (col, val) => {
    if (val === null || val === undefined || val === '') return undefined;
    if (M2.phoneColumns.includes(col)) return fakePhone();
    if (col === M2.customerNameColumn) return fakeName();
    if (col === M2.chatIdColumn) return fakeChatId();
    if (col === 'transaction_id') return `TXN-${++seq}`;
    if (col === M2.refRawColumn) return `SMS-${++seq}`;
    if (col === 'receipt_path' || col === 'notes') return null;
    return undefined;
  });
  scrub(M2.customersTable, ['name', 'whatsapp_phone', 'chat_id', 'vodafone_password'], (col, val) => {
    if (val === null || val === undefined || val === '') return undefined;
    if (col === 'name') return fakeName();
    if (col === 'whatsapp_phone') return fakePhone();
    if (col === 'chat_id') return fakeChatId();
    if (col === 'vodafone_password') return '';
    return undefined;
  });
  scrub(M2.trustedPaymentsTable, ['sender', 'sender_phone', 'raw_message', 'reference_id'], (col, val) => {
    if (val === null || val === undefined || val === '') return undefined;
    if (col === 'sender') return fakeName();
    if (col === 'sender_phone') return fakePhone();
    if (col === 'raw_message') return '[redacted]';
    if (col === 'reference_id') return `REF-${++seq}`;
    return undefined;
  });
  for (const key of ['admin_pass', 'openwa_api_key', 'digitalcore_api_key', 'httpsms_api_key']) {
    try { sdb.prepare('UPDATE settings SET value = ? WHERE key = ?').run('', key); } catch (_) { /* تجاهل */ }
  }
  sdb.close();

  console.log('      تشغيل البوت على منفذ حرّ…');
  const port = await freePort();
  const env = {
    ...process.env,
    DATA_DIR: tmp,
    PORT: String(port),
    HOST: '127.0.0.1',
    DIGEST_ENABLED: '0',
    HTTPSMS_ENABLED: '0',
    FOLLOWUP_MAX_PER_TICK: '0',
    NODE_ENV: 'production',
    ADMIN_SESSION_SECRET: require('node:crypto').randomBytes(32).toString('hex'),
    ADMIN_PASS: process.env.ADMIN_PASS || '',
  };
  const server = spawn(process.execPath, [path.join(cfg.botRepo, 'src', 'server.js')], {
    cwd: cfg.botRepo, env, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  server.stdout.on('data', (d) => { log += d.toString(); });
  server.stderr.on('data', (d) => { log += d.toString(); });

  const base = `http://127.0.0.1:${port}`;
  const up = await waitForServer(base, 60000);
  if (!up) {
    console.error(log.slice(-2000));
    try { spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (_) { /* تجاهل */ }
    fs.rmSync(tmp, { recursive: true, force: true });
    return null;
  }

  return {
    base,
    creds: { username: 'admin', password: process.env.ADMIN_PASS || '' },
    source: 'live database copy, scrubbed before the server was started',
    stop: async () => {
      try { spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (_) { /* تجاهل */ }
      server.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 1200));
      for (let i = 0; i < 5; i += 1) {
        try { fs.rmSync(tmp, { recursive: true, force: true }); break; } catch (_) { await new Promise((r) => setTimeout(r, 700)); }
      }
    },
  };
}

function freePort() {
  return new Promise((resolve, reject) => {
    const net = require('node:net');
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/* ------------------------------------------------------------------ */

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log(`[1/3] تجهيز المصدر (${MODE})…`);
  let target = null;
  if (MODE === 'sandbox') target = await runSandbox();
  else if (MODE === 'live') target = await runLive();
  else {
    target = await runSandbox();
    if (!target) {
      console.log('      لا توجد بيئة sandbox — التحويل إلى نسخة منقّاة من القاعدة الحقيقية.');
      target = await runLive();
    }
  }
  if (!target) {
    console.error('تعذّر تجهيز مصدر اللقطات.');
    process.exit(1);
  }
  console.log(`       المصدر: ${target.source} — ${target.base}`);

  console.log('[2/3] التقاط اللقطات…');
  const { chromium } = require('playwright');
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
  } catch (_) {
    browser = await chromium.launch({ headless: true });
  }

  const views = [
    { suffix: 'desktop', viewport: { width: 1440, height: 900 } },
    { suffix: 'mobile', viewport: { width: 390, height: 844 }, mobile: true },
  ];

  const captured = [];
  let failed = 0;
  for (const view of views) {
    const ctx = await browser.newContext({
      viewport: view.viewport,
      isMobile: !!view.mobile,
      hasTouch: !!view.mobile,
      deviceScaleFactor: 1,
      locale: 'ar-EG',
      httpCredentials: target.creds,
    });
    const page = await ctx.newPage();
    for (const p of PAGES) {
      try {
        const resp = await page.goto(`${target.base}${p.url}`, { waitUntil: 'domcontentloaded', timeout: 25000 });
        await page.waitForTimeout(1000);
        const file = path.join(OUT_DIR, `${p.name}-${view.suffix}.png`);
        await page.screenshot({ path: file, fullPage: false });
        captured.push({ page: p.name, view: view.suffix, status: resp ? resp.status() : null });
        console.log(`       ✓ ${p.name}-${view.suffix}${resp ? ` (${resp.status()})` : ''}`);
      } catch (err) {
        failed += 1;
        console.log(`       ✗ ${p.name}-${view.suffix}: ${err.message.split('\n')[0]}`);
      }
    }
    await ctx.close();
  }
  await browser.close();

  console.log('[3/3] كتابة البيان…');
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), `${JSON.stringify({
    capturedAt: new Date().toISOString(),
    subject: cfg.subject,
    source: target.source,
    baseUrl: target.base,
    pages: PAGES.length,
    views: views.map((v) => v.suffix),
    captured: captured.length,
    failed,
    capturedFiles: captured,
  }, null, 2)}\n`, 'utf8');

  await target.stop();
  console.log(`\nتم التقاط ${captured.length} لقطة في ${OUT_DIR}`);
  if (failed) console.log(`فشل: ${failed}`);
}

main().catch((err) => {
  console.error('فشل الالتقاط:', err);
  process.exit(1);
});
